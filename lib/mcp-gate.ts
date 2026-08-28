/**
 * The MCP authorization server's own rules, as pure values and pure functions.
 *
 * **Why this is a file of its own rather than the top of lib/mcp.ts.** These
 * are read by lib/auth.ts, and lib/mcp.ts reaches the drafting model and the
 * metering tables through its imports. Pulling that graph into the file that
 * builds `betterAuth()` would put the AI SDK behind every server module that
 * only wanted a session. So the shared half lives here, with no imports at
 * all, and lib/mcp.ts re-exports it — the MCP surface still has one front door
 * and lib/auth.ts keeps the import graph its own comments argue for.
 *
 * Nothing here touches the database, a request or a clock, which is the point:
 * every rule below is a rule about *this* server and can be asserted in a unit
 * test rather than against a live OAuth round trip.
 */

/**
 * The canonical protected resource, per RFC 8707 and RFC 9728.
 *
 * `@better-auth/mcp` binds every issued access token to this exact string as
 * its `aud` claim, publishes it as `resource` in the protected-resource
 * document, and `requireMcpAuth` refuses a token whose audience is anything
 * else. So it is one value in one place: a mismatch between the plugin and the
 * route is a 401 on every tool call with nothing in a log to say why.
 *
 * Read from `BETTER_AUTH_URL` with the same fallback lib/metadata.ts uses, and
 * inlined rather than imported so this file keeps its "no imports" property.
 * The plugin validates it at boot: HTTPS, no query, no fragment, no
 * credentials — with `http://` allowed on loopback, which is what makes
 * `pnpm dev` work.
 */
/**
 * The origin every value below is derived from.
 *
 * **Asserted in production rather than defaulted.** The fallback exists so
 * `pnpm test` and a first `pnpm dev` work with no env file, and that is all it
 * is for. On a self-hosted deployment the fallback would be actively harmful:
 * `MCP_RESOURCE` is the `aud` on every access token this server signs and the
 * `resource` in the RFC 9728 document, so an unset `BETTER_AUTH_URL` would
 * publish somebody else's domain as this server's identity — and `requireMcpAuth`
 * would refuse every token against it, with a 401 that names nothing.
 *
 * Thrown at import, which is at boot: a deployment that is going to be wrong
 * about its own name should fail where a log is read, not on the first
 * stranger's authorization. docs/self-hosting.md lists it as required.
 */
const CONFIGURED_BASE_URL = process.env.BETTER_AUTH_URL

if (process.env.NODE_ENV === "production" && !CONFIGURED_BASE_URL) {
  throw new Error(
    "BETTER_AUTH_URL is not set. It is the issuer, the OAuth resource identifier " +
      "and the audience on every MCP access token — see docs/self-hosting.md."
  )
}

export const MCP_RESOURCE = `${(
  CONFIGURED_BASE_URL ?? "https://hirequincy.com"
).replace(/\/+$/, "")}/api/mcp`

/**
 * The page a person consents on. Set as `consentPage` on the plugin, and a
 * real route at app/(auth)/consent/page.tsx — a value here with no page behind
 * it is a 404 in the middle of somebody's authorization.
 */
export const MCP_CONSENT_PAGE = "/consent"

/**
 * Where that page posts the answer.
 *
 * `@better-auth/mcp` is `@better-auth/oauth-provider` configured for MCP, so
 * every protocol path is the provider's `/oauth2/*` — there is no `/mcp/*`
 * namespace any more. The body is
 * `{ accept: boolean, oauth_query: string }`, where `oauth_query` is the
 * **whole signed query string** the authorize endpoint put on the consent
 * page's URL. The provider verifies that signature before it reads a single
 * field, which is why the page can hand the query back untouched instead of
 * being trusted to restate it.
 *
 * It answers `{ redirect: true, url }` either way — allowed or denied.
 */
export const MCP_CONSENT_ENDPOINT = "/api/auth/oauth2/consent"

/**
 * What `/.well-known/oauth-authorization-server` advertises, per RFC 8414.
 *
 * Passed to the plugin as `scopes`, which is the single list the provider
 * builds every document from: the authorization-server metadata gets all six,
 * and the protected-resource document gets the two that are about *this*
 * resource — the plugin drops `openid`, `profile`, `email` and
 * `offline_access` from that one itself, because they are facts about the
 * authorization server rather than about the MCP endpoint.
 */
export const MCP_SCOPES_SUPPORTED = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "read",
  "write",
] as const

/**
 * What each scope buys, said the way a person would say it.
 *
 * The consent screen is the only place in the product where somebody decides
 * what a program may do on their behalf, so the words are the feature. A list
 * reading `read`, `write`, `offline_access` asks the reader to guess, and the
 * guess is always generous.
 *
 * `profile` and `email` are folded into `openid` rather than listed three
 * times — the plugin always issues all three together and they name one fact.
 */
const SCOPE_SENTENCES: Record<string, string> = {
  read: "Read your riffs, drafts, lineup, numbers and stories",
  write:
    "Capture riffs and write drafts in your name — never approve or publish",
  openid: "See who you are: your name and email address",
  offline_access: "Stay connected until you remove it, without asking again",
}

/**
 * The requested scopes as sentences, in a fixed order and without duplicates.
 *
 * Order is this file's, not the client's: the two that decide anything come
 * first, so the line that matters is never third. An unknown scope is shown as
 * itself rather than dropped — a scope the reader cannot see is one they cannot
 * refuse, and this server should never be asked for one it does not know.
 */
export function describeScopes(scopes: Iterable<string>): string[] {
  const asked = new Set<string>()

  for (const scope of scopes) {
    // profile and email say the same thing openid says.
    asked.add(scope === "profile" || scope === "email" ? "openid" : scope)
  }

  const ordered = ["read", "write", "offline_access", "openid"]
  const lines: string[] = []

  for (const scope of ordered) {
    if (asked.delete(scope)) {
      lines.push(SCOPE_SENTENCES[scope])
    }
  }

  for (const rest of asked) {
    lines.push(rest)
  }

  return lines
}

/**
 * Whether the account behind a live access token may still be served.
 *
 * Pure so the two refusals can be asserted without standing a route up. Both
 * of them are about a fact that changed *after* the token was minted, which is
 * exactly the class `requireMcpAuth` cannot see: it verifies the token's
 * signature, issuer, audience and expiry against the JWKS and stops there. A
 * 1.7 access token is a self-contained JWT — there is no row to revoke and no
 * row to read — so a fact that changed since issuance can only be caught here.
 *
 * - **No row.** The account was deleted under a token that is still inside its
 *   hour.
 * - **Banned.** The admin plugin ends the browser sessions and knows nothing
 *   about an issued JWT, so an agent connected before the ban keeps working
 *   until that token expires.
 *
 * 401 for both, so a client treats it as an authorization problem and stops,
 * rather than retrying a tool it thinks is broken. The messages differ because
 * the two are different facts; neither says more than the holder of the token
 * already knows.
 */
export type McpAccountVerdict =
  { ok: true } | { ok: false; status: 401; error: string }

export function accountVerdict(
  row: { banned?: boolean | null } | null | undefined
): McpAccountVerdict {
  if (!row) {
    return { ok: false, status: 401, error: "No such account." }
  }

  if (row.banned) {
    return { ok: false, status: 401, error: "This account is suspended." }
  }

  return { ok: true }
}

/**
 * The longest name an agent may register under.
 *
 * The name is shown on the consent screen and on /settings, and it is the only
 * handle a person has on a client. Eighty characters is a label; past that it
 * is a paragraph aimed at whoever reads the Allow button.
 */
export const MCP_CLIENT_NAME_MAX = 80

/**
 * What "Register an agent" on /settings will accept.
 *
 * **Why this is stricter than the plugin.** `@better-auth/oauth-provider`
 * accepts three families of redirect URI: HTTPS on a public host (`web`),
 * `http://` on the exact loopback names (`native`), and reverse-domain
 * private-use schemes such as `com.example.app:/callback` (`native` again).
 * The third is a real part of the spec and is not offered here, because this
 * form is typed by a person from something an agent printed, and a private-use
 * scheme is the one shape where a typo hands the authorization code to a
 * different program on the same machine with no error anywhere. A client that
 * needs one publishes a Client ID Metadata Document instead — that is what
 * CIMD is for, and it proves domain ownership rather than asking a person to
 * read a URI carefully.
 *
 * The `applicationType` this returns is not decoration: the provider validates
 * redirect URIs *against* it, and `web` refuses loopback while `native`
 * refuses HTTPS loopback. Deciding it here from the URI itself is what stops a
 * correct URI being refused by the endpoint for a reason the form never
 * mentioned.
 */
export type AgentRegistration =
  | {
      ok: true
      name: string
      redirectUri: string
      applicationType: "web" | "native"
    }
  | { ok: false; message: string }

const LOOPBACK_NAMES = new Set(["localhost", "[::1]"])

/** Dotted-quad shape. Octet bounds are checked separately, as the provider does. */
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

/**
 * Whether a redirect URI's host is loopback, per RFC 8252 §7.3.
 *
 * **The whole `127.0.0.0/8` block, not just `127.0.0.1`.** §7.3 says a native
 * client may listen on any loopback address, `classifyIPv4` in
 * `@better-auth/core/utils/host` accepts the `/8` behind the provider's
 * `isLoopbackIP`, and the endpoint validates the URI with that. So a form that
 * took only the one literal refused URIs the endpoint would have accepted —
 * and refused them with a sentence naming three spellings, none of which was
 * the one the agent printed. `127.0.0.53` is what a stub resolver answers on,
 * and agents do print it.
 *
 * **Matched as an address, never as a prefix.** `127.example.com` starts with
 * `127.` and is a public DNS name; `isLoopbackIP` says so and would refuse the
 * URI at the endpoint. Accepting it here as `native` is the exact failure this
 * whole function exists to prevent — a correct-looking form followed by a
 * refusal from somewhere the person cannot see.
 *
 * `localhost` and `[::1]` stay exactly as they were. Note the provider is
 * stricter than this on the first: RFC 8252 §8.3 recommends against resolving
 * a name at all. It is kept because it is what agents print and because the
 * provider's own `native` validation accepts it.
 */
function isLoopbackHostname(host: string): boolean {
  const name = host.startsWith("[")
    ? host.slice(0, host.indexOf("]") + 1)
    : host.split(":")[0]

  if (LOOPBACK_NAMES.has(name)) {
    return true
  }

  const octets = IPV4.exec(name)

  if (!octets) {
    return false
  }

  return (
    octets[1] === "127" &&
    octets.slice(1).every((octet) => Number(octet) <= 255)
  )
}

export function readAgentRegistration(input: {
  name: string
  redirectUri: string
}): AgentRegistration {
  const name = input.name.trim()

  if (!name) {
    return { ok: false, message: "Give the agent a name you will recognise." }
  }

  if (name.length > MCP_CLIENT_NAME_MAX) {
    return {
      ok: false,
      message: `That name is longer than ${MCP_CLIENT_NAME_MAX} characters.`,
    }
  }

  const redirectUri = input.redirectUri.trim()

  if (!redirectUri) {
    return {
      ok: false,
      message: "Paste the redirect URI the agent printed.",
    }
  }

  let url: URL

  try {
    url = new URL(redirectUri)
  } catch {
    return {
      ok: false,
      message: "That redirect URI is not a full URL.",
    }
  }

  // A fragment is dropped by every browser before the request is sent, so a
  // registered URI carrying one can never match the one that comes back.
  if (redirectUri.includes("#")) {
    return {
      ok: false,
      message: "A redirect URI cannot carry a fragment.",
    }
  }

  if (url.username || url.password) {
    return {
      ok: false,
      message: "A redirect URI cannot carry credentials.",
    }
  }

  const loopback = isLoopbackHostname(url.host)

  if (url.protocol === "https:") {
    if (loopback) {
      return {
        ok: false,
        message:
          "Use http:// for a loopback address. https:// is for an agent on its own domain.",
      }
    }

    return { ok: true, name, redirectUri, applicationType: "web" }
  }

  if (url.protocol === "http:" && loopback) {
    return { ok: true, name, redirectUri, applicationType: "native" }
  }

  return {
    ok: false,
    message:
      "A redirect URI must be https://, or http:// on localhost, a 127.x.x.x address or [::1].",
  }
}

/**
 * How many clients one account may register.
 *
 * A ceiling on a row a signed-in stranger can create for free. `oauth_client`
 * is written by `/oauth2/create-client`, which is a session and a form — so
 * without a bound, one account can fill the table as fast as a script can post,
 * and every row of it appears on somebody's /settings and in the consent
 * screen's client lookup.
 *
 * Twenty is a tripwire rather than a product limit, the same shape as
 * `MCP_DRAFTS_PER_DAY`: nobody runs twenty agents, and an account that has
 * twenty is a script. A person who genuinely fills it removes one first, which
 * the page already offers.
 */
export const MCP_CLIENTS_PER_USER = 20

/** Whether this account has already registered as many clients as it may. */
export function atAgentLimit(registered: number): boolean {
  return registered >= MCP_CLIENTS_PER_USER
}

/**
 * The provider's admin OAuth endpoints, which this server does not serve.
 *
 * `@better-auth/oauth-provider` registers seven of them under `/admin/oauth2`:
 * `/admin/oauth2/create-client`, `/admin/oauth2/update-client`,
 * `/admin/oauth2/resources`, `/admin/oauth2/resources/:identifier` and
 * `/admin/oauth2/resources/:identifier/clients/:client_id`. All are gated on
 * `clientPrivileges` / `resourcePrivileges`, and an undefined callback degrades
 * to "any authenticated session" — so on a product where anyone can sign up,
 * the gate is no gate. `lib/auth.ts` answers this predicate with 404.
 *
 * A prefix test rather than a list, because two of the paths are parameterised
 * and `disabledPaths` in better-auth is an exact-match `includes`.
 *
 * The exact string is matched as well as the prefix, so a request to
 * `/admin/oauth2` itself is refused rather than falling through on a missing
 * trailing slash. `/oauth2/create-client` — the user-scoped registration
 * /settings uses — does not match either form, and must not: it is the one
 * sanctioned way a person registers an agent.
 */
export function isAdminOAuthPath(path: string): boolean {
  return path === "/admin/oauth2" || path.startsWith("/admin/oauth2/")
}

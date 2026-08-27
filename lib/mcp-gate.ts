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

/** The plugin's own path for the authorization request. */
export const MCP_AUTHORIZE_PATH = "/mcp/authorize"

/** The plugin's own path for RFC 7591 dynamic client registration. */
export const MCP_REGISTER_PATH = "/mcp/register"

/**
 * The page a person consents on. Set as `consentPage` on the plugin, and a
 * real route at app/(auth)/consent/page.tsx — a value here with no page behind
 * it is a 404 in the middle of somebody's authorization.
 */
export const MCP_CONSENT_PAGE = "/consent"

/**
 * Where that page posts the answer.
 *
 * The `mcp` plugin re-exports the OIDC provider's consent endpoint unchanged
 * (`oAuthConsent: provider.endpoints.oAuthConsent`), so the path is the
 * provider's `/oauth2/consent` rather than anything under `/mcp/`. Body is
 * `{ accept: boolean, consent_code?: string }`; the code may also travel in
 * the signed `oidc_consent_prompt` cookie the plugin set on the way here. It
 * answers `{ redirectURI }` either way — allowed or denied.
 */
export const MCP_CONSENT_ENDPOINT = "/api/auth/oauth2/consent"

/**
 * What `/.well-known/oauth-authorization-server` advertises, per RFC 8414.
 *
 * **This has to be passed at the top level of `mcp({...})`, not inside
 * `oidcConfig`.** The plugin builds the authorization-server document from
 * `options.metadata` and the protected-resource document from
 * `options.oidcConfig.metadata` — two different objects, and only the second
 * one was set. A client that reads the first to decide what to ask for saw
 * four OpenID scopes and no sign that `read` or `write` existed.
 */
export const MCP_SCOPES_SUPPORTED = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "read",
  "write",
] as const

export const MCP_METADATA = {
  scopes_supported: [...MCP_SCOPES_SUPPORTED],
}

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
 * What the before-hook in lib/auth.ts must do with a request, from its path.
 *
 * - `pass` — not ours; the hook falls through after one comparison.
 * - `force-consent` — overwrite `prompt` so the consent screen cannot be
 *   skipped by a client that simply does not ask for it.
 * - `require-session` — refuse unless a person is signed in.
 */
export type McpGateStep = "pass" | "force-consent" | "require-session"

export function mcpGateStep(path: string): McpGateStep {
  if (path === MCP_AUTHORIZE_PATH) {
    return "force-consent"
  }

  if (path === MCP_REGISTER_PATH) {
    return "require-session"
  }

  return "pass"
}

/**
 * The authorization query, with consent made mandatory.
 *
 * **Why the server decides this and not the client.** The plugin issues the
 * code immediately when `prompt` is anything other than `consent`
 * (`plugins/mcp/authorize.mjs`), so a client that omits `prompt` — which is
 * most of them, since it is optional in OAuth — gets a token the moment the
 * owner is signed in, with no screen and nothing to say no to. Forcing the
 * value here means the only path to a token runs through a page that names
 * the client and the scopes.
 *
 * `prompt` may legitimately carry more than one value (`login consent`), and
 * the plugin's after-hook strips `login` after the login round trip and keeps
 * the rest. Any other value is replaced rather than appended, because the
 * plugin compares the whole string to `"consent"` — `"none consent"` would
 * read as "not consent" and skip the screen.
 *
 * Mutates in place and returns the same object. That is load-bearing: a
 * before-hook is handed a shallow copy of the context
 * (`api/dispatch.mjs`, `runBeforeHooks`), so reassigning `ctx.query` writes to
 * the copy and is thrown away, while writing `ctx.query.prompt` reaches the
 * object the endpoint reads.
 */
export function forceConsentPrompt<
  T extends Record<string, unknown> | undefined | null,
>(query: T): T {
  if (query) {
    ;(query as Record<string, unknown>).prompt = "consent"
  }

  return query
}

/**
 * Whether the account behind a live access token may still be served.
 *
 * Pure so the two refusals can be asserted without standing a route up. Both
 * of them are about a fact that changed *after* the token was minted, which is
 * exactly the class `withMcpAuth` cannot see: it checks the token against
 * `oauth_access_token` and stops there.
 *
 * - **No row.** The account was deleted under a token that is still inside its
 *   hour.
 * - **Banned.** The admin plugin ends the browser sessions and knows nothing
 *   about `oauth_access_token`, so an agent connected before the ban keeps
 *   working for an hour — and its refresh token keeps minting new ones for a
 *   week after that.
 *
 * 401 for both, so a client treats it as an authorization problem and stops,
 * rather than retrying a tool it thinks is broken. The messages differ because
 * the two are different facts; neither says more than the holder of the token
 * already knows.
 */
export type McpAccountVerdict =
  | { ok: true }
  | { ok: false; status: 401; error: string }

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
 * What a stranger POSTing to `/mcp/register` is told.
 *
 * RFC 7591 allows anonymous registration and the plugin implements it that
 * way. We trade it for a smaller attack surface: an unauthenticated POST
 * writes a row to `oauth_application` for anyone who can reach the origin, and
 * a client nobody owns cannot be listed on /settings or removed there either.
 * An MCP client is registered by the person who is going to use it, so the
 * registration is done from a browser that is already signed in.
 */
export const MCP_REGISTER_REFUSAL =
  "Register an MCP client while signed in to Quincy. See docs/mcp.md."

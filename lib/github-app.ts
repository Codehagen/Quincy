import { createHmac, createSign, timingSafeEqual } from "node:crypto"

/**
 * The GitHub App itself — the credential, not the material. See plans/021.
 *
 * Everything in here is **app-level**, which is the one structural difference
 * between GitHub and every source before it. Circleback mints a secret per
 * connection and puts a token in the URL, so `source_connection` holds both and
 * lib/source-connections.ts is the whole story. A GitHub App has one webhook
 * URL, one signing secret and one private key across every installation, and
 * none of that can live on a per-user row.
 *
 * So the split is: this module owns what the deployment knows, and
 * lib/source-connections.ts owns what a user's installation knows. The webhook
 * verifies with the first and attributes with the second, in that order — the
 * URL is public by design here, so the signature is the whole of the
 * authentication rather than half of it.
 *
 * **Nothing here reads a diff.** The app asks for `pull_requests: read` because
 * the webhook subscription requires the permission, and the installation token
 * below exists only to read back the installation during setup. plans/021
 * decision 1 is why: the description is the material, measured at a median of
 * 3,369 characters against a median diff 51 times larger, and every
 * description fits in a prompt while almost no diff does.
 */

/** Set once the app exists. Their absence is what makes the creation flow reachable. */
export function githubAppConfig(): {
  appId: string
  privateKey: string
  webhookSecret: string
  slug: string
} | null {
  const appId = process.env.GITHUB_APP_ID
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY
  const webhookSecret = process.env.GITHUB_APP_WEBHOOK_SECRET
  const slug = process.env.GITHUB_APP_SLUG

  if (!appId || !privateKey || !webhookSecret || !slug) return null

  return {
    appId,
    /**
     * Newlines survive the round trip through an environment variable.
     *
     * GitHub hands back a PKCS#1 PEM with real line breaks in it. Vercel's
     * dashboard keeps them, `vercel env pull` writes them into a quoted
     * `.env.local` as the two characters backslash-n, and `createSign` rejects
     * a key whose armour is one long line with a message that names neither
     * the cause nor this file. Unescaping here costs nothing and is correct
     * for both spellings.
     */
    privateKey: privateKey.replace(/\\n/g, "\n"),
    webhookSecret,
    slug,
  }
}

export function isGithubAppConfigured(): boolean {
  return githubAppConfig() !== null
}

/**
 * Is this delivery really from GitHub?
 *
 * `X-Hub-Signature-256`, `sha256=` followed by the hex HMAC-SHA256 of the raw
 * body. The three rules lib/source-connections.ts states for Circleback hold
 * here word for word and are not re-argued: raw bytes only, `timingSafeEqual`
 * rather than `===`, and no secret means no.
 *
 * One addition GitHub needs. **The signature is checked before the body is
 * parsed and before anything is resolved**, which is the reverse of the
 * Circleback route's order. There the path token narrows a request to one user
 * before any work happens; here the URL is the same for everybody and public,
 * so the signature is the only thing standing between a stranger and a database
 * lookup. Resolving first would let anyone probe which installations exist.
 */
export function verifyGithubSignature(
  rawBody: string,
  header: string | null
): boolean {
  const config = githubAppConfig()
  if (!config) return false
  if (!header) return false

  const provided = header.trim()

  // GitHub always prefixes the algorithm. Refusing an unprefixed value rather
  // than tolerating it keeps this from silently accepting the older
  // `X-Hub-Signature` SHA-1 digest if a caller sends that header's value here.
  if (!provided.startsWith("sha256=")) return false

  const expected = `sha256=${createHmac("sha256", config.webhookSecret)
    .update(rawBody)
    .digest("hex")}`

  // Checked first because `timingSafeEqual` throws on a length mismatch rather
  // than returning false. The length of a hex digest is not a secret.
  if (provided.length !== expected.length) return false

  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
}

/**
 * A JWT signed with the app's private key, good for ten minutes.
 *
 * The only credential that can read `/app/installations/{id}`, which is the one
 * call the setup flow makes. RS256 by hand rather than a dependency: it is a
 * header, a payload and a signature over their base64url concatenation, and a
 * JWT library here would be a supply-chain surface for forty lines.
 *
 * `iat` is backdated sixty seconds. GitHub rejects a token whose `iat` is in
 * its future, and a laptop or a function whose clock runs a second fast is
 * enough to trigger it — this is the drift allowance GitHub's own
 * documentation recommends.
 *
 * **`exp` is eight minutes, not ten**, and the two minutes are the same drift
 * allowance spent at the other end. GitHub's documented maximum is ten minutes
 * and it is measured against *GitHub's* clock, so a host running ninety
 * seconds fast pushes a ten-minute token past the limit and every call 401s.
 * The only caller is the install callback, which runs once per user and has no
 * retry — so the failure would read as "installing did nothing", and eight
 * minutes is still five hundred times longer than the one request needs.
 */
export function appJwt(): string {
  const config = githubAppConfig()
  if (!config) throw new Error("The GitHub App is not configured.")

  const now = Math.floor(Date.now() / 1000)

  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const payload = base64url(
    JSON.stringify({ iat: now - 60, exp: now + 480, iss: config.appId })
  )

  const signature = createSign("RSA-SHA256")
    .update(`${header}.${payload}`)
    .sign(config.privateKey)
    .toString("base64url")

  return `${header}.${payload}.${signature}`
}

function base64url(value: string): string {
  return Buffer.from(value).toString("base64url")
}

export type GithubInstallation = {
  id: number
  account: string
  accountType: string
  repositorySelection: string
}

/**
 * Read an installation back from GitHub, by id.
 *
 * The setup callback's one job that cannot be done from the redirect alone.
 * GitHub sends `?installation_id=` in the query string and nothing else, and a
 * query string is something the browser can edit — so the id is confirmed
 * against the API with the app's own credential before a row is written for it.
 * Without this, pasting somebody else's installation id into the callback URL
 * would attach their merges to your account.
 */
export async function fetchInstallation(
  installationId: number
): Promise<GithubInstallation | null> {
  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}`,
    {
      headers: {
        authorization: `Bearer ${appJwt()}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "quincy",
      },
    }
  )

  if (!response.ok) return null

  const body = (await response.json()) as {
    id?: number
    account?: { login?: string; type?: string }
    repository_selection?: string
  }

  if (typeof body.id !== "number") return null

  return {
    id: body.id,
    account: body.account?.login ?? "",
    accountType: body.account?.type ?? "",
    repositorySelection: body.repository_selection ?? "",
  }
}

/**
 * Where "Install on GitHub" goes.
 *
 * `/installations/new` rather than the app's page: it takes the user straight
 * to the repository picker, and GitHub returns them to the app's configured
 * setup URL afterwards.
 */
export function installUrl(): string | null {
  const config = githubAppConfig()
  if (!config) return null
  return `https://github.com/apps/${config.slug}/installations/new`
}

/**
 * The app manifest, which is the only way to create a GitHub App without
 * filling in a form by hand.
 *
 * GitHub has no API to create an app. The manifest flow is the documented
 * substitute: POST this JSON to github.com/settings/apps/new as a form field,
 * the operator clicks one button, and GitHub redirects back with a code that
 * converts into the app id, the private key and the webhook secret in a single
 * call. That is the difference between a setup step somebody can follow and a
 * page of instructions about copying four secrets out of a settings screen.
 *
 * **`default_events` is `pull_request` and nothing else**, and the permissions
 * are the two GitHub requires to deliver it. An app that asked for `contents`
 * so it could read a diff would be asking every future user for read access to
 * all of their source code — which decision 1 already established buys nothing.
 */
export function githubAppManifest(baseUrl: string, name: string) {
  return {
    name,
    url: baseUrl,
    /**
     * Where GitHub sends the user after they install. Not the OAuth callback —
     * a setup URL fires on installation rather than on authorisation, which is
     * what this flow needs, and it means the app requests no user token at all.
     */
    setup_url: `${baseUrl}/api/connect/github/callback`,
    redirect_url: `${baseUrl}/api/connect/github/app/created`,
    hook_attributes: {
      url: `${baseUrl}/api/webhooks/github`,
      active: true,
    },
    public: true,
    default_events: ["pull_request"],
    default_permissions: {
      // Required to receive `pull_request` at all.
      pull_requests: "read",
      // Required alongside any other permission. Repository names and ids.
      metadata: "read",
    },
    /** Setup is one redirect, so there is nothing for the user to come back to. */
    setup_on_update: false,
  }
}

/**
 * An installation access token, for reading a user's repositories.
 *
 * **Not `githubInstallationToken` in lib/source-connections.ts.** That one mints
 * `ghi_<id>` — the string Quincy stores on its own `source_connection` row to
 * recognise an installation later. This one is a GitHub credential, minted by
 * GitHub, that authorises API calls on the installation's behalf. The two have
 * nothing in common but the word "token", and confusing them means sending
 * `ghi_47` to api.github.com and reading a 401 as "the user has no pull
 * requests".
 *
 * The app JWT can read *about* an installation (`fetchInstallation`) and cannot
 * read *through* it. Anything touching repositories or pull requests needs this.
 *
 * Short-lived by GitHub's design — an hour — so it is minted per use and never
 * stored. A cached one would be a credential at rest with no rotation story, in
 * exchange for saving a request on a path that runs once per install.
 */
export async function installationAccessToken(
  installationId: number
): Promise<string | null> {
  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${appJwt()}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "quincy",
      },
    }
  )

  if (!response.ok) return null

  const body = (await response.json()) as { token?: string }
  return typeof body.token === "string" ? body.token : null
}

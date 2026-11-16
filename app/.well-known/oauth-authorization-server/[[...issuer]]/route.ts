import { connection } from "next/server"
import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider"

import { auth } from "@/lib/auth"

/**
 * RFC 8414 authorization server metadata, at both paths a client looks for.
 *
 * **Why a catch-all and not a plain route.** RFC 8414 §3.1 puts the document at
 * the well-known prefix *plus the issuer's path component* — not at the bare
 * prefix — whenever the issuer has one. This issuer does:
 * `${BETTER_AUTH_URL}/api/auth`, because `basePath` is `/api/auth` and the
 * `jwt` plugin takes the base URL as its issuer. So the canonical URL is
 * `/.well-known/oauth-authorization-server/api/auth`, and that is exactly what
 * the plugin serves: `handleIssuerMetadataRequest` matches on the set
 * `{ /.well-known/oauth-authorization-server<issuerPath>,
 *   <issuerPath>/.well-known/oauth-authorization-server }` and on nothing else.
 * The bare path is not in it.
 *
 * The two branches below are therefore different in kind, not a fallback pair:
 *
 * - **Any suffix** is handed to `auth.handler`. The plugin serves the document
 *   from an `onRequest` hook that runs before Better Auth routes anything and
 *   matches the full pathname, so passing the original request through is
 *   enough — and the document that comes back is the plugin's own rather than a
 *   copy that could drift. A suffix the plugin does not recognise falls through
 *   its router and 404s, which is the honest answer.
 * - **The bare path** has no server-side hook behind it at all, so it is served
 *   from `oauthProviderAuthServerMetadata`, the plugin's exported helper for
 *   exactly this case: it calls the same server-only endpoint and returns its
 *   JSON. It is kept because clients that predate the path-suffix rule ask here
 *   first, and answering costs one route.
 *
 * `proxy.ts` lets both through: its `.well-known/oauth-authorization-server`
 * entry is deliberately unanchored, so the prefix covers the suffixed form too.
 *
 * Nothing here is a secret. It is issuer, endpoints, supported scopes, and
 * `code_challenge_methods_supported: ["S256"]` — the last of which is how a
 * client knows PKCE is required before it builds the request.
 */
const serve = oauthProviderAuthServerMetadata(auth)

/**
 * `connection()` before anything, and this is not a preference.
 *
 * Cache Components is on (next.config.ts), so a route handler that reads
 * nothing from the request is prerendered at build time. This one must not be:
 * the document names the issuer, which is resolved from the *running* server's
 * base URL, and building it boots the OAuth provider — which reads
 * `oauth_resource`. At build time that is a query against the production
 * database from a machine that is not production, and until the migration in
 * scripts/mcp-oauth.sql has run it is a query against a table that does not
 * exist. Awaiting a connection is how a route says "there is a request behind
 * this or there is nothing"; `export const dynamic` is rejected outright with
 * Cache Components enabled.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ issuer?: string[] }> }
) {
  await connection()

  const { issuer } = await context.params

  return issuer?.length ? auth.handler(request) : serve(request)
}

export const HEAD = GET

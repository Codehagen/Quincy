import { connection } from "next/server"

import { auth } from "@/lib/auth"

/**
 * RFC 9728 protected resource metadata: "this resource is guarded, and here is
 * the server that guards it."
 *
 * This is the document `WWW-Authenticate` on the 401 from `/api/mcp` points
 * at, and it is what turns a refused request into a working authorization flow
 * without anybody typing a URL.
 *
 * **Why a catch-all and not a plain route.** RFC 9728 puts the metadata for a
 * resource with a path at the well-known prefix *plus that path*, so a client
 * given `https://hirequincy.com/api/mcp` fetches
 * `/.well-known/oauth-protected-resource/api/mcp`. That is the URL
 * `@better-auth/mcp` writes into the challenge header itself
 * (`resolveResourceMetadataUrl`), and it is the one an MCP 2026-07-28 client
 * follows. The bare path is served too, because several clients ask for it
 * first. One optional catch-all segment covers both and nothing else.
 *
 * **Why `auth.handler` and not an exported helper.** The plugin serves this
 * document from its `onRequest` hook rather than from an endpoint, so there is
 * no `auth.api.*` to call and no `oauthProvider*Metadata` export for it. The
 * hook runs before Better Auth routes anything, and it matches on the full
 * pathname — so handing it the original request is enough, and the document
 * that comes back is the plugin's, not a copy of it that could drift.
 *
 * Nothing here is a secret: the resource identifier, the authorization server
 * that guards it, and the two scopes that apply to it.
 */
/**
 * `connection()` first, for the reason its neighbour spells out: Cache
 * Components would otherwise prerender this at build time, and the document is
 * built from the running server's base URL and the provider's own state.
 */
export async function GET(request: Request) {
  await connection()
  return auth.handler(request)
}

export const HEAD = GET

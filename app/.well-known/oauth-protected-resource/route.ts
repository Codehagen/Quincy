import { oAuthProtectedResourceMetadata } from "better-auth/plugins"

import { auth } from "@/lib/auth"

/**
 * RFC 9728 protected resource metadata: "this resource is guarded, and here is
 * the server that guards it."
 *
 * This is the document `WWW-Authenticate` on the 401 from `/api/mcp` points at,
 * and it is what turns a refused request into a working authorization flow
 * without anybody typing a URL. Same reasoning as its neighbour: some clients
 * fetch it from the origin rather than following the header, so it is served
 * from both places.
 */
export const GET = oAuthProtectedResourceMetadata(auth)

import { oAuthDiscoveryMetadata } from "better-auth/plugins"

import { auth } from "@/lib/auth"

/**
 * RFC 8414 authorization server metadata, at the path clients look for first.
 *
 * The `mcp` plugin already serves this under `/api/auth`, and a well-behaved
 * client would find it there: the 401 from `/api/mcp` carries a
 * `WWW-Authenticate` header naming the protected-resource document, which names
 * the authorization server. Several clients skip that chain and go straight to
 * the origin's `/.well-known/oauth-authorization-server`, which is why Better
 * Auth documents this file. Without it those clients report "no authorization
 * server" and there is nothing in any log to say why.
 *
 * Nothing here is a secret. It is issuer, endpoints, supported scopes, and
 * `code_challenge_methods_supported: ["S256"]` — the last of which is how a
 * client knows PKCE is required before it builds the request.
 */
export const GET = oAuthDiscoveryMetadata(auth)

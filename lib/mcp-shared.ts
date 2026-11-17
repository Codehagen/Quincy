/**
 * The MCP values a client component may import.
 *
 * Nothing here reads the environment, on purpose. lib/mcp-gate.ts throws at
 * module load in a production build when BETTER_AUTH_URL is unset, which is
 * right on the server and always true in the browser: a "use client" file that
 * imported a constant from it crashed /settings and /consent in production.
 * Keep this file free of env reads and server-only imports so that cannot
 * happen again; lib/mcp-gate.ts re-exports these for the server.
 */

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
 * The longest name an agent may register under.
 *
 * The name is shown on the consent screen and on /settings, and it is the only
 * handle a person has on a client. Eighty characters is a label; past that it
 * is a paragraph aimed at whoever reads the Allow button.
 */
export const MCP_CLIENT_NAME_MAX = 80

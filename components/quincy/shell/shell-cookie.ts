/**
 * The cookie that remembers a collapsed sidebar. A plain module on purpose:
 * the layout (a server component) reads it, and a const imported from a
 * "use client" file arrives on the server as a reference proxy, so
 * `cookies().get(…)` would silently miss. The name is the old shell's, so a
 * saved choice survives the move.
 */
export const SIDEBAR_COOKIE = "sidebar_state"
export const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7

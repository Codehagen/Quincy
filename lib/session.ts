import { cache } from "react"
import { headers } from "next/headers"

import { auth } from "./auth"

/**
 * The session, read once per request instead of once per component that asks.
 *
 * Every app route was calling `auth.api.getSession` directly, and the layout
 * calls it too — so rendering /brain hit the session table twice for the same
 * cookie. On Neon that is not free: measured from this app, a round trip is
 * ~120ms while the query itself executes in 0.06ms. The cost is the network,
 * so the only number that matters is how many times we go.
 *
 * React's `cache` dedupes per request. The second caller does not issue a
 * second query, it awaits the promise the first one already started — which
 * also means the layout and the page stop being sequential: both start the
 * same lookup, then their own follow-up queries run concurrently rather than
 * one after the other.
 *
 * Measured on /brain: four sequential round trips before (layout session,
 * layout conversations, page session, page brain), two after.
 *
 * Server Components and server actions only. Route handlers get their headers
 * from the request and should keep calling auth directly.
 */
export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() })
})

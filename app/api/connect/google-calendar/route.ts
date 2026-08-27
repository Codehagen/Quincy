import { NextResponse } from "next/server"

import {
  beginCalendarConnect,
  CALENDAR_COOKIE,
  CALENDAR_COOKIE_MAX_AGE,
  isCalendarEnabled,
} from "@/lib/calendar"
import { getSession } from "@/lib/session"

/**
 * Start of the calendar handshake. Redirects to Google's consent screen.
 *
 * The shape of `app/api/connect/[channel]/route.ts` and not a case inside it:
 * that route keys on `ConnectableChannel`, and a calendar is not a channel —
 * nothing is ever published to it, no starter slots are written for it, and
 * `saveConnection` writes a table this source does not use. What is borrowed is
 * the two decisions that file learned the hard way.
 *
 * There is deliberately no `next` parameter. This flow is only ever started
 * from /sources, and an allowlist of one is a literal — `resolveReturnTo`
 * exists next door for the flow that needed more than one page.
 *
 * A GET that causes a redirect rather than a POST that returns a URL: the
 * browser has to end up on another origin either way, and a link is the
 * simplest thing that can do it. Nothing is written here — the only side effect
 * is a short-lived cookie, and abandoning the flow leaves nothing behind.
 */
export async function GET() {
  const session = await getSession()

  const home = process.env.BETTER_AUTH_URL ?? "http://localhost:3000"

  if (!session) {
    return Response.redirect(new URL("/login?next=/sources", home), 302)
  }

  if (!isCalendarEnabled()) {
    // A Connect button that fails on click is worse than no button, and the row
    // hides it — this is the belt for a URL somebody kept.
    return Response.redirect(new URL("/sources?calendar=unconfigured", home), 302)
  }

  const { url, handshake } = await beginCalendarConnect()

  /**
   * The cookie goes on *this* response, not through `cookies().set()`.
   *
   * That store writes to the response Next builds for the handler, and a
   * pending Set-Cookie does not reliably reach a bare `Response.redirect()` the
   * handler builds itself — the redirect leaves, the handshake never lands, and
   * the callback answers `expired` for a request that was never going to work.
   * Learned in `app/api/connect/[channel]/route.ts`; not relearned here.
   */
  const response = NextResponse.redirect(url, 302)

  response.cookies.set(CALENDAR_COOKIE, JSON.stringify(handshake), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // The callback is a top-level GET navigation from Google's origin, which
    // "lax" permits and "strict" would not — under strict the cookie is
    // withheld and every connection fails state validation.
    sameSite: "lax",
    // Narrower than the channel handshake's `/api/connect`, so a calendar flow
    // and a channel flow can be in the air at the same time without either
    // reading the other's cookie.
    path: "/api/connect/google-calendar",
    maxAge: CALENDAR_COOKIE_MAX_AGE,
  })

  return response
}

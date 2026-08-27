import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import {
  CALENDAR_COOKIE,
  exchangeCalendarCode,
  saveCalendarConnection,
  type CalendarHandshake,
} from "@/lib/calendar"
import { getSession } from "@/lib/session"

/**
 * Where Google sends the person back.
 *
 * Every outcome is a redirect to /sources with one query parameter. Rendering
 * an error body at a URL whose query string the provider controls is how a
 * callback becomes a reflected-content surface, and it strands the person on a
 * blank page at an /api path they cannot navigate away from.
 */

/** Every exit, and the only place the handshake is cleared. */
function back(params: Record<string, string>): NextResponse {
  const url = new URL(
    "/sources",
    process.env.BETTER_AUTH_URL ?? "http://localhost:3000"
  )

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }

  const response = NextResponse.redirect(url, 302)
  /**
   * Cleared here rather than at the top, and on the response rather than
   * through the cookie store.
   *
   * A pending `cookies().delete()` does not reliably reach a redirect the
   * handler builds itself, so the single-use handshake would survive the round
   * trip and stay replayable. On a NextResponse the expiry is a header on the
   * object being returned.
   */
  response.cookies.set(CALENDAR_COOKIE, "", {
    path: "/api/connect/google-calendar",
    maxAge: 0,
  })
  return response
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams

  if (query.get("error")) {
    // access_denied and friends. Not a fault — somebody changed their mind at
    // the consent screen.
    return back({ calendar: "cancelled" })
  }

  const session = await getSession()

  if (!session) {
    return back({ calendar: "signed_out" })
  }

  // Read only. `back()` is what clears it, so every exit retires the handshake
  // exactly once.
  const raw = (await cookies()).get(CALENDAR_COOKIE)?.value

  if (!raw) {
    return back({ calendar: "expired" })
  }

  let handshake: CalendarHandshake

  try {
    handshake = JSON.parse(raw) as CalendarHandshake
  } catch {
    return back({ calendar: "bad_handshake" })
  }

  const state = query.get("state")
  const code = query.get("code")

  // Both checks before the code is spent. The state comparison is the CSRF
  // guard and there is nothing else this cookie is for.
  if (!state || !handshake.state || state !== handshake.state) {
    return back({ calendar: "state_mismatch" })
  }

  if (!code) {
    return back({ calendar: "no_code" })
  }

  try {
    const tokens = await exchangeCalendarCode({
      code,
      codeVerifier: handshake.codeVerifier,
    })

    /**
     * No refresh token is a connection that works for one hour and then looks
     * broken for no reason anybody can see — so it is refused here rather than
     * stored and discovered by a cron at 03:00.
     *
     * It should not happen: the start route sends `access_type=offline` and
     * `prompt=consent`, which is the pair Google documents as the condition for
     * issuing one. It is checked anyway, because AGENTS.md is right that a
     * comment explaining why a guard is unnecessary is the smell the guard
     * exists for.
     */
    if (!tokens.refreshToken) {
      return back({ calendar: "no_refresh" })
    }

    await saveCalendarConnection({
      userId: session.user.id,
      refreshToken: tokens.refreshToken,
    })

    return back({ calendar: "connected" })
  } catch (error) {
    // The message can carry a fragment of Google's response, so it is logged
    // rather than put in the URL.
    console.error("[connect] calendar callback failed", error)
    return back({ calendar: "failed" })
  }
}

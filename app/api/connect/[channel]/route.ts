import { NextResponse } from "next/server"

import { getSession } from "@/lib/session"
import {
  beginConnect,
  CONNECT_COOKIE,
  CONNECT_COOKIE_MAX_AGE,
  isChannelEnabled,
  isConnectableChannel,
  resolveReturnTo,
} from "@/lib/channels"

/**
 * Start of the connect handshake. Redirects to the platform's consent screen.
 *
 * A GET that causes a redirect rather than a POST that returns a URL, because
 * the browser has to end up on another origin either way and a link is the
 * simplest thing that can do it. Nothing is written here — the only side effect
 * is a short-lived cookie, and abandoning the flow leaves nothing behind.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ channel: string }> }
) {
  const { channel } = await params

  // Reject unknown channels before touching the session, so this route cannot
  // be used to probe which strings are valid.
  if (!isConnectableChannel(channel)) {
    return new Response("Not found", { status: 404 })
  }

  const session = await getSession()

  if (!session) {
    return Response.redirect(
      new URL(
        `/login?next=/channels/${channel}`,
        process.env.BETTER_AUTH_URL ?? "http://localhost:3000"
      ),
      302
    )
  }

  if (!isChannelEnabled(channel)) {
    return Response.redirect(
      new URL(
        `/channels/${channel}?error=not_configured`,
        process.env.BETTER_AUTH_URL ?? "http://localhost:3000"
      ),
      302
    )
  }

  /**
   * Where to come back to. First run passes `?next=/welcome` so the round trip
   * out to the provider lands back inside the flow instead of dropping the
   * person on /channels with the wiring half done.
   *
   * Resolved here rather than trusted: `resolveReturnTo` compares against
   * published literals, so an unknown or hostile value becomes null and the
   * callback falls back to /channels/<channel>.
   */
  const next = resolveReturnTo(
    new URL(request.url).searchParams.get("next")
  )

  const { url, handshake } = await beginConnect(channel, next)

  /**
   * The cookie goes on *this* response, not through `cookies().set()`.
   *
   * That store writes to the response Next builds for the handler. A bare
   * `Response.redirect()` is a response the handler builds instead, and the
   * pending Set-Cookie does not reliably make it onto one — the redirect
   * leaves, the handshake never lands in the browser, and the callback answers
   * `error=expired` for a request that was never going to work. Setting it on
   * a NextResponse removes the ambiguity: the header is on the object being
   * returned.
   */
  const response = NextResponse.redirect(url, 302)

  response.cookies.set(CONNECT_COOKIE, JSON.stringify(handshake), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // The callback is a top-level GET navigation from the provider's origin,
    // which "lax" permits and "strict" would not — under strict the cookie is
    // withheld and every connection fails state validation.
    sameSite: "lax",
    path: "/api/connect",
    maxAge: CONNECT_COOKIE_MAX_AGE,
  })

  return response
}

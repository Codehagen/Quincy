import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import { getSession } from "@/lib/session"
import {
  CONNECT_COOKIE,
  exchangeCode,
  fetchProfile,
  isConnectableChannel,
  resolveReturnTo,
  saveConnection,
  type ConnectHandshake,
} from "@/lib/channels"
import { ensureStarterSlots } from "@/lib/scheduling"

/**
 * Where the platform sends the person back.
 *
 * Every outcome is a redirect to /channels/<channel>, or to whichever page the
 * handshake asked for out of a published allowlist. Rendering an error body at
 * a URL the provider controls the query string of is how a callback becomes a
 * reflected-content surface, and it strands the person on a blank page at an
 * /api path they cannot navigate away from.
 */

/**
 * Every exit from this route, and the only place the handshake is cleared.
 *
 * The clear happens here rather than at the top for the same reason the start
 * route sets it on its own response: a pending `cookies().delete()` does not
 * reliably reach a `Response.redirect()` the handler builds itself, so the
 * single-use handshake would survive the round trip and stay replayable. On a
 * NextResponse the expiry is a header on the object being returned.
 */
function back(
  channel: string,
  params: Record<string, string>,
  /**
   * Already through `resolveReturnTo`. Null means the default home, which is
   * every case this route had before first run existed.
   */
  next: string | null = null
): NextResponse {
  const url = new URL(
    next ?? `/channels/${channel}`,
    process.env.BETTER_AUTH_URL ?? "http://localhost:3000"
  )

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }

  const response = NextResponse.redirect(url, 302)
  response.cookies.set(CONNECT_COOKIE, "", { path: "/api/connect", maxAge: 0 })
  return response
}

/**
 * The `next` field alone, out of a cookie that may be malformed.
 *
 * Separate from the `JSON.parse` further down, which happens only after the
 * session and presence checks and whose failure is a reportable error. This
 * one is allowed to find nothing and say so.
 */
function readNext(raw: string | undefined): string | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<ConnectHandshake>
    return typeof parsed.next === "string" ? parsed.next : null
  } catch {
    return null
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ channel: string }> }
) {
  const { channel } = await params

  if (!isConnectableChannel(channel)) {
    return new Response("Not found", { status: 404 })
  }

  // Read only. `back()` is what clears it, on the response it returns, so
  // every exit from this route retires the handshake exactly once.
  const raw = (await cookies()).get(CONNECT_COOKIE)?.value

  /**
   * Where to return to, read before anything else is checked.
   *
   * Four of this route's exits fire before the handshake is validated —
   * cancelled, signed_out, expired, bad_handshake — and someone who abandons
   * the consent screen during first run should land back in first run, not on
   * a page they have never seen. So `next` is pulled out of the raw cookie
   * ahead of the state check.
   *
   * That is safe precisely because it is not trusted: `resolveReturnTo`
   * compares against published literals, so the worst a forged cookie can do
   * here is choose between pages we already publish. Nothing else is read from
   * the cookie until the CSRF and channel checks below have passed.
   */
  const next = resolveReturnTo(readNext(raw))

  const query = new URL(request.url).searchParams

  if (query.get("error")) {
    // user_cancelled_authorize and friends. Not a fault — someone changed
    // their mind at the consent screen.
    return back(channel, { error: "cancelled" }, next)
  }

  const session = await getSession()

  if (!session) {
    return back(channel, { error: "signed_out" }, next)
  }

  if (!raw) {
    return back(channel, { error: "expired" }, next)
  }

  let handshake: ConnectHandshake

  try {
    handshake = JSON.parse(raw) as ConnectHandshake
  } catch {
    return back(channel, { error: "bad_handshake" }, next)
  }

  const state = query.get("state")
  const code = query.get("code")

  // Three checks, all before the code is spent. The state comparison is the
  // CSRF guard; the channel comparison stops a handshake begun for one
  // platform from being completed against another.
  if (!state || !handshake.state || state !== handshake.state) {
    return back(channel, { error: "state_mismatch" }, next)
  }

  if (handshake.channel !== channel) {
    return back(channel, { error: "channel_mismatch" }, next)
  }

  if (!code) {
    return back(channel, { error: "no_code" }, next)
  }

  try {
    const tokens = await exchangeCode(channel, {
      code,
      codeVerifier: handshake.codeVerifier,
    })

    const profile = await fetchProfile(channel, tokens.accessToken)

    await saveConnection({
      userId: session.user.id,
      channel,
      profile,
      tokens,
    })

    /**
     * A channel you can publish to, with nowhere to publish, is where every
     * new account used to land. Connecting is the moment somebody says
     * "publish here", so it is the moment the standing rhythm is written —
     * two rows, visible on /lineup, removable in one press. See
     * `STARTER_RHYTHM` in lib/slots.ts.
     *
     * After the connection rather than before: a handshake that fails leaves
     * no channel and must leave no slots for it either. Awaited rather than
     * fired off, because the redirect can land on /lineup and a slot that
     * appears one render later reads as the page forgetting.
     *
     * It never overwrites a rhythm — see `ensureStarterSlots` — so a reconnect
     * changes nothing here. A failure to write it is not a failure to connect,
     * which is why it cannot throw out of this branch and turn a working
     * connection into `exchange_failed`.
     */
    try {
      await ensureStarterSlots({ userId: session.user.id, channel })
    } catch (error) {
      console.error(`[connect] ${channel} starter slots failed`, error)
    }

    return back(channel, { connected: "1" }, next)
  } catch (error) {
    // The message can carry a fragment of the provider's response, so it is
    // logged rather than put in the URL.
    console.error(`[connect] ${channel} callback failed`, error)
    return back(channel, { error: "exchange_failed" }, next)
  }
}

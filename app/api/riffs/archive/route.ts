import { headers } from "next/headers"
import { NextResponse } from "next/server"

import { auth } from "@/lib/auth"
import { archiveRiffFor } from "@/lib/riff-archive"

/**
 * The Dismiss on /ideas, written as the page goes away.
 *
 * Dismiss hides a riff at once and holds the archive back while its Undo is on
 * screen (components/riffs/use-ideas.ts). If the tab closes or the page is
 * hidden for good in that window, a server action cannot be trusted to finish:
 * it is a fetch the browser is free to cancel. The screen calls this route
 * with `fetch(..., { keepalive: true })` instead, which the browser lets
 * outlive the page.
 *
 * The same write as `archiveRiff`, through the same helper: the user comes from
 * the session, and the row is matched on its id *and* that user's id in one
 * statement. The riff id in the body proves nothing on its own.
 *
 * Same-origin only. A cookie-authenticated POST that changes state is a CSRF
 * target, and nothing here needs to be reachable from another site.
 */
export async function POST(request: Request) {
  const site = request.headers.get("sec-fetch-site")
  if (site && site !== "same-origin") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 })
  }
  const origin = request.headers.get("origin")
  if (origin && !sameHost(origin, request)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 })
  }

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 })
  }

  let riffId: unknown
  try {
    riffId = ((await request.json()) as { riffId?: unknown }).riffId
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 })
  }
  if (typeof riffId !== "string") {
    return NextResponse.json({ error: "Bad request." }, { status: 400 })
  }

  const ok = await archiveRiffFor(session.user.id, riffId)
  if (!ok) {
    return NextResponse.json({ error: "No such riff." }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}

function sameHost(origin: string, request: Request) {
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host")
  try {
    return new URL(origin).host === (host ?? new URL(request.url).host)
  } catch {
    // "null" and anything else unparseable is not this site.
    return false
  }
}

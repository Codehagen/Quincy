import { headers } from "next/headers"
import { NextResponse } from "next/server"

import { auth } from "@/lib/auth"
import { getBrain } from "@/lib/brain"

/**
 * The brain, for the client cache.
 *
 * The user comes from the session and nothing else. There is no userId in the
 * path or the query string, because a route that takes one has to be trusted to
 * check it on every branch, and the way that check gets skipped is by existing
 * at all. Same rule lib/conversations.ts states for its own reads: ownership is
 * a filter on the query, not something verified once and then assumed.
 *
 * no-store: this is one account's private pages. A shared cache holding them
 * under a URL with no user in it is the same bug the query key avoids, one
 * layer further out.
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 })
  }

  const pages = await getBrain(session.user.id)

  return NextResponse.json(pages, {
    headers: { "Cache-Control": "no-store, private" },
  })
}

import { hashCaller, joinWaitlist } from "@/lib/waitlist"

/**
 * The one write a stranger can make. See plans/023.
 *
 * Open by design — this is the front door while Quincy is closed, and gating it
 * behind a session is a deadlock in the same shape as gating `/api/auth`.
 *
 * **It has to be listed in `PUBLIC` in proxy.ts**, and it is. The matcher there
 * exempts `api/auth`, `api/cron` and `api/webhooks` but not this path, so
 * without the PUBLIC entry a POST from a stranger comes back 307 to `/login`.
 * The browser follows that into an HTML page and `response.json()` throws on a
 * `<!DOCTYPE`, which surfaces in the form as "could not reach the server" —
 * the same invisible failure that swallowed every Resend delivery event once
 * already, wearing a different mask.
 *
 * Answers:
 *
 * - **200 `{ status: true }`** for a valid address, whether it was new or was
 *   already on the list. `lib/waitlist.ts` explains why those are the same
 *   answer.
 * - **400** for something that is not an address. Not an oracle: it says the
 *   input was malformed, not whether anybody owns it.
 * - **429** when the caller has joined three times in an hour.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null)

  if (!body || typeof body !== "object") {
    return Response.json({ status: false }, { status: 400 })
  }

  const { email, source } = body as { email?: unknown; source?: unknown }

  if (typeof email !== "string") {
    return Response.json({ status: false }, { status: 400 })
  }

  const outcome = await joinWaitlist({
    email,
    // Anything the client sends is untrusted, so the label is bounded rather
    // than stored raw — this column exists to tell the landing page apart from
    // a campaign, not to accept arbitrary text from a browser.
    source: typeof source === "string" ? source.slice(0, 32) : "landing",
    ipHash: hashCaller(request.headers.get("x-forwarded-for")),
  })

  if (outcome === "invalid") {
    return Response.json({ status: false }, { status: 400 })
  }

  if (outcome === "cooled") {
    return Response.json({ status: false }, { status: 429 })
  }

  return Response.json({ status: true })
}

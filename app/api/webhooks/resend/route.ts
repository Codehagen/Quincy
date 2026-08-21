import { Resend } from "resend"

/**
 * Delivery events from Resend.
 *
 * Sending is a fire-and-forget API call: a 200 from `resend.emails.send` means
 * Resend accepted the message, not that anyone received it. Everything that
 * happens after — the mailbox that does not exist, the recipient who hit "spam"
 * — is only visible here. Without this route a bounce rate climbs silently
 * until a provider starts refusing the domain.
 *
 * Resend maintains the suppression list itself: a hard-bounced or complained
 * address stops being delivered to whether or not this endpoint exists. So this
 * is observability, not enforcement, and it stays deliberately thin. The place
 * to grow it is the `email.bounced` arm, when there is something worth doing to
 * the user row behind the address.
 */

// Verification is HMAC over the raw body. Any framework-level reparsing of the
// request would change the bytes and invalidate the signature, so the body is
// read as text and never as JSON.
export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET

  if (!secret) {
    // Refuse rather than skip verification. An unsigned body is a stranger
    // asserting that an address bounced, and acting on it is worse than
    // dropping the event.
    return Response.json(
      {
        error: "RESEND_WEBHOOK_SECRET is not set. Refusing unverified events.",
      },
      { status: 503 }
    )
  }

  const key = process.env.RESEND_API_KEY

  if (!key) {
    // The SDK constructor throws without one, and verification is local crypto
    // that never uses it — but a 503 here is a clearer signal than a 500.
    return Response.json(
      { error: "RESEND_API_KEY is not set." },
      { status: 503 }
    )
  }

  const payload = await request.text()

  const id = request.headers.get("svix-id")
  const timestamp = request.headers.get("svix-timestamp")
  const signature = request.headers.get("svix-signature")

  if (!id || !timestamp || !signature) {
    return new Response("Missing signature headers", { status: 400 })
  }

  let event

  try {
    // Unlike the send path, `verify` throws rather than returning `{ error }`.
    // It is also what enforces the timestamp window, so a replayed body fails
    // here rather than being processed twice.
    event = new Resend(key).webhooks.verify({
      payload,
      headers: { id, timestamp, signature },
      webhookSecret: secret,
    })
  } catch (cause) {
    console.error(
      `[resend] rejected an unverified webhook: ${cause instanceof Error ? cause.message : "unknown"}`
    )
    return new Response("Invalid signature", { status: 400 })
  }

  switch (event.type) {
    case "email.bounced": {
      // Permanent. The address will never accept mail, and Resend has already
      // suppressed it — this line is what makes a typo'd signup findable.
      console.error(
        `[resend] bounced: ${event.data.to.join(", ")} — ${event.data.subject}`
      )
      break
    }

    case "email.complained": {
      // Someone marked transactional mail as spam. Rare and worth reading as a
      // content or expectation problem, not a delivery one.
      console.error(`[resend] complaint: ${event.data.to.join(", ")}`)
      break
    }

    case "email.failed": {
      console.error(`[resend] send failed: ${event.data.to.join(", ")}`)
      break
    }

    default:
      // delivered, delivery_delayed, sent and the rest. Resend retries soft
      // bounces on its own; there is nothing useful to do with them here.
      break
  }

  // 200 even for events that were ignored. A non-2xx puts this endpoint into
  // Resend's retry schedule, and retrying a delivery notification achieves
  // nothing except noise.
  return new Response("OK", { status: 200 })
}

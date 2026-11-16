import { createHash } from "node:crypto"
import { Resend } from "resend"

import type { ReactElement } from "react"

import { isUnreachableTestAddress } from "./test-address"

/**
 * One place decides who mail comes from. Sending happens on a subdomain so a
 * bounce storm on transactional mail cannot take the apex domain's reputation
 * with it — but nobody wants to reply into a black hole, so replies are pointed
 * at a mailbox a human actually reads.
 */
export const MAIL_FROM =
  process.env.MAIL_FROM ?? "Quincy <hello@mail.hirequincy.com>"
export const MAIL_REPLY_TO =
  process.env.MAIL_REPLY_TO ?? "christer@hirequincy.com"

/**
 * Re-exported so existing importers keep working; the values live next to the
 * templates that consume them, in emails/theme.ts.
 */
export { MAIL_COLORS } from "@/emails/theme"

export type MailResult =
  | { ok: true; id: string }
  | {
      ok: false
      /**
       * `skipped` is not a failure — it is mail we refused to attempt because
       * the address cannot receive it. Callers that only branch on `ok` treat
       * it like any other non-send, which is right: nothing arrived. What it
       * must not do is get logged as an error, since it is the expected
       * outcome for every test account. See `reportMailFailure` in lib/auth.ts.
       */
      reason: "not-configured" | "rejected" | "skipped"
      message: string
    }

/**
 * Builds an idempotency key for a message whose body contains a one-time link.
 *
 * Keying on the recipient alone — `reset-password/{email}` — looks like the
 * obvious choice and is the wrong one. Resend compares key *and* payload: a
 * second reset request inside 24h carries a fresh token, so the payload differs,
 * and the send comes back 409 instead of going out. The user asks for a new link
 * because the first never arrived, and the retry is exactly what gets swallowed.
 *
 * Hashing the link inverts that. A genuine re-request mints a new token, so it
 * gets a new key and sends. A retry of the *same* send — a lambda that timed out
 * after the API already accepted it — reuses the identical link, hits the same
 * key, and dedupes. That is the behaviour the key is for.
 *
 * The digest is truncated to 16 base64url chars (96 bits). This is a cache key,
 * not a secret; collisions are the only risk and 2^96 is far past caring. It
 * also keeps the whole key well inside the 256-char limit. The token is hashed
 * rather than embedded so a live credential never lands in a log line.
 */
export function mailKey(event: string, url: string): string {
  const digest = createHash("sha256")
    .update(url)
    .digest("base64url")
    .slice(0, 16)
  return `${event}/${digest}`
}

let client: Resend | null = null

function getClient(): Resend | null {
  if (client) {
    return client
  }

  const key = process.env.RESEND_API_KEY

  if (!key) {
    return null
  }

  client = new Resend(key)
  return client
}

/**
 * Every sender goes through here and every sender returns a status.
 *
 * Nothing throws. A verification email that fails to send should not take down
 * the signup that triggered it — the caller decides whether a failure is fatal,
 * and it can only decide that if it gets a value back instead of an exception.
 * The Resend SDK already returns `{ data, error }` rather than throwing for API
 * errors; the try/catch is for the transport underneath it.
 *
 * `idempotencyKey` is what makes a retry safe: same key and same payload inside
 * 24h returns the original result instead of sending a second copy. Note the
 * second half of that sentence — the same key with a *different* payload is a
 * 409, not a resend. Anything carrying a one-time token must therefore key on
 * the token, not on the recipient; see `mailKey` below.
 *
 * `text` is not optional in practice. Resend does not synthesise a plain-text
 * part, so an html-only message is a single-part email: worse in screen readers,
 * unreadable in text-only clients, and a spam signal at the big providers.
 */
export async function deliver({
  to,
  subject,
  react,
  text,
  idempotencyKey,
}: {
  to: string
  subject: string
  react: ReactElement
  text: string
  idempotencyKey: string
}): Promise<MailResult> {
  /**
   * Before the client, before the key check, before anything.
   *
   * A `@quincy.test` address cannot receive mail — that is the whole reason
   * the test accounts use it — so attempting delivery only buys a bounce, and
   * bounces are what a young sending domain is judged on. Measured on
   * 2026-08-11: 48 of the 53 messages this domain had ever sent were bounces,
   * every one of them a test signup fired through `requireEmailVerification`.
   *
   * Refused here rather than at each sender, because there are four of them
   * and a rule enforced in three places is a rule with a hole in it.
   */
  if (isUnreachableTestAddress(to)) {
    return {
      ok: false,
      reason: "skipped",
      message: `Not sent: ${to} is an unreachable test address.`,
    }
  }

  const resend = getClient()

  if (!resend) {
    return {
      ok: false,
      reason: "not-configured",
      message: "RESEND_API_KEY is not set — email was not attempted.",
    }
  }

  try {
    const { data, error } = await resend.emails.send(
      {
        from: MAIL_FROM,
        to: [to],
        replyTo: MAIL_REPLY_TO,
        subject,
        react,
        text,
      },
      { idempotencyKey }
    )

    if (error) {
      return { ok: false, reason: "rejected", message: error.message }
    }

    return { ok: true, id: data!.id }
  } catch (cause) {
    return {
      ok: false,
      reason: "rejected",
      message:
        cause instanceof Error ? cause.message : "Unknown transport error",
    }
  }
}

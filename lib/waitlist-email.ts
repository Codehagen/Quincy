import Invite from "@/emails/invite"

import { deliver, mailKey, type MailResult } from "./mail"

/**
 * The waitlist's only outbound mail. See plans/023.
 *
 * Links must be absolute and must point at the environment that sent them, so
 * this reads `BETTER_AUTH_URL` for the same reason `lib/auth-email.ts` does —
 * one per-environment variable rather than a second that can drift out of step.
 */
const APP_URL = (
  process.env.BETTER_AUTH_URL ?? "https://hirequincy.com"
).replace(/\/+$/, "")

export function inviteUrl(code: string) {
  return `${APP_URL}/signup?invite=${encodeURIComponent(code)}`
}

/**
 * Keyed on the URL rather than the address, matching the auth senders: a
 * re-issued invite carries a fresh code, so a per-address key would collide
 * with the first one inside Resend's window and come back 409 — killing
 * exactly the retry somebody just asked for.
 */
export async function sendInviteEmail({
  to,
  code,
  expiresIn,
}: {
  to: string
  code: string
  expiresIn: string
}): Promise<MailResult> {
  const url = inviteUrl(code)

  return deliver({
    to,
    subject: "Your Quincy invite",
    react: Invite({ url, expiresIn }),
    text: [
      "You are in.",
      "",
      "You asked to be told when Quincy opened. It is your turn.",
      "",
      "Quincy takes your raw material — something you shipped, a half-thought,",
      "a call you recorded — and drafts it in your voice. It writes, then it",
      "stops. Nothing goes out in your name until you approve it.",
      "",
      "Create your account:",
      url,
      "",
      `The link works once and runs out in ${expiresIn}. It is tied to this`,
      "address, so create the account with the one this mail arrived at.",
      "",
      "If you would rather not, do nothing and the invite lapses.",
      "Replies to this message reach a real person.",
      "— Quincy",
    ].join("\n"),
    idempotencyKey: mailKey("waitlist-invite", url),
  })
}

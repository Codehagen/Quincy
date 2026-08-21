import ResetPassword from "@/emails/reset-password"
import VerifyEmail from "@/emails/verify-email"
import Welcome from "@/emails/welcome"

import { deliver, mailKey, type MailResult } from "./mail"

/**
 * Links in mail must be absolute and must point at the environment that sent
 * them. BETTER_AUTH_URL is already per-environment and already correct, so it
 * is the one source rather than a second variable that can drift out of step
 * with it. The trailing slash is trimmed because every caller appends a path.
 */
const APP_URL = (
  process.env.BETTER_AUTH_URL ?? "https://hirequincy.com"
).replace(/\/+$/, "")

/**
 * Auth's outbound mail. Both senders return a status rather than throwing, so a
 * mail outage degrades to "the link did not arrive" instead of a failed signup.
 *
 * Both are keyed on the link rather than the address. Better Auth re-issues a
 * verification or reset link whenever the user asks, each with a fresh token —
 * keyed on the address those re-issues would collide inside the 24h window and
 * come back 409, killing the retry the user just asked for. See `mailKey`.
 *
 * The plain-text bodies are written by hand rather than derived from the JSX.
 * A stripped-tag rendering of a button-led layout reads as a stray verb and a
 * naked URL; these are the same message composed for a reader who will only
 * ever see this version.
 */

export async function sendVerificationEmail({
  to,
  name,
  url,
}: {
  to: string
  name: string
  url: string
}): Promise<MailResult> {
  return deliver({
    to,
    subject: "Confirm your email",
    react: VerifyEmail({ name, url }),
    text: [
      `Hi ${name},`,
      "",
      "Confirm this address to finish setting up your Quincy account:",
      url,
      "",
      "The link is single-use and expires. If you did not create an account,",
      "you can ignore this — nothing was set up.",
      "",
      "Replies to this message reach a real person.",
      "— Quincy",
    ].join("\n"),
    idempotencyKey: mailKey("verify-email", url),
  })
}

/**
 * Keyed on the user id, and this is the one sender where that is right.
 *
 * The rule the other two follow — key on the link, never the recipient —
 * exists because their bodies carry a one-time token, so a re-request changes
 * the payload and a recipient-scoped key turns into a 409. Nothing in the
 * welcome body varies: same name, same links, same copy. Both signup paths can
 * therefore fire it, and only the first send actually goes out. That is the
 * safety net under the hooks in lib/auth.ts, not a substitute for them.
 */
export async function sendWelcomeEmail({
  to,
  name,
  userId,
}: {
  to: string
  name: string
  userId: string
}): Promise<MailResult> {
  return deliver({
    to,
    subject: "Welcome to Quincy",
    react: Welcome({ name, appUrl: APP_URL }),
    text: [
      `Hi ${name},`,
      "",
      "Your account is ready. Give Quincy raw material and it drafts in your",
      "voice, schedules, and publishes. The more it knows about how you write,",
      "the less of it you will need to rewrite.",
      "",
      "Getting started — five things worth doing first:",
      "",
      `1. Point it at your material: ${APP_URL}/sources`,
      "   Repos, essays, calendars, threads. This is what it draws from.",
      "",
      `2. Tell it what you know: ${APP_URL}/brain`,
      "   Your positions and platform strategy, so drafts argue your line.",
      "",
      `3. Set the cadence: ${APP_URL}/rhythm`,
      "   It briefs you before the noise and recaps performance after.",
      "",
      `4. Work a half-thought: ${APP_URL}/riffs`,
      "   Scraps in, several directions out, before anything reaches Drafts.",
      "",
      `5. Or just talk to it: ${APP_URL}/studio`,
      "   The main way in. Every page is a window onto the same conversation.",
      "",
      "Stuck, or did it draft something that does not sound like you? Just",
      "reply — this lands in my inbox, and early on that is the feedback that",
      "tunes the voice.",
      "",
      "— Christer",
    ].join("\n"),
    idempotencyKey: `welcome-email/${userId}`,
  })
}

export async function sendPasswordResetEmail({
  to,
  name,
  url,
}: {
  to: string
  name: string
  url: string
}): Promise<MailResult> {
  return deliver({
    to,
    subject: "Reset your password",
    react: ResetPassword({ name, url }),
    text: [
      `Hi ${name},`,
      "",
      "Someone asked to reset the password on this account. Choose a new one:",
      url,
      "",
      "The link is single-use and expires. If this was not you, your password",
      "is unchanged and you can ignore this.",
      "",
      "Replies to this message reach a real person.",
      "— Quincy",
    ].join("\n"),
    idempotencyKey: mailKey("reset-password", url),
  })
}

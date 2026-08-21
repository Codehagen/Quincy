import ReconnectChannel from "@/emails/reconnect-channel"

import { deliver, type MailResult } from "./mail"

/**
 * Channels' outbound mail. One sender, kept beside lib/auth-email.ts rather
 * than inside lib/channels-maintenance.ts: the sweep decides *whether* to
 * write to someone, and this decides what that message says. They change for
 * different reasons.
 */

const APP_URL = (
  process.env.BETTER_AUTH_URL ?? "https://hirequincy.com"
).replace(/\/+$/, "")

/**
 * Formatted in UTC on purpose.
 *
 * The sweep runs at 06:00 UTC and the user's timezone lives on their record,
 * but a date one day either side of the true expiry is not a defect worth a
 * timezone lookup here — and `toLocaleDateString` with no zone would silently
 * use the *server's*, which is a different wrong answer that looks right in
 * development.
 */
function formatExpiry(expiresAt: Date | null): string | null {
  if (!expiresAt || expiresAt.getTime() <= Date.now()) {
    return null
  }

  return expiresAt.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  })
}

/**
 * Keyed on the connection and its expiry, which is what makes this send once.
 *
 * `reauthNoticeSentAt` is the real gate; this is the net under it. The rule in
 * `mailKey` — never key on the recipient when the payload varies — is satisfied
 * differently here: the payload varies only with the expiry date, so the expiry
 * is in the key. A retried send inside the same cycle dedupes; the next cycle,
 * 60 days later, carries a new expiry and goes out.
 */
export async function sendReconnectEmail({
  to,
  name,
  channel,
  connectionId,
  expiresAt,
}: {
  to: string
  name: string
  channel: string
  connectionId: string
  expiresAt: Date | null
}): Promise<MailResult> {
  const expiresOn = formatExpiry(expiresAt)
  const url = `${APP_URL}/channels`

  return deliver({
    to,
    subject: expiresOn
      ? `Renew ${channel} access for Quincy`
      : `Reconnect ${channel} to keep Quincy publishing`,
    react: ReconnectChannel({ name, channel, expiresOn, url }),
    text: [
      `Hi ${name},`,
      "",
      `${channel} grants access for 60 days at a time, then asks again.`,
      expiresOn ? `Yours ends ${expiresOn}.` : "Yours has run out.",
      "Nothing is wrong and nothing was lost — your drafts, strategy and",
      "schedule are exactly where you left them.",
      "",
      `Reconnect ${channel}:`,
      url,
      "",
      "Until you do, Quincy keeps drafting — it just cannot post. It has never",
      "posted anything you did not approve, and that does not change.",
      "",
      "Replies to this message reach a real person.",
      "— Quincy",
    ].join("\n"),
    idempotencyKey: `reconnect-channel/${connectionId}/${expiresAt?.getTime() ?? "expired"}`,
  })
}

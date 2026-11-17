/**
 * The kit's light-mode tokens as sRGB hex. Email clients do not understand
 * oklch, so `app/globals.css` cannot be used directly; these are the resolved
 * values, converted exactly (OKLab to linear sRGB to gamma, rounded once), not
 * picked by eye.
 *
 * This is the only copy for mail. It lived in three files (both templates and
 * lib/mail) until a contrast fix had to be made in all of them, which is the
 * usual way a duplicated palette announces itself.
 *
 * Light mode only. A message cannot follow the reader's colour scheme reliably
 * across clients, and the landing (/) in light mode is the reference. If a
 * primitive moves in app/globals.css, it moves here too, as it does in HEX in
 * components/mascot/engine.ts.
 *
 * Contrast, WCAG 2 ratios on `ground`:
 * - ink       18.56:1
 * - inkMuted   5.16:1 (AA for body text; the smallest muted text here is 14px)
 * - primaryOn on primary 18.56:1
 */
export const MAIL_COLORS = {
  /** --kit-ground → --kit-gray-994, oklch(0.994 0.0013 106). */
  ground: "#fdfdfc",
  /** --kit-ink → --kit-gray-178, oklch(0.178 0.0013 106). */
  ink: "#111110",
  /**
   * --kit-ink-muted → --kit-gray-530, oklch(0.53 0.0013 106). The exact blue
   * channel is 106.86, so 0x6b; app/opengraph-image.tsx carries #6C6C6A.
   */
  inkMuted: "#6c6c6b",
  /**
   * --kit-hairline: ink at 6% over the ground, composited in sRGB, because a
   * mail client cannot be trusted with an alpha border. 1.13:1 on ground;
   * a divider, never text.
   */
  hairline: "#efefee",
  /** --kit-primary → --kit-ink. The one action: the ink pill. */
  primary: "#111110",
  /** --kit-primary-on → --kit-ground. The label on the ink pill. */
  primaryOn: "#fdfdfc",
} as const

/**
 * The friend for the mail header, written by scripts/mascot-icons.ts from the
 * engine's MARK. Absolute, because a mail client has no origin to resolve a
 * relative path against, and built from BETTER_AUTH_URL like every link the
 * mail senders write (lib/auth-email.ts). A message sent from a local server
 * therefore points at localhost, and the image does not load in a real inbox.
 */
export const MAIL_FRIEND_SRC = `${(
  process.env.BETTER_AUTH_URL ?? "https://hirequincy.com"
).replace(/\/+$/, "")}/email/friend.png`

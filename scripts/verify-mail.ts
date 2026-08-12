/**
 * Checks the mail layer without sending anything or touching the network.
 * Run with: npx tsx --env-file=.env.local scripts/verify-mail.ts
 *
 * Two things here are worth a script rather than a reading. The idempotency
 * keys encode a rule that is easy to get backwards — key on the recipient and
 * a legitimate re-request comes back 409 instead of sending — and the template
 * accessibility attributes are invisible in the preview, so nothing about the
 * rendered email looks wrong when they are missing. Run it whenever lib/mail.ts
 * or anything in emails/ is touched.
 */
import { render } from "@react-email/render"

import ResetPassword from "../emails/reset-password"
import VerifyEmail from "../emails/verify-email"
import Welcome from "../emails/welcome"
import { MAIL_COLORS } from "../emails/theme"
import { mailKey } from "../lib/mail"

function check(label: string, ok: boolean, detail = "") {
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`
  )
  if (!ok) process.exitCode = 1
}

/** WCAG relative luminance, on sRGB hex. */
function luminance(hex: string) {
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(hex.replace("#", "").slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Tailwind compiles the palette to rgb(), so hex never appears in the output. */
function rgb(hex: string) {
  const [r, g, b] = [0, 2, 4].map((i) =>
    parseInt(hex.replace("#", "").slice(i, i + 2), 16)
  )
  return `rgb(${r},${g},${b})`
}

async function main() {
  console.log("\n=== idempotency keys ===")

  const first = "https://hirequincy.com/reset?token=AAA"
  const second = "https://hirequincy.com/reset?token=BBB"

  check(
    "a retry of the same send dedupes",
    mailKey("reset-password", first) === mailKey("reset-password", first)
  )
  // The one that matters. Keyed on the address instead of the link, this is the
  // case that 409s — and it is the user asking again because the first mail
  // never arrived.
  check(
    "a re-request with a fresh token is allowed through",
    mailKey("reset-password", first) !== mailKey("reset-password", second)
  )
  check(
    "events do not collide on one link",
    mailKey("verify-email", first) !== mailKey("reset-password", first)
  )
  check(
    "no live token reaches the key",
    !mailKey("reset-password", first).includes("AAA")
  )
  check(
    "inside Resend's 256-char limit",
    mailKey("reset-password", first).length <= 256
  )

  console.log("\n=== contrast (WCAG AA, 4.5:1 for body text) ===")

  for (const [label, fg, bg] of [
    ["ink on paper", MAIL_COLORS.ink, MAIL_COLORS.paper],
    ["muted on paper", MAIL_COLORS.muted, MAIL_COLORS.paper],
    ["brassDeep link on paper", MAIL_COLORS.brassDeep, MAIL_COLORS.paper],
  ] as const) {
    const ratio = contrast(fg, bg)
    check(label, ratio >= 4.5, `${ratio.toFixed(2)}:1`)
  }

  console.log("\n=== rendered templates ===")

  const cases = [
    {
      name: "verify-email",
      html: await render(
        VerifyEmail({
          name: "Christer",
          url: "https://hirequincy.com/v?token=abc123",
        })
      ),
      title: "Confirm your email address for Quincy",
    },
    {
      name: "reset-password",
      html: await render(
        ResetPassword({
          name: "Christer",
          url: "https://hirequincy.com/r?token=abc123",
        })
      ),
      title: "Reset your Quincy password",
    },
    {
      name: "welcome",
      html: await render(
        Welcome({ name: "Christer", appUrl: "https://hirequincy.com" })
      ),
      title: "Welcome to Quincy",
    },
  ]

  for (const { name, html, title } of cases) {
    console.log(`\n  ${name}`)
    // Attribute order is the renderer's business, so both orderings pass.
    check(
      "<html> carries lang and dir",
      /<html[^>]*(lang="en"[^>]*dir="ltr"|dir="ltr"[^>]*lang="en")/.test(html)
    )
    // The rule most often half-applied: several clients strip lang/dir from
    // <html>, so the direct child of <body> has to repeat them.
    check(
      "body's child repeats lang and dir",
      /<table[^>]*(lang="en"[^>]*dir="ltr"|dir="ltr"[^>]*lang="en")/.test(html)
    )
    check(
      "<title> describes the email",
      html.includes(`<title>${title}</title>`)
    )
    check(
      "layout table is presentational",
      html.includes('role="presentation"')
    )
    check("exactly one h1", (html.match(/<h1/g) ?? []).length === 1)
    // "16px minimum body" is about the paragraph you are meant to read, not
    // every string on the page — the eyebrow and the footnote are labels and
    // sit below it deliberately. The failure this guards against is the 10px
    // footer, so the floor is asserted separately from the body size.
    check("body copy is 16px", html.includes("font-size:16px"))
    check(
      "nothing smaller than 13px",
      !/font-size:(?:[0-9]|1[0-2])px/.test(html)
    )
    check(
      "link carries the corrected brass",
      html.includes(rgb(MAIL_COLORS.brassDeep))
    )
    // Only the token-bearing mails show the raw URL as a fallback; the welcome
    // links from words instead, which is correct for it.
    if (name !== "welcome") {
      check("link text is the destination", html.includes("token=abc123</a>"))
    }
  }

  console.log("\n=== welcome links point at pages that exist ===")

  // The onboarding list is the one place where a confident sentence can point
  // at a 404. /voice is deliberately absent: it is being removed.
  const welcome = await render(
    Welcome({ name: "Christer", appUrl: "https://hirequincy.com" })
  )
  const linked = [
    ...welcome.matchAll(/href="https:\/\/hirequincy\.com([^"]*)"/g),
  ]
    .map((m) => m[1])
    .filter((p) => p.length > 0)

  const routes = new Set([
    "/sources",
    "/brain",
    "/rhythm",
    "/riffs",
    "/studio",
    "/drafts",
    "/lineup",
    "/numbers",
  ])

  check("at least five steps link somewhere", new Set(linked).size >= 5)
  for (const path of new Set(linked)) {
    check(`links to a real page: ${path}`, routes.has(path))
  }
  check("does not link the page being removed", !welcome.includes("/voice"))
  // The welcome is signed by a person and promises a reply reaches them. That
  // promise is only true while MAIL_REPLY_TO is a mailbox someone opens, so the
  // signature and the reply-to are checked as one thing.
  check("signed by a person", welcome.includes("— Christer"))
  check(
    "reply-to is a personal address, as the sign-off claims",
    (process.env.MAIL_REPLY_TO ?? "christer@hirequincy.com").startsWith(
      "christer@"
    )
  )
  check("no unsubscribe on a transactional send", !/unsubscrib/i.test(welcome))
  check(
    "headings nest h1 then h2, no skip",
    /<h1[\s\S]*<h2/.test(welcome) && !/<h3/.test(welcome)
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

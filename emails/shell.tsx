import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Preview,
  Tailwind,
  pixelBasedPreset,
} from "@react-email/components"
import type { ReactNode } from "react"

import { MAIL_COLORS, MAIL_FRIEND_SRC } from "./theme"

interface ShellProps {
  /** Read before anything else by screen readers, and the page title when the
   * message is viewed in a browser. Describes this email, not the brand. */
  title: string
  /** The inbox line after the subject. Distinct from `title`. */
  preview: string
  children: ReactNode
}

/**
 * Inter where the reader has it, the platform's own sans where not. No web
 * font: most clients ignore one, and the ones that load it would flash.
 */
const SANS = [
  "Inter",
  "-apple-system",
  "BlinkMacSystemFont",
  '"Segoe UI"',
  "Helvetica",
  "Arial",
  "sans-serif",
]

/**
 * The shared frame for every transactional email.
 *
 * It exists for the accessibility attributes as much as the layout. `lang` and
 * `dir` have to appear on `<html>` *and* on the direct children of `<body>` —
 * several clients strip them from `<html>` — and a per-template copy of that
 * rule is a rule that will be half-applied within two templates. Same for
 * `<title>`, which is easy to forget precisely because nothing renders it.
 *
 * `Container` renders a layout table with `role="presentation"` already set, so
 * screen readers do not announce the frame as tabular data.
 *
 * The look is the landing's (/), in light mode: type flat on the white ground,
 * no card. The kit lifts an object by elevation, and a mail client drops box
 * shadows, so a card here could only be a bordered box — the thing the kit
 * replaced. The header is the lockup (components/mascot/lockup.tsx at `md`):
 * the friend at 32 beside "Quincy" at 28px, 560, 10px apart. The friend is an
 * image (Gmail and Outlook do not render SVG) with `alt=""`, because the word
 * beside it is the name; the lockup table is presentational for the same
 * reason the container is.
 */
export function Shell({ title, preview, children }: ShellProps) {
  return (
    <Html lang="en" dir="ltr">
      <Tailwind
        config={{
          presets: [pixelBasedPreset],
          theme: {
            extend: { colors: MAIL_COLORS, fontFamily: { sans: SANS } },
          },
        }}
      >
        <Head>
          <title>{title}</title>
        </Head>
        <Preview>{preview}</Preview>
        <Body className="bg-ground text-ink m-0 font-sans">
          <Container
            lang="en"
            dir="ltr"
            className="mx-auto max-w-[560px] px-[24px] py-[40px]"
          >
            <table
              role="presentation"
              cellPadding={0}
              cellSpacing={0}
              border={0}
            >
              <tbody>
                <tr>
                  <td className="align-middle">
                    <Img
                      src={MAIL_FRIEND_SRC}
                      width={32}
                      height={32}
                      alt=""
                      className="block"
                    />
                  </td>
                  <td className="text-ink pl-[10px] align-middle text-[28px] leading-[32px] font-[560] tracking-[-0.02em]">
                    Quincy
                  </td>
                </tr>
              </tbody>
            </table>
            {children}
          </Container>
        </Body>
      </Tailwind>
    </Html>
  )
}

/**
 * The one action in a message: the kit's ink pill (`Button variant="action"`).
 * Ink fill, the ground as its label (18.56:1), fully round, 48px tall (14px
 * above and below a 20px line), so the tap target clears 44px without a
 * pseudo-element a mail client would drop. Outlook on Windows ignores the
 * radius and draws a square; the colours and the size survive.
 */
export function Action({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Button
      href={href}
      className="bg-primary text-primaryOn mt-[24px] box-border rounded-[9999px] px-[24px] py-[14px] text-center text-[16px] leading-[20px] font-semibold no-underline"
    >
      {children}
    </Button>
  )
}

/**
 * A divider: the kit's hairline, resolved to an opaque hex. The full border
 * is spelled inline because Hr's own default (a grey top border) is merged
 * with class styles in an order the clients do not agree on.
 */
export function Rule() {
  return (
    <Hr
      style={{
        border: "none",
        borderTop: `1px solid ${MAIL_COLORS.hairline}`,
        margin: "28px 0",
      }}
    />
  )
}

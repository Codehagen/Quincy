import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Tailwind,
  Text,
  pixelBasedPreset,
} from "@react-email/components"
import type { CSSProperties, ReactNode } from "react"

import { MAIL_COLORS, MAIL_FRIEND_SRC } from "./theme"

interface ShellProps {
  /** Read before anything else by screen readers, and the page title when the
   * message is viewed in a browser. Describes this email, not the brand. */
  title: string
  /** The inbox line after the subject. Distinct from `title` and from the
   * subject: the inbox already shows the subject beside it. */
  preview: string
  children: ReactNode
}

/**
 * The platform's own sans first, Inter where the reader has it installed, then
 * the safe fallbacks. No web font: most clients ignore one, and the ones that
 * load it would flash. Roboto is what Gmail on Android draws with anyway; it is
 * named so the fallback order does not depend on the client's default.
 */
const SANS = [
  "-apple-system",
  "BlinkMacSystemFont",
  '"Segoe UI"',
  "Roboto",
  "Inter",
  "Helvetica",
  "Arial",
  "sans-serif",
]

/**
 * The vertical rhythm, in px, shared by every template. A template never sets
 * its own gap; it picks one of these through the components below, so the
 * space between the lockup, the heading, the body, the action and the footer
 * is the same in every message.
 *
 * Every gap is a top margin (or, for the action, a top padding) and every
 * bottom margin is zero. Two margins that meet are summed by some clients and
 * collapsed by others, so only one side of each gap is ever set.
 */
const SPACE = {
  /** The lockup to the h1. */
  title: 40,
  /** A heading to its first paragraph, and paragraph to paragraph. */
  text: 12,
  /** Between blocks: before the action, after it, around the rule, before
   * an h2. */
  block: 28,
} as const

/**
 * Text that a client might otherwise fold into a different width. Not a
 * Tailwind class: v4 compiles `tabular-nums` to a stack of custom properties,
 * which a mail client cannot resolve.
 */
const TABULAR: CSSProperties = { fontVariantNumeric: "tabular-nums" }

/**
 * The shared frame for every transactional email.
 *
 * It exists for the accessibility attributes as much as the layout. `lang` and
 * `dir` have to appear on `<html>` *and* on the direct children of `<body>`:
 * several clients strip them from `<html>`, and a per-template copy of that
 * rule is a rule that will be half-applied within two templates. Same for
 * `<title>`, which is easy to forget precisely because nothing renders it.
 *
 * `Container` renders a layout table with `role="presentation"` already set, so
 * screen readers do not announce the frame as tabular data.
 *
 * The look is the landing's (/), in light mode: type flat on the white ground,
 * no card. The kit lifts an object by elevation, and a mail client drops box
 * shadows, so a card here could only be a bordered box, the thing the kit
 * replaced. The header is the lockup (components/mascot/lockup.tsx at `md`):
 * the friend at 32 beside "Quincy" at 28px, 560, 10px apart. The friend is an
 * image (Gmail and Outlook do not render SVG) with `alt=""`, because the word
 * beside it is the name; the lockup table is presentational for the same
 * reason the container is.
 *
 * Light only, and said so in the head. The friend is an opaque PNG on the
 * ground colour, so a client that inverts the page would leave a white square
 * on a dark one. Apple Mail and Outlook honour `color-scheme`; Gmail ignores
 * it and does what it likes, which nothing in the markup can prevent.
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
          <meta name="color-scheme" content="light" />
          <meta name="supported-color-schemes" content="light" />
          <style>{`:root{color-scheme:light;supported-color-schemes:light}`}</style>
          <title>{title}</title>
        </Head>
        {/* Preview pads itself to 150 characters with zero-width spaces, so
            the inbox snippet does not run on into the heading. */}
        <Preview>{preview}</Preview>
        <Body
          className="bg-ground text-ink m-0 font-sans"
          style={{
            WebkitFontSmoothing: "antialiased",
            MozOsxFontSmoothing: "grayscale",
          }}
        >
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
                  {/* Zero line-height and font-size on the cell, so Gmail
                      leaves no descender gap under the image. */}
                  <td
                    className="align-middle"
                    style={{ fontSize: 0, lineHeight: 0 }}
                  >
                    <Img
                      src={MAIL_FRIEND_SRC}
                      width={32}
                      height={32}
                      alt=""
                      className="block"
                      style={{ border: 0 }}
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
 * The message's one heading. Balanced, so a two-line heading does not leave
 * one word on the second line; clients without `text-wrap` wrap it as usual.
 */
export function Title({ children }: { children: ReactNode }) {
  return (
    <Heading
      as="h1"
      className="text-ink mb-0 text-[24px] leading-[1.2] font-semibold tracking-[-0.015em]"
      style={{ marginTop: SPACE.title, textWrap: "balance" }}
    >
      {children}
    </Heading>
  )
}

/** A section heading, for the one message long enough to need one. */
export function Subtitle({ children }: { children: ReactNode }) {
  return (
    <Heading
      as="h2"
      className="text-ink mb-0 text-[18px] leading-[1.25] font-semibold tracking-[-0.01em]"
      style={{ marginTop: SPACE.block, textWrap: "balance" }}
    >
      {children}
    </Heading>
  )
}

/**
 * A paragraph of the message. `first` drops the top gap, for the paragraph
 * that opens the footer straight under the rule.
 */
export function Para({
  children,
  first = false,
}: {
  children: ReactNode
  first?: boolean
}) {
  return (
    <Text
      className="text-ink mb-0 text-[16px] leading-[1.55]"
      style={{ marginTop: first ? 0 : SPACE.text }}
    >
      {children}
    </Text>
  )
}

/**
 * Secondary text: the 14px muted line. `after` is the gap above it: `text`
 * when it continues the paragraph before, `block` when it follows the action,
 * `none` when it opens the footer.
 */
export function Note({
  children,
  after = "text",
}: {
  children: ReactNode
  after?: "text" | "block" | "none"
}) {
  return (
    <Text
      className="text-inkMuted mb-0 text-[14px] leading-[1.5]"
      style={{
        marginTop:
          after === "none" ? 0 : after === "block" ? SPACE.block : SPACE.text,
      }}
    >
      {children}
    </Text>
  )
}

/** A number that varies between sends: a date, a count, a duration. */
export function Num({ children }: { children: ReactNode }) {
  return <span style={TABULAR}>{children}</span>
}

/**
 * The one action in a message: the kit's ink pill (`Button variant="action"`).
 * Ink fill, the ground as its label (18.56:1), fully round, about 48px tall
 * (14px above and below the label's line), so the tap target clears 44px
 * without a pseudo-element a mail client would drop. 28px at the sides rather
 * than 24, because the round ends take half the height out of what reads as
 * padding.
 *
 * The padding is inline px on purpose. `Button` reads it from `style` to
 * build the Outlook spacers that make the whole pill, not only the label,
 * the link there. Outlook on Windows ignores the radius and draws a square;
 * the colours, the size and the hit area survive. The table around it carries
 * the gap above as cell padding, which Outlook keeps and a margin on an
 * inline-block link it does not.
 */
export function Action({ href, children }: { href: string; children: ReactNode }) {
  return (
    <table role="presentation" cellPadding={0} cellSpacing={0} border={0}>
      <tbody>
        <tr>
          <td style={{ paddingTop: SPACE.block }}>
            <Button
              href={href}
              className="bg-primary text-primaryOn box-border rounded-[9999px] text-center text-[16px] leading-[20px] font-semibold no-underline"
              style={{
                paddingTop: 14,
                paddingBottom: 14,
                paddingLeft: 28,
                paddingRight: 28,
              }}
            >
              {children}
            </Button>
          </td>
        </tr>
      </tbody>
    </table>
  )
}

/**
 * The raw link under the action, for a client that blocks the button or a
 * reader who would rather copy it. Token URLs are long and unbroken, so it
 * may wrap anywhere; otherwise one URL pushes a phone's layout past 560px.
 */
export function PasteLink({ href }: { href: string }) {
  return (
    <Note after="block">
      Or paste this into your browser:
      <br />
      <Link
        href={href}
        className="text-ink underline"
        style={{ wordBreak: "break-all", overflowWrap: "anywhere" }}
      >
        {href}
      </Link>
    </Note>
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
        margin: `${SPACE.block}px 0`,
      }}
    />
  )
}

/**
 * The close of a message: the rule, then the muted line that says why the
 * reader got it and that a reply reaches a person.
 */
export function Footer({ children }: { children: ReactNode }) {
  return (
    <>
      <Rule />
      <Note after="none">{children}</Note>
    </>
  )
}

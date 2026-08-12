import {
  Body,
  Container,
  Head,
  Html,
  Preview,
  Tailwind,
  Text,
  pixelBasedPreset,
} from "@react-email/components"
import type { ReactNode } from "react"

import { MAIL_COLORS } from "./theme"

interface ShellProps {
  /** Read before anything else by screen readers, and the page title when the
   * message is viewed in a browser. Describes this email, not the brand. */
  title: string
  /** The inbox line after the subject. Distinct from `title`. */
  preview: string
  children: ReactNode
}

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
 */
export function Shell({ title, preview, children }: ShellProps) {
  return (
    <Html lang="en" dir="ltr">
      <Tailwind
        config={{
          presets: [pixelBasedPreset],
          theme: { extend: { colors: MAIL_COLORS } },
        }}
      >
        <Head>
          <title>{title}</title>
        </Head>
        <Preview>{preview}</Preview>
        <Body className="bg-paper font-sans">
          <Container
            lang="en"
            dir="ltr"
            className="mx-auto max-w-[560px] p-[32px]"
          >
            <Text className="m-0 text-[13px] font-semibold tracking-[0.06em] text-muted uppercase">
              Quincy
            </Text>
            {children}
          </Container>
        </Body>
      </Tailwind>
    </Html>
  )
}

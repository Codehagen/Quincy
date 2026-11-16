import * as React from "react"

import { Code, Mono, Stage, Text, type StageBackdrop } from "@/components/kit"

export { Code }

/**
 * The building blocks of the component lab, after the Stageshow page: short
 * prose in a narrow column, each component live on its stage with a small
 * grey caption under it, and an Incorrect / Correct pair where the docs in
 * docs/design/ have one.
 *
 * Everything is the kit itself (Stage, Text, Mono). The only classes here are
 * layout utilities and kit tokens.
 */

/** One entry in the table of contents and one block of the page. */
export type Section = {
  /** The anchor. Permanent: links to it get shared. */
  id: string
  title: string
  /** The TOC group it sits under. Groups appear in first-seen order. */
  group: "Reference" | "Foundations" | "Components" | "Controls" | "Patterns" | "Showcase" | "Quincy cards" | "Overlays"
  /** The doc it mirrors, under docs/design/. */
  doc: string
  body: React.ReactNode
}

/** A paragraph of the column's prose. */
export function P({ children }: { children: React.ReactNode }) {
  return <Text tone="muted">{children}</Text>
}

type DemoProps = {
  caption: React.ReactNode
  lead?: string
  rest?: string
  backdrop?: StageBackdrop
  children: React.ReactNode
}

/** A component live on its stage, with the grey caption under it. */
export function Demo({ caption, lead, rest, backdrop, children }: DemoProps) {
  return (
    <figure className="flex flex-col gap-2.5">
      <Stage lead={lead} rest={lead ? rest : undefined} backdrop={backdrop}>
        {children}
      </Stage>
      <figcaption className="px-1">
        <Text variant="small" tone="muted" as="span">
          {caption}
        </Text>
      </figcaption>
    </figure>
  )
}

/**
 * A showcase picture with its caption, and no kit Stage around it: a
 * showcase Stage is its own frame, and a grey stage around it would frame it
 * twice.
 */
export function Plate({
  caption,
  children,
}: {
  caption: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <figure className="flex flex-col gap-2.5">
      {children}
      <figcaption className="px-1">
        <Text variant="small" tone="muted" as="span">
          {caption}
        </Text>
      </figcaption>
    </figure>
  )
}

type Side = { caption: React.ReactNode; children: React.ReactNode }

/**
 * Incorrect beside Correct. Side by side from 640px; stacked under it, with
 * the incorrect one first so the eye lands on the fix last. Each half is
 * narrower than 32rem, so margin notes inside sit under their lines.
 */
export function Pair({ incorrect, correct }: { incorrect: Side; correct: Side }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-3">
      <Demo
        caption={
          <>
            <span className="font-kit-strong text-kit-ink">Incorrect.</span>{" "}
            {incorrect.caption}
          </>
        }
      >
        {incorrect.children}
      </Demo>
      <Demo
        caption={
          <>
            <span className="font-kit-strong text-kit-ink">Correct.</span>{" "}
            {correct.caption}
          </>
        }
      >
        {correct.children}
      </Demo>
    </div>
  )
}

/** Heading 14/560 with a hairline running to the right, then the body. */
export function SectionBlock({ section }: { section: Section }) {
  const headingId = `${section.id}-title`
  return (
    <section
      id={section.id}
      aria-labelledby={headingId}
      className="flex scroll-mt-16 flex-col gap-5"
    >
      <div className="flex items-center gap-3">
        <Text as="h2" weight="strong" id={headingId}>
          {section.title}
        </Text>
        <span aria-hidden className="h-px flex-1 bg-kit-hairline" />
      </div>
      {section.body}
      <Text variant="small" tone="muted">
        Rules: <Mono>docs/design/{section.doc}</Mono>
      </Text>
    </section>
  )
}

/**
 * The landing (the reference, since 2026-11-16) beside the kit component
 * rebuilt to match it. Wider than the prose column from 64rem, so each half
 * has room; stacked under it, landing first. `stack` keeps the two one above
 * the other at every width, for a picture that needs the whole row.
 *
 * The kit half sets the object padding KitPage sets, so a Card here is the
 * Card an app page gets.
 */
export function Compare({
  caption,
  landing,
  kit,
  stack = false,
}: {
  caption: React.ReactNode
  landing: React.ReactNode
  kit: React.ReactNode
  stack?: boolean
}) {
  return (
    <figure className="flex flex-col gap-2.5 lg:w-[min(64rem,calc(100vw-16rem))] lg:self-center">
      <div className={`grid grid-cols-1 items-start gap-8 ${stack ? "" : "lg:grid-cols-2 lg:gap-10"}`}>
        <div className="flex min-w-0 flex-col gap-3">
          <Text variant="small" tone="muted" as="span">
            Landing
          </Text>
          {landing}
        </div>
        <div className="flex min-w-0 flex-col gap-3 sm:[--kit-object-pad-x:var(--spacing-kit-pad-x)] sm:[--kit-object-pad-y:var(--spacing-kit-pad-y)]">
          <Text variant="small" tone="muted" as="span">
            Kit
          </Text>
          {kit}
        </div>
      </div>
      <figcaption className="px-1">
        <Text variant="small" tone="muted" as="span">
          {caption}
        </Text>
      </figcaption>
    </figure>
  )
}

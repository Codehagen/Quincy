import * as React from "react"
import type { TextUIPart } from "ai"

import { Button, FileChip, Highlight, MarginNote, Muted, Text, Well } from "@/components/kit"
import { Markdown } from "@/components/ui/markdown"

/**
 * One turn of a conversation with Quincy (plans/030 #3, lab 23). Quincy's
 * reply is a marked-up page, not a bubble: prose on the object, the person's
 * own words quoted back in a Well with the one sentence that matters
 * highlighted, a margin note when Quincy has an opinion, and at most one
 * action. The person's turn is the only bubble.
 *
 * ```tsx
 * <div className="flex flex-col gap-kit-group">
 *   <YourTurn>Anything from this week's calls worth posting?</YourTurn>
 *   <QuincyReply>
 *     <ReplyText part={{ text: "One thing. On Thursday's call you said:" }} />
 *     <ReplyQuote note="this is the post">We stopped writing release notes.</ReplyQuote>
 *     <ReplyActions><Button variant="action">Draft it</Button></ReplyActions>
 *   </QuincyReply>
 * </div>
 * ```
 */
export type QuincyReplyProps = {
  /** ReplyText, ReplyQuote, ReplyActions, ReplyFailed: in reading order. */
  children: React.ReactNode
  /** True while the reply is still arriving. Sets `aria-busy`, nothing visual. */
  streaming?: boolean
}

/**
 * Quincy's turn. An `article` named "Quincy", its parts 12px apart
 * (`kit-related`). No surface of its own: it sits on the object the
 * conversation sits in (a Card or Window, `width="with-margin"` when a
 * ReplyQuote carries a note).
 */
export function QuincyReply({ children, streaming = false }: QuincyReplyProps) {
  return (
    <article
      aria-label="Quincy"
      aria-busy={streaming || undefined}
      data-slot="quincy-reply"
      className="flex min-w-0 flex-col gap-kit-related"
    >
      {children}
    </article>
  )
}

export type ReplyTextProps = {
  /**
   * The AI SDK's text part (`TextUIPart` from `ai`), or `{ text }` for words
   * that never streamed (the Studio greeting's `opening`, lib/studio-greeting.ts).
   * `state: "streaming"` closes open markers so a half-arrived `**` never shows.
   */
  part: Pick<TextUIPart, "text" | "state">
}

/**
 * Quincy's prose: markdown in the kit's own type (`.typeset-kit`, through
 * components/ui/markdown.tsx). No raw HTML (no rehype-raw), and append-stable
 * while it streams: earlier paragraphs never restyle as new ones land.
 *
 * Never put kit Text or a `text-*` utility inside it; for Quincy's marks
 * (a quote, a note, an action) close the markdown and use the parts below.
 */
export function ReplyText({ part }: ReplyTextProps) {
  return (
    <Markdown preset="kit" streaming={part.state === "streaming"} className="max-w-kit-doc">
      {part.text}
    </Markdown>
  )
}

export type ReplyQuoteProps = {
  /** The person's own words, verbatim: the one sentence Quincy is pointing at. */
  children: string
  /** Quincy's opinion of it, in the margin. ≤ 6 words, lower case. */
  note?: string
  /**
   * Whether the sentence takes the highlighter. Default `true`. One Highlight
   * per object: in a thread, only the latest reply's quote is highlighted, so
   * earlier turns pass `false`.
   */
  marked?: boolean
}

/**
 * What the person said, quoted back in a Well (the person's raw material,
 * spacing.md), highlighted, with the note writing in after the sweep.
 */
export function ReplyQuote({ children, note, marked = true }: ReplyQuoteProps) {
  const well = (
    <Well as="blockquote">
      <Text>{marked ? <Highlight>{children}</Highlight> : children}</Text>
    </Well>
  )
  if (!note || !marked) return well
  return (
    <MarginNote note={note} timing="after-highlight">
      {well}
    </MarginNote>
  )
}

/** The reply's controls in a row, 6px apart. At most one of them is the action. */
export function ReplyActions({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-kit-controls">{children}</div>
}

export type ReplyFailedProps = {
  /** First person, why: "I lost the thread there." */
  children: string
  /** The grey continuation, what fixes it. */
  rest?: string
  /** Sends the last turn again. Without it the sentence stands alone. */
  onRetry?: () => void
}

/**
 * A reply that did not arrive (states.md, "Refused or failed"): one sentence
 * in ink, the way out beside it, no red. Announced, focus left alone.
 */
export function ReplyFailed({ children, rest, onRetry }: ReplyFailedProps) {
  return (
    <div role="status" className="flex flex-col gap-kit-related">
      <Text>
        {children}
        {rest ? (
          <>
            {" "}
            <Muted>{rest}</Muted>
          </>
        ) : null}
      </Text>
      {onRetry ? (
        <div>
          <Button onClick={onRetry}>Try again</Button>
        </div>
      ) : null}
    </div>
  )
}

export type YourTurnProps = {
  /**
   * What the person sent, verbatim (the user `TextUIPart`'s `text`). Never
   * markdown: someone pasting a post full of `**` meant those characters.
   */
  children: string
  /** Files sent with the turn, shown above the bubble. Report only, no ×. */
  files?: readonly { name: string; meta?: string }[]
}

/**
 * The person's turn: the one bubble in the conversation, at the right, in
 * the well. Line breaks are kept as typed.
 */
export function YourTurn({ children, files }: YourTurnProps) {
  return (
    <div data-slot="quincy-your-turn" className="flex flex-col items-end gap-kit-controls">
      {files?.length ? (
        <div className="flex max-w-4/5 flex-wrap justify-end gap-kit-controls">
          {files.map((f, index) => (
            // Two files can share a name; the order they were sent in cannot.
            <FileChip key={index} name={f.name} meta={f.meta} />
          ))}
        </div>
      ) : null}
      {children ? (
        <div className="max-w-4/5 rounded-kit-object bg-kit-well px-kit-recess py-kit-controls">
          <p className="text-kit-body break-words whitespace-pre-wrap text-kit-ink">{children}</p>
        </div>
      ) : null}
    </div>
  )
}

"use client"

import * as React from "react"

import {
  Arrive,
  Button,
  ButtonLink,
  Card,
  MarginNote,
  Mono,
  Muted,
  Rule,
  Tag,
  Tags,
  Text,
  TextLink,
  Well,
} from "@/components/kit"
import { Friend } from "@/components/mascot"

import { CHANNELS_FOR_SHAPE, type Angle, type Riff } from "./data"

export type Refusal = { message: string; fix: string; channel: string }

type DetailProps = {
  riff: Riff
  /** Whether the pick's "Draft this" is the page's one action right now. */
  pickIsAction: boolean
  refusals: Record<string, Refusal>
  onDraft: (riff: Riff, angle: Angle) => Promise<void>
  onDismiss: (riff: Riff) => void
  onRecordAgain: () => void
  ref?: React.Ref<HTMLDivElement>
}

/** "X and LinkedIn": a sentence about the item, not a Tag (type.md). */
function destinations(angle: Angle) {
  const labels = CHANNELS_FOR_SHAPE[angle.shape].map((c) => c.label)
  if (labels.length <= 1) return labels.join("")
  return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`
}

/**
 * The open riff: what the person said, and what came back. Keyed by the riff
 * in the parent, so pending state resets when another row opens.
 */
export function RiffDetail({
  riff,
  pickIsAction,
  refusals,
  onDraft,
  onDismiss,
  onRecordAgain,
  ref,
}: DetailProps) {
  const titleId = `riff-${riff.id}-title`
  const waiting = riff.angles.filter((a) => a.status !== "drafted").length
  const anyDrafted = riff.angles.some((a) => a.status === "drafted")

  return (
    <Card ref={ref} width="with-margin" role="region" aria-labelledby={titleId}>
      <div className="flex flex-col gap-kit-group">
        <div className="flex flex-col gap-kit-tight">
          <Text as="h2" weight="strong" id={titleId}>
            {riff.sourceLabel}
          </Text>
          <Text variant="small" tone="muted">
            <Mono>
              {riff.capturedAt}
              {riff.duration ? ` · ${riff.duration}` : ""}
            </Mono>
            {riff.adaptedFrom ? (
              <>
                {" · From "}
                <TextLink href={riff.adaptedFrom.url} target="_blank" rel="noreferrer noopener">
                  @{riff.adaptedFrom.handle}&apos;s post
                </TextLink>
              </>
            ) : null}
          </Text>
        </div>

        {/* A voice note has no words until it is transcribed; an empty well
            would read as text that failed to load. */}
        {riff.scrap ? (
          <Well as="blockquote">
            <Text>{riff.scrap}</Text>
          </Well>
        ) : null}

        {riff.state === "working" ? (
          <Text as="div" role="status">
            <span className="inline-flex items-center gap-2">
              <Friend size={20} state="reading" className="shrink-0" />
              <span className="min-w-0">
                Reading it. Angles usually land within a minute.
              </span>
            </span>
          </Text>
        ) : riff.state === "failed" ? (
          <div role="status" className="flex flex-col gap-kit-related">
            <Text>
              I couldn&apos;t find a post in this one. <Muted>{riff.failure}</Muted>
            </Text>
            <div>
              <Button onClick={onRecordAgain}>Record it again</Button>
            </div>
          </div>
        ) : riff.angles.length === 0 ? (
          <Text tone="muted">Nothing left on this one.</Text>
        ) : (
          <div className="flex flex-col">
            <Text variant="small" tone="muted">
              {waiting === 0
                ? "Everything here is drafted."
                : `I found ${waiting === 1 ? "one way" : `${waiting} ways`} to take it.`}
            </Text>
            {riff.angles.map((angle) => {
              const block = (
                <AngleBlock
                  angle={angle}
                  isAction={pickIsAction && angle.id === riff.pickId}
                  refusal={refusals[angle.id]}
                  onDraft={() => onDraft(riff, angle)}
                />
              )
              return (
                <React.Fragment key={angle.id}>
                  <Rule />
                  {angle.id === riff.pickId && riff.pickNote && angle.status !== "drafted" ? (
                    <MarginNote note={riff.pickNote}>{block}</MarginNote>
                  ) : (
                    block
                  )}
                </React.Fragment>
              )
            })}
          </div>
        )}
      </div>

      <Rule />
      <div>
        <Button aria-describedby={titleId} onClick={() => onDismiss(riff)}>
          {anyDrafted ? "Dismiss the rest" : "Dismiss"}
        </Button>
      </div>
    </Card>
  )
}

function AngleBlock({
  angle,
  isAction,
  refusal,
  onDraft,
}: {
  angle: Angle
  isAction: boolean
  refusal: Refusal | undefined
  onDraft: () => Promise<void>
}) {
  const hookId = `angle-${angle.id}-hook`
  const drafted = angle.status === "drafted"
  const [pending, setPending] = React.useState(false)
  const openRef = React.useRef<HTMLAnchorElement>(null)
  const pressed = React.useRef(false)

  // Draft → Open Drafts: the pressed button goes inert inside a closing
  // Arrive, so focus moves to its counterpart (motion.md, "Focus").
  React.useEffect(() => {
    if (drafted && pressed.current) {
      pressed.current = false
      openRef.current?.focus()
    }
  }, [drafted])

  const draft = async () => {
    pressed.current = true
    setPending(true)
    try {
      await onDraft()
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-kit-related">
      <div className="flex flex-col gap-kit-tight">
        <Text weight="strong" id={hookId}>
          {angle.hook}
        </Text>
        <Tags>
          {angle.kind ? <Tag>{angle.kind}</Tag> : null}
          <Tag>{angle.shape}</Tag>
        </Tags>
      </div>
      <Text variant="small" tone="muted">
        {angle.why}
      </Text>

      <Arrive show={!drafted && !refusal}>
        <div className="flex flex-wrap items-center gap-kit-related">
          <Button
            variant={isAction ? "action" : "quiet"}
            aria-describedby={hookId}
            pending={pending}
            pendingLabel="Drafting…"
            onClick={draft}
          >
            Draft this
          </Button>
          <Text variant="small" tone="muted">
            For {destinations(angle)}.
          </Text>
        </div>
      </Arrive>

      <Arrive show={refusal != null}>
        {refusal ? (
          <div role="status" className="flex flex-col gap-kit-related">
            <Text>
              {refusal.message} <Muted>{refusal.fix}</Muted>
            </Text>
            <div>
              <ButtonLink href="/channels">Connect {refusal.channel}</ButtonLink>
            </div>
          </div>
        ) : null}
      </Arrive>

      <Arrive show={drafted}>
        <div className="flex flex-wrap items-center gap-kit-related">
          <Text variant="small" tone="muted">
            Drafted. It waits in Drafts until you approve it.
          </Text>
          <ButtonLink ref={openRef} href="/drafts">
            Open Drafts
          </ButtonLink>
        </div>
      </Arrive>
    </div>
  )
}

/** The Undo that stands where the dismissed riff was (actions.md). */
export function UndoBar({
  riff,
  onUndo,
  ref,
}: {
  riff: Riff
  onUndo: () => void
  ref?: React.Ref<HTMLButtonElement>
}) {
  return (
    <Card width="with-margin">
      <div className="flex flex-wrap items-center justify-between gap-kit-related">
        <Text tone="muted">
          Dismissed {riff.sourcePhrase} from {riff.capturedPhrase}.
        </Text>
        <Button ref={ref} onClick={onUndo}>
          Undo
        </Button>
      </div>
    </Card>
  )
}

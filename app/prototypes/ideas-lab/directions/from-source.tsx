"use client"

import * as React from "react"

import type { Angle, Riff } from "@/lib/riffs"
import {
  Button,
  ButtonLink,
  Card,
  KitPage,
  LiveDot,
  Rule,
  Stage,
  Text,
  TextButton,
  UndoBar,
  Well,
} from "@/components/kit"
import { ProvenanceMark, dismissedSentence, ideasFrom, pickAngle } from "@/components/quincy"

import { WRITES } from "../fixtures"
import { Capture, NothingYet, destinations, summaryFor, type Controls } from "../parts"
import type { FrameId, Queue } from "../queue"

/**
 * 3 · From the source — the landing's ideas picture, as the page. One
 * column. Each piece of material is one white object, named by where it
 * came from ("3 ideas from GitHub"), and its ideas are the rows inside it.
 * The picked idea is the row on the well grey with Draft this idea on it:
 * the idea is the thing you choose, so the action stands on the idea.
 *
 * Breaks page.md on purpose: "a row never holds a Button". That rule exists
 * for list and detail; here there is no detail to hold it.
 */

export function FromSource({ q, frame, c }: { q: Queue; frame: FrameId; c: Controls }) {
  const riffs = q.riffs
  const firstWaiting = riffs.find((r) => r.state === "ready" && pickAngle(r))
  const pickedId =
    q.open.source && riffs.some((r) => r.angles.some((a) => a.id === q.open.source && a.status !== "drafted"))
      ? q.open.source
      : (firstWaiting ? pickAngle(firstWaiting)?.id : null) ?? null
  const anyPicked = pickedId != null

  const dismiss = (riff: Riff) => {
    q.dismiss(riff, frame)
  }

  return (
    <KitPage title="Ideas" summary={summaryFor(riffs)} width="wide">
      <div className="flex w-full flex-col gap-kit-page-gap" style={{ maxWidth: `${c.sourceRem}rem` }}>
        <Stage
          aria-label="Say what happened"
          lead="Say what happened."
          rest="However it comes out. I read through the false starts and find the posts in it."
        >
          <Capture isAction={!anyPicked} compact />
        </Stage>

        <Stage
          aria-label="Ideas"
          {...(riffs.length > 0
            ? { lead: "What I found.", rest: "Grouped by where it came from. Pick one worth drafting." }
            : {})}
        >
          {riffs.length === 0 ? <NothingYet /> : null}
          {riffs.map((riff) => (
            <SourceCard
              key={riff.id}
              riff={riff}
              pickedId={pickedId}
              c={c}
              onPick={(id) => q.setOpen("source", id)}
              onDraft={async (angle) => {
                await q.draft(angle)
                // The next idea from the same source, else the next anywhere.
                const rest = (r: Riff) => (r.state === "ready" ? r.angles : []).filter((a) => a.status !== "drafted" && a.id !== angle.id)
                q.setOpen("source", rest(riff)[0]?.id ?? riffs.flatMap(rest)[0]?.id ?? null)
              }}
              onDrop={(angle) => q.drop(angle.id)}
              onDismiss={() => dismiss(riff)}
            />
          ))}
          <UndoBar show={q.undo != null && q.undo.from === frame} onUndo={q.restore}>
            {q.undo ? dismissedSentence(q.undo.riff) : null}
          </UndoBar>
        </Stage>
      </div>
    </KitPage>
  )
}

function SourceCard({
  riff,
  pickedId,
  c,
  onPick,
  onDraft,
  onDrop,
  onDismiss,
}: {
  riff: Riff
  pickedId: string | null
  c: Controls
  onPick: (id: string) => void
  onDraft: (angle: Angle) => Promise<void>
  onDrop: (angle: Angle) => void
  onDismiss: () => void
}) {
  const [all, setAll] = React.useState(false)
  const [said, setSaid] = React.useState(false)
  const titleId = React.useId()
  const shown = all ? riff.angles : riff.angles.slice(0, c.perSource)
  const more = riff.angles.length - shown.length

  return (
    <Card aria-labelledby={titleId} role="region">
      <div className="flex flex-col gap-kit-related">
        <div className="flex flex-col gap-kit-tight">
          <Text as="h2" weight="strong" id={titleId}>
            {riff.state === "ready" && riff.angles.length > 0
              ? riff.angles.every((a) => a.status === "drafted")
                ? `Every idea from ${riff.sourceLabel} is drafted.`
                : ideasFrom(riff).replace(/\.$/, "")
              : riff.sourceLabel}
          </Text>
          <ProvenanceMark riff={riff} />
        </div>

        {riff.state === "working" ? (
          <Text as="div" role="status">
            <LiveDot pulse>Reading it. Ideas usually land within a minute.</LiveDot>
          </Text>
        ) : riff.state === "failed" ? (
          <Text role="status">
            I couldn&apos;t find a post in this one. <span className="text-kit-ink-muted">{riff.failure}</span>
          </Text>
        ) : (
          <ul className="-mx-kit-row-x flex flex-col gap-1">
            {shown.map((angle) => (
              <IdeaRow
                key={angle.id}
                angle={angle}
                picked={angle.id === pickedId}
                why={c.why}
                onPick={() => onPick(angle.id)}
                onDraft={() => onDraft(angle)}
                onDrop={() => onDrop(angle)}
              />
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-x-kit-related gap-y-kit-tight">
          {more > 0 ? <TextButton onClick={() => setAll(true)}>{more === 1 ? "One more idea" : `${more} more ideas`}</TextButton> : null}
          {riff.scrap ? (
            <TextButton aria-expanded={said} onClick={() => setSaid((s) => !s)}>
              {said ? "Hide what you said" : "What you said"}
            </TextButton>
          ) : null}
        </div>
        {said ? (
          <Well as="blockquote">
            <Text>{riff.scrap}</Text>
          </Well>
        ) : null}
      </div>
      <Rule />
      <div>
        <Button aria-describedby={titleId} onClick={onDismiss}>
          {riff.angles.some((a) => a.status === "drafted") ? "Dismiss the rest" : "Dismiss"}
        </Button>
      </div>
    </Card>
  )
}

function IdeaRow({
  angle,
  picked,
  why,
  onPick,
  onDraft,
  onDrop,
}: {
  angle: Angle
  picked: boolean
  why: Controls["why"]
  onPick: () => void
  onDraft: () => Promise<void>
  onDrop: () => void
}) {
  const [pending, setPending] = React.useState(false)
  const drafted = angle.status === "drafted"
  const hookId = React.useId()
  const meta = [angle.kind, angle.shape, destinations(angle)].filter(Boolean).join(" · ")
  const n = WRITES[angle.shape]

  return (
    <li
      data-on={picked || undefined}
      className="flex flex-col gap-kit-tight rounded-kit-control px-kit-row-x py-kit-row-y data-on:bg-kit-selected"
    >
      <div className="flex items-start justify-between gap-kit-related">
        <button
          type="button"
          aria-pressed={picked}
          aria-describedby={hookId}
          onClick={onPick}
          disabled={drafted}
          className="flex min-w-0 flex-1 flex-col text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kit-focus disabled:cursor-default"
        >
          <span id={hookId} className={picked ? "font-kit-strong" : drafted ? "text-kit-ink-muted" : "font-kit-strong"}>
            {angle.hook}
          </span>
          <span className="text-kit-small text-kit-ink-muted">{drafted ? `Drafted · ${meta}` : meta}</span>
        </button>
        {picked && !drafted ? (
          <span className="hidden flex-none @lg/kit-stage:inline-flex">
            <Button
              variant="action"
              aria-describedby={hookId}
              pending={pending}
              pendingLabel="Drafting…"
              onClick={async () => {
                setPending(true)
                await onDraft()
                setPending(false)
              }}
            >
              Draft this idea
            </Button>
          </span>
        ) : null}
        {drafted ? (
          <span className="flex-none">
            <ButtonLink href="#" onClick={(e) => e.preventDefault()}>
              Open Drafts
            </ButtonLink>
          </span>
        ) : null}
      </div>

      {(picked || why === "always") && !drafted && angle.why ? (
        <Text variant="small" tone="muted">
          {angle.why}
        </Text>
      ) : null}

      {picked && !drafted ? (
        <div className="flex flex-wrap items-center gap-kit-controls">
          {/* On a phone Draft drops under the idea, at the row's start. */}
          <span className="@lg/kit-stage:hidden">
            <Button
              variant="action"
              aria-describedby={hookId}
              pending={pending}
              pendingLabel="Drafting…"
              onClick={async () => {
                setPending(true)
                await onDraft()
                setPending(false)
              }}
            >
              Draft this idea
            </Button>
          </span>
          <Button onClick={onDrop}>Not this one</Button>
          <Text variant="small" tone="muted" as="span">
            {n === 0 ? "No channel for this yet." : `Writes ${n === 1 ? "one post" : `${n} posts`}.`}
          </Text>
        </div>
      ) : null}
    </li>
  )
}

"use client"

import * as React from "react"

import type { Angle, Riff } from "@/lib/riffs"
import {
  Button,
  ButtonLink,
  Card,
  Highlight,
  KitPage,
  Mono,
  Rule,
  Stage,
  Text,
  UndoBar,
} from "@/components/kit"
import { Friend } from "@/components/mascot"
import { ProvenanceMark, dismissedSentence, ideasFrom, pickAngle } from "@/components/quincy"

import { WRITES, readingsFor } from "../fixtures"
import { Capture, NothingYet, destinations, summaryFor, type Controls } from "../parts"
import type { FrameId, Queue } from "../queue"

/**
 * 4 · Marked up — the material is the page, and the ideas are Quincy's marks
 * on it. Each source is your own words, set as prose; every sentence an idea
 * stands on is underlined in the pen, the open one highlighted, and the
 * ideas sit in the margin beside the text, numbered in reading order. You
 * pick an idea by pointing at the sentence. The editor metaphor from
 * plans/029 ("Quincy is a human editor"), carried to the whole page.
 *
 * Needs `Angle.line` (quincy-riffs.md, "Data gaps"): without the sentence an
 * idea stands on, there is nothing to mark. Ideas with no line here are
 * listed under "From the whole note".
 */

type Mark = { angle: Angle; n: number; at: number; line: string }

function marksFor(riff: Riff): { marks: Mark[]; loose: Angle[] } {
  const readings = readingsFor(riff)
  const placed = riff.angles
    .map((angle) => {
      const line = readings[angle.id]?.line
      return line ? { angle, line, at: riff.scrap.indexOf(line) } : null
    })
    .filter((m): m is Omit<Mark, "n"> => m != null && m.at >= 0)
    .sort((a, b) => a.at - b.at)
  // Overlapping lines would nest marks; keep the first.
  const marks: Mark[] = []
  let end = -1
  for (const m of placed) {
    if (m.at < end) continue
    marks.push({ ...m, n: marks.length + 1 })
    end = m.at + m.line.length
  }
  const loose = riff.angles.filter((a) => !marks.some((m) => m.angle.id === a.id))
  return { marks, loose }
}

export function MarkedUp({ q, frame, c }: { q: Queue; frame: FrameId; c: Controls }) {
  const riffs = q.riffs
  const firstWaiting = riffs.find((r) => r.state === "ready" && pickAngle(r))
  const openId =
    q.open.marked && riffs.some((r) => r.angles.some((a) => a.id === q.open.marked))
      ? q.open.marked
      : (firstWaiting ? pickAngle(firstWaiting)?.id : null) ?? null

  return (
    <KitPage title="Ideas" summary={summaryFor(riffs)} width="wide">
      <Stage
        aria-label="Say what happened"
        lead="Say what happened."
        rest="However it comes out. I read it like an editor and mark what could be a post."
      >
        <Capture isAction={openId == null} compact />
      </Stage>

      <Stage
        aria-label="Ideas"
        {...(riffs.length > 0 ? { lead: "What I marked.", rest: "Point at a sentence to see the idea I found in it." } : {})}
      >
        {riffs.length === 0 ? <NothingYet /> : null}
        {riffs.map((riff) => (
          <Page
            key={riff.id}
            riff={riff}
            openId={openId}
            c={c}
            onOpen={(id) => q.setOpen("marked", id)}
            onDraft={q.draft}
            onDrop={(a) => q.drop(a.id)}
            onDismiss={() => q.dismiss(riff, frame)}
          />
        ))}
        <UndoBar show={q.undo != null && q.undo.from === frame} onUndo={q.restore}>
          {q.undo ? dismissedSentence(q.undo.riff) : null}
        </UndoBar>
      </Stage>
    </KitPage>
  )
}

function Page({
  riff,
  openId,
  c,
  onOpen,
  onDraft,
  onDrop,
  onDismiss,
}: {
  riff: Riff
  openId: string | null
  c: Controls
  onOpen: (id: string) => void
  onDraft: (a: Angle) => Promise<unknown>
  onDrop: (a: Angle) => void
  onDismiss: () => void
}) {
  const titleId = React.useId()
  const { marks, loose } = marksFor(riff)

  const prose: React.ReactNode[] = []
  let from = 0
  for (const m of marks) {
    prose.push(riff.scrap.slice(from, m.at))
    const open = m.angle.id === openId
    const quiet = !open && c.others === "unmarked"
    prose.push(
      <span
        key={m.angle.id}
        role="button"
        tabIndex={0}
        aria-pressed={open}
        aria-label={`Idea ${m.n}: ${m.angle.hook}`}
        onClick={() => onOpen(m.angle.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            onOpen(m.angle.id)
          }
        }}
        className={`cursor-pointer rounded-kit-chip outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kit-focus ${
          open || quiet ? "" : "underline decoration-kit-pen decoration-2 underline-offset-4 hover:decoration-kit-ink"
        }`}
      >
        {open ? <Highlight active>{m.line}</Highlight> : m.line}
        {quiet ? null : (
          <sup className="ml-0.5 font-kit-mono text-kit-mono text-kit-pen" aria-hidden>
            {m.n}
          </sup>
        )}
      </span>
    )
    from = m.at + m.line.length
  }
  prose.push(riff.scrap.slice(from))

  const head = riff.state === "ready" && riff.angles.length > 0 ? ideasFrom(riff).replace(/\.$/, "") : riff.sourceLabel

  return (
    <Card role="region" aria-labelledby={titleId}>
      <div
        className="grid gap-x-kit-page-gutter gap-y-kit-group @3xl/kit-stage:grid-cols-[minmax(0,var(--lab-scrap))_var(--lab-margin)]"
        style={{ "--lab-scrap": `${c.scrapRem}rem`, "--lab-margin": `${c.marginRem}rem` } as React.CSSProperties}
      >
        <div className="flex min-w-0 flex-col gap-kit-related">
          <div className="flex flex-col gap-kit-tight">
            <Text as="h2" weight="strong" id={titleId}>
              {head}
            </Text>
            <ProvenanceMark riff={riff} />
          </div>
          <Text>{prose}</Text>
          {riff.state === "working" ? (
            <Text as="div" role="status">
              <span className="inline-flex items-center gap-2">
                <Friend size={20} state="reading" className="shrink-0" />
                <span className="min-w-0">
                  Reading it. Marks usually land within a minute.
                </span>
              </span>
            </Text>
          ) : riff.state === "failed" ? (
            <Text role="status" tone="muted">
              {`Nothing to mark here. ${riff.failure}`}
            </Text>
          ) : null}
        </div>

        {riff.state === "ready" && riff.angles.length > 0 ? (
          <ol aria-label="Ideas" className="flex flex-col gap-kit-related">
            {marks.map((m) => (
              <Note
                key={m.angle.id}
                n={m.n}
                angle={m.angle}
                open={m.angle.id === openId}
                onOpen={() => onOpen(m.angle.id)}
                onDraft={onDraft}
                onDrop={onDrop}
              />
            ))}
            {loose.length > 0 ? (
              <li className="text-kit-small text-kit-ink-muted">From the whole note</li>
            ) : null}
            {loose.map((a) => (
              <Note key={a.id} angle={a} open={a.id === openId} onOpen={() => onOpen(a.id)} onDraft={onDraft} onDrop={onDrop} />
            ))}
          </ol>
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

function Note({
  n,
  angle,
  open,
  onOpen,
  onDraft,
  onDrop,
}: {
  n?: number
  angle: Angle
  open: boolean
  onOpen: () => void
  onDraft: (a: Angle) => Promise<unknown>
  onDrop: (a: Angle) => void
}) {
  const [pending, setPending] = React.useState(false)
  const drafted = angle.status === "drafted"
  const hookId = React.useId()
  const writes = WRITES[angle.shape]
  return (
    <li className="flex flex-col gap-kit-tight">
      <button
        type="button"
        aria-expanded={open}
        onClick={onOpen}
        className="flex items-baseline gap-kit-tight text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kit-focus"
      >
        {n != null ? <Mono>{`${n}`}</Mono> : null}
        <span id={hookId} className={open ? "font-kit-strong" : drafted ? "text-kit-ink-muted" : "text-kit-ink-muted"}>
          {angle.hook}
        </span>
      </button>
      {open ? (
        <div className="flex flex-col gap-kit-related">
          <Text variant="small" tone="muted">
            {[angle.kind, angle.shape, destinations(angle)].filter(Boolean).join(" · ")}
          </Text>
          {angle.why ? <Text variant="small">{angle.why}</Text> : null}
          {drafted ? (
            <div className="flex flex-wrap items-center gap-kit-related">
              <Text variant="small" tone="muted">
                Drafted. It waits in Drafts.
              </Text>
              <ButtonLink href="#" onClick={(e) => e.preventDefault()}>
                Open Drafts
              </ButtonLink>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-kit-controls">
              <Button
                variant="action"
                aria-describedby={hookId}
                pending={pending}
                pendingLabel="Drafting…"
                onClick={async () => {
                  setPending(true)
                  await onDraft(angle)
                  setPending(false)
                }}
              >
                Draft this idea
              </Button>
              <Button onClick={() => onDrop(angle)}>Not this one</Button>
            </div>
          )}
          {!drafted ? (
            <Text variant="small" tone="muted">
              {writes === 0 ? "No channel for this yet." : `Writes ${writes === 1 ? "one post" : `${writes} posts`}.`}
            </Text>
          ) : null}
        </div>
      ) : drafted ? (
        <Text variant="small" tone="muted">
          Drafted
        </Text>
      ) : null}
    </li>
  )
}

"use client"

import * as React from "react"

import type { Riff } from "@/lib/riffs"
import {
  Button,
  KitPage,
  List,
  ListHeading,
  ListRow,
  Stage,
  STAGE_STACK,
  UndoBar,
  useRevealOnNarrow,
} from "@/components/kit"
import { Friend } from "@/components/mascot"
import { RiffCard, dismissedSentence, pickAngle, riffTitle } from "@/components/quincy"

import { GAPS, WRITES } from "../fixtures"
import { Capture, NothingYet, summaryFor, type Controls } from "../parts"
import { groupByDay, isWaiting, totalWaiting, waitingIdeas, type FrameId, type Queue } from "../queue"

/**
 * 1 · Beside — today's /ideas (components/riffs/ideas-screen.tsx), rebuilt
 * on the lab's queue so it works without a session. Same markup and the
 * same classes, with two of its numbers on controls: the list column
 * (`--container-kit-list`, 24rem) and the split breakpoint
 * (`--container-kit-split`, 66rem). A container query cannot read a
 * variable, so the lab measures the Stage instead of using
 * `@kit-split/kit-stage:`; the result is the same at the defaults.
 */

function rowDescription(riff: Riff): string {
  const from = riff.sourceLabel || "Written here"
  if (riff.state === "working") return `${from} · reading it now`
  if (riff.state === "failed") return `${from} · I couldn't find a post in it`
  if (riff.angles.length === 0) return `${from} · nothing left on it`
  const n = waitingIdeas(riff)
  if (n === 0) return `${from} · every idea drafted`
  return `${from} · ${n === 1 ? "one idea" : `${n} ideas`}`
}

function useStageWidth(ref: React.RefObject<HTMLElement | null>) {
  const [w, setW] = React.useState(0)
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return w
}

export function Beside({ q, frame, c }: { q: Queue; frame: FrameId; c: Controls }) {
  const riffs = q.riffs
  const openId = q.open.beside
  const open = riffs.find((r) => r.id === openId) ?? riffs.find(isWaiting) ?? riffs[0] ?? null
  const [showAll, setShowAll] = React.useState(false)
  const stageRef = React.useRef<HTMLElement>(null)
  const width = useStageWidth(stageRef)
  const split = width >= c.splitRem * 16
  const detailRef = useRevealOnNarrow<HTMLDivElement>(open?.id)

  const waiting = totalWaiting(riffs)
  const pickIsAction = open != null && open.state === "ready" && pickAngle(open) != null

  const capped = !showAll && riffs.length > c.rowCap
  let visible = capped ? riffs.slice(0, c.rowCap) : riffs
  if (capped && open && !visible.includes(open)) visible = [...visible.slice(0, c.rowCap - 1), open]
  const hidden = riffs.length - visible.length

  const dismiss = (riff: Riff) => {
    const at = riffs.findIndex((r) => r.id === riff.id)
    const rest = riffs.filter((r) => r.id !== riff.id)
    const next = rest.slice(Math.max(at, 0)).find(isWaiting) ?? rest.find(isWaiting) ?? rest[0]
    q.dismiss(riff, frame)
    q.setOpen("beside", next?.id ?? null)
  }

  const notices = (
    <UndoBar
      show={q.undo != null && q.undo.from === frame}
      width={riffs.length === 0 ? "full" : "with-margin"}
      onUndo={() => {
        const id = q.undo?.riff.id
        q.restore()
        if (id) q.setOpen("beside", id)
      }}
    >
      {q.undo ? dismissedSentence(q.undo.riff) : null}
    </UndoBar>
  )

  const container = split ? "[container:kit-stage/inline-size]" : ""

  return (
    <KitPage title="Ideas" summary={summaryFor(riffs)} width="wide">
      <Stage
        aria-label="Say what happened"
        lead="Say what happened."
        rest="However it comes out. I read through the false starts and find the posts in it."
      >
        <Capture isAction={!pickIsAction} />
      </Stage>

      <Stage
        ref={stageRef}
        aria-label="Ideas"
        {...(riffs.length > 0
          ? waiting > 0
            ? { lead: "This is what came back.", rest: "Open one to see the ideas I found in it, and why." }
            : { lead: "Everything here is decided.", rest: "Dismiss what you are done with, or say something new." }
          : {})}
      >
        {riffs.length === 0 ? (
          <NothingYet />
        ) : (
          <div
            className={split ? "grid items-start self-stretch gap-x-kit-page-gutter" : "flex flex-col gap-kit-stack self-stretch"}
            style={split ? { gridTemplateColumns: `${c.listRem}rem minmax(0,1fr)` } : undefined}
          >
            <div
              className={`${STAGE_STACK} ${container} ${split ? "sticky top-kit-group max-h-[calc(var(--lab-frame-h,100svh)-2*var(--spacing-kit-group))]" : ""}`}
            >
              <div className={`self-stretch ${split ? "-m-kit-related min-h-0 overflow-y-auto overscroll-contain p-kit-related" : ""}`}>
                <List width="with-margin" aria-label="Ideas">
                  {groupByDay(visible).map(([day, dayRiffs]) => (
                    <React.Fragment key={day}>
                      <ListHeading>{day}</ListHeading>
                      {dayRiffs.map((r) => (
                        <ListRow
                          key={r.id}
                          selected={r.id === open?.id}
                          titleLines={c.titleLines === "2" ? 2 : 1}
                          leading={r.state === "working" ? <Friend size={20} state="reading" className="shrink-0" /> : undefined}
                          description={rowDescription(r)}
                          onClick={() => q.setOpen("beside", r.id)}
                        >
                          {riffTitle(r)}
                        </ListRow>
                      ))}
                    </React.Fragment>
                  ))}
                  {hidden > 0 ? <ListRow onClick={() => setShowAll(true)}>{`Show ${hidden} more`}</ListRow> : null}
                </List>
              </div>
              {split ? notices : null}
            </div>

            {open ? (
              <div className={`min-w-0 ${container}`}>
                <RiffCard
                  key={open.id}
                  ref={detailRef}
                  riff={open}
                  isAction={pickIsAction}
                  writes={WRITES}
                  onDraft={q.draft}
                  onDismiss={dismiss}
                  angleExtra={(angle) =>
                    angle.status === "drafted" ? null : <Button onClick={() => q.drop(angle.id)}>Not this one</Button>
                  }
                >
                  {(GAPS[open.id] ?? []).length > 0 ? <GapLine label={GAPS[open.id]![0]!.label} /> : null}
                </RiffCard>
              </div>
            ) : null}
          </div>
        )}
        {split && riffs.length > 0 ? null : notices}
      </Stage>
    </KitPage>
  )
}

/** ChannelGaps' sentence, without its server action. */
function GapLine({ label }: { label: string }) {
  const [asked, setAsked] = React.useState(false)
  return (
    <div className="flex flex-wrap items-center gap-kit-related">
      <span className="text-kit-small text-kit-ink-muted">
        {asked ? `In the lab, asking for a ${label} idea is not wired.` : `Nothing here goes to ${label}.`}
      </span>
      {asked ? null : <Button onClick={() => setAsked(true)}>{`Make one for ${label}`}</Button>}
    </div>
  )
}

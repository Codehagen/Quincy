"use client"

import * as React from "react"

import type { Angle, Riff } from "@/lib/riffs"
import { Highlight, TextLink } from "@/components/kit"
import { Friend } from "@/components/mascot"
import { FOCUS_RING, HIT_44 } from "@/components/kit/control-styles"
import { ideasFrom } from "@/components/quincy"

import { readingsFor } from "../../ideas-lab/fixtures"
import type { Row } from "../data"
import type { Workspace } from "../use-workspace"
import { Age, Channels, ShapeTag, SourceCell, StatusPill } from "./cells"
import { WsButton } from "./toolbar"

/**
 * "Marked up" (ideas-lab direction 4, which the owner picked on 2026-11-16)
 * as the detail of a workspace: your own words set as prose, every sentence
 * an idea stands on underlined in the pen, the open one highlighted, and
 * the ideas listed in the margin in reading order. Adapted from
 * ../ideas-lab/directions/marked-up.tsx; the Card and Stage around it are
 * gone, because here the pane is the object.
 *
 * Needs `Angle.line` (quincy-riffs.md, "Data gaps"). An idea with no line
 * is listed under "From the whole note".
 */

type Mark = { angle: Angle; n: number; at: number; line: string; note?: string }

function marksFor(riff: Riff) {
  const readings = readingsFor(riff)
  const placed: Omit<Mark, "n">[] = []
  for (const angle of riff.angles) {
    const r = readings[angle.id]
    const at = r ? riff.scrap.indexOf(r.line) : -1
    if (r && at >= 0) placed.push({ angle, line: r.line, note: r.note, at })
  }
  placed.sort((x, y) => x.at - y.at)
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

export function MarkedUp({
  ws,
  row,
  /** Inline and on a phone: no source header (the row above says it), tighter padding. */
  inline = false,
  /**
   * Table: the source and age sit in a 32px sticky strip that lines up with
   * the table's column heads, so one hairline runs across both panes; the
   * heading starts the body under it.
   */
  strip = false,
}: {
  ws: Workspace
  row: Row | null
  inline?: boolean
  strip?: boolean
}) {
  const titleId = React.useId()
  if (!row) {
    return (
      <div className="flex flex-col">
        {strip ? <div aria-hidden className="sticky top-0 h-(--ws-head-h) border-b border-kit-hairline bg-kit-ground" /> : null}
        <div className="flex flex-col items-start gap-kit-tight px-kit-group pt-kit-group">
          <p className="ws-row-title font-kit-strong text-kit-ink">Nothing open.</p>
          <p className="ws-row-title text-pretty text-kit-ink-muted">Pick an idea, or press j, to see the sentence it came from.</p>
        </div>
      </div>
    )
  }
  const riff = row.riff
  // Rows still on the page decide which ideas the margin lists: a dropped
  // idea leaves the margin too.
  const live = new Map(ws.rows.filter((r) => r.riff.id === riff.id && r.angle).map((r) => [r.id, r]))
  const visible = { ...riff, angles: riff.angles.filter((a) => live.has(a.id)) }
  const { marks, loose } = marksFor(visible)
  const openId = row.angle?.id ?? null

  const prose: React.ReactNode[] = []
  let from = 0
  for (const m of marks) {
    prose.push(riff.scrap.slice(from, m.at))
    const open = m.angle.id === openId
    // A pointer shortcut only: the margin list is the keyboard's path to
    // each idea, so a mark is not a second tab stop. Its name is the
    // sentence itself (the person's own words), then which idea it is.
    prose.push(
      <span
        key={m.angle.id}
        role="button"
        tabIndex={-1}
        aria-pressed={open}
        onClick={() => ws.select(m.angle.id)}
        className={`cursor-pointer rounded-kit-chip ${FOCUS_RING} ${open ? "" : "underline decoration-kit-pen decoration-[1.5px] underline-offset-4 transition-[text-decoration-color] duration-(--kit-duration-state) hover:decoration-kit-ink motion-reduce:transition-none"}`}
      >
        {open ? <Highlight active>{m.line}</Highlight> : m.line}
        <sup aria-hidden className="ml-0.5 font-kit-mono text-kit-mono text-kit-pen">
          {m.n}
        </sup>
        <span className="sr-only">{` (idea ${m.n})`}</span>
      </span>
    )
    from = m.at + m.line.length
  }
  prose.push(riff.scrap.slice(from))

  const head = riff.state === "ready" && riff.angles.length > 0 ? ideasFrom(riff).replace(/\.$/, "") : riff.sourceLabel

  return (
    <article aria-labelledby={titleId} className="@container/doc flex flex-col">
      {strip ? (
        <div className="sticky top-0 z-[1] flex h-(--ws-head-h) shrink-0 items-center gap-2 border-b border-kit-hairline bg-kit-ground px-kit-group">
          <SourceCell riff={riff} />
          <span aria-hidden className="ws-meta text-kit-ink-muted">·</span>
          <Age riff={riff} />
        </div>
      ) : null}
      <header className={`flex flex-col gap-kit-tight ${inline ? "sr-only" : "px-kit-group pt-kit-group pb-kit-related"}`}>
        {strip ? null : (
          <div className="flex items-center gap-2">
            <SourceCell riff={riff} />
            <span aria-hidden className="ws-meta text-kit-ink-muted">·</span>
            <Age riff={riff} />
          </div>
        )}
        <h2 id={titleId} className="ws-page-title text-balance text-kit-ink">
          {head}
        </h2>
      </header>

      <div
        className={`grid gap-x-kit-group gap-y-kit-group ${inline ? "py-kit-related" : "px-kit-group pb-kit-group"} @[38rem]/doc:grid-cols-[minmax(0,1fr)_14rem]`}
      >
        <div className="flex min-w-0 flex-col gap-kit-related">
          {/* Your words: the one place on the page set for reading, so it
              gets reading leading (14/24) and a measure, not the row type. */}
          <p className="max-w-[62ch] leading-6 text-pretty text-kit-ink">{prose}</p>
          {riff.state === "working" ? (
            <p role="status" className="text-kit-ink-muted">
              <span className="inline-flex items-center gap-2">
                <Friend size={20} state="reading" className="shrink-0" />
                <span className="min-w-0">
                  Reading it. Marks usually land within a minute.
                </span>
              </span>
            </p>
          ) : riff.state === "failed" ? (
            <p role="status" className="text-kit-ink-muted">
              {`Nothing to mark here. ${riff.failure}`}
            </p>
          ) : null}
        </div>

        {riff.state === "ready" && (marks.length > 0 || loose.length > 0) ? (
          <section aria-label="Ideas in the margin" className="flex min-w-0 flex-col gap-1">
            <p className="ws-meta pb-1 font-kit-strong text-kit-ink-muted">In the margin</p>
            <ol className="flex flex-col gap-1">
              {marks.map((m) => (
                <Note key={m.angle.id} ws={ws} row={live.get(m.angle.id)!} n={m.n} note={m.note} open={m.angle.id === openId} />
              ))}
              {loose.length > 0 ? <li className="ws-meta pt-kit-related text-kit-ink-muted">From the whole note</li> : null}
              {loose.map((a) => (
                <Note key={a.id} ws={ws} row={live.get(a.id)!} open={a.id === openId} />
              ))}
            </ol>
          </section>
        ) : null}
      </div>
    </article>
  )
}

function Note({ ws, row, n, note, open }: { ws: Workspace; row: Row; n?: number; note?: string; open: boolean }) {
  const angle = row.angle!
  const hookId = React.useId()
  const done = row.status === "drafted"
  const pending = ws.pending.has(row.id)
  return (
    <li
      data-open={open || undefined}
      className="flex flex-col rounded-kit-control-inner transition-[background-color,box-shadow] duration-(--kit-duration-state) ease-kit-out data-open:bg-kit-object data-open:shadow-kit-inset motion-reduce:transition-none"
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => ws.select(angle.id)}
        className={`relative flex items-baseline gap-2 rounded-kit-control-inner px-2.5 py-2 text-left ${FOCUS_RING} focus-visible:outline-offset-0 ${HIT_44} ${open ? "" : "hover:bg-kit-row-hover"}`}
      >
        <span aria-hidden className="w-3 shrink-0 font-kit-mono text-kit-mono text-kit-pen">
          {n ?? "·"}
        </span>
        <span id={hookId} className={`ws-row-title min-w-0 flex-1 ${open ? "font-kit-strong text-kit-ink" : done ? "text-kit-ink-muted" : "text-kit-ink"}`}>
          {angle.hook}
        </span>
        {row.status !== "waiting" ? <StatusPill status={row.status} withWord={false} /> : null}
      </button>

      {open ? (
        <div className="flex flex-col gap-kit-related px-2.5 pb-2.5 pl-7.5">
          {note ? (
            <span aria-hidden className="-mt-1 inline-block -rotate-2 font-kit-hand text-kit-hand text-kit-pen">
              {note}
            </span>
          ) : null}
          {/* One muted line, the facts separated by a dot: as text tags,
              "Story Thread" side by side would read as one name. */}
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            {angle.kind ? (
              <>
                <ShapeTag>{angle.kind}</ShapeTag>
                <span aria-hidden className="ws-meta text-kit-ink-muted">·</span>
              </>
            ) : null}
            <ShapeTag>{angle.shape}</ShapeTag>
            {row.channels.length > 0 ? <span aria-hidden className="ws-meta text-kit-ink-muted">·</span> : null}
            <Channels channels={row.channels} />
          </div>
          {angle.why ? <p className="ws-meta text-pretty text-kit-ink-muted">{angle.why}</p> : null}
          {done ? (
            <p className="ws-meta flex flex-wrap items-center gap-x-2 text-kit-ink-muted">
              Drafted. It waits in Drafts.
              <TextLink href="#" onClick={(e) => e.preventDefault()}>
                Open Drafts
              </TextLink>
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-kit-controls">
              <WsButton
                variant="action"
                size="sm"
                hint="D"
                aria-keyshortcuts="d"
                aria-describedby={hookId}
                pending={pending}
                pendingLabel="Drafting…"
                onClick={(e) => ws.draft(row, e.currentTarget)}
              >
                Draft this idea
              </WsButton>
              {/* Each takes its own button away; `from` sends focus to the row that opens next. */}
              <WsButton variant="ghost" size="sm" hint="N" aria-keyshortcuts="n" aria-describedby={hookId} onClick={(e) => ws.drop(row, e.currentTarget)}>
                Not this one
              </WsButton>
              <WsButton variant="ghost" size="sm" hint="L" aria-keyshortcuts="l" aria-describedby={hookId} onClick={(e) => ws.toggleLater(row, e.currentTarget)}>
                {row.status === "later" ? "Not later" : "Later"}
              </WsButton>
            </div>
          )}
        </div>
      ) : null}
    </li>
  )
}

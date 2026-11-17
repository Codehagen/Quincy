"use client"

import * as React from "react"

import {
  DataListMeta,
  DataListMono,
  DataListTitle,
  SourceGlyph,
  StatusPill,
  type DataListColumn,
} from "@/components/kit"
import { hasPlatformMark, PlatformMark } from "@/components/channels/platform-mark"

import { fromName, type Row } from "./draft-rows"

/*
 * The cells of a draft row: one fact in one shape per column, so a column
 * reads down as well as across. Each says its words to assistive tech; a
 * row is read as one sentence.
 */

/** The glyph for where it came from: X for a saved post, the source's own mark for your work. */
export function FromGlyph({ row }: { row: Row }) {
  return (
    <span className="grid place-items-center text-kit-ink-muted">
      {/* SourceGlyph draws nothing for `notes` (one live draft has it): the pen, as for pasted material. */}
      <SourceGlyph id={row.draft.from.sourceId === "notes" ? "" : row.draft.from.sourceId} size="dense" />
      <span className="sr-only">{row.draft.from.adaptedFrom ? `Adapted from ${fromName(row)}` : `From your ${row.draft.from.sourceLabel}`}</span>
    </span>
  )
}

export function Channels({ row }: { row: Row }) {
  const vs = row.draft.versions
  return (
    <span className="inline-flex items-center gap-1.5 text-kit-ink-muted">
      <span className="sr-only">{`For ${vs.map((v) => v.label).join(" and ")}`}</span>
      {vs.map((v) =>
        hasPlatformMark(v.channel) ? (
          <span key={v.id} aria-hidden className={`grid size-4 place-items-center ${v.state === "approved" ? "text-kit-ink" : ""}`}>
            <PlatformMark platform={v.channel} size={13} />
          </span>
        ) : (
          <span key={v.id} aria-hidden className="text-kit-meta">
            {v.label}
          </span>
        )
      )}
    </span>
  )
}

/**
 * What happens next, in two words. Waiting has no pill (StatusPill: the
 * default renders nothing); the rest reuse the four marks the kit has:
 * the friend reading for sending, the clock for a time, the tick for decided, the
 * alert for what did not go.
 */
export function NextCell({ row }: { row: Row }) {
  const g = row.going
  switch (g.kind) {
    case "writing": {
      const left = row.draft.versions.filter((v) => v.state === "writing").length
      return row.draft.versions.length > 1 ? <DataListMeta>{`${left} of ${row.draft.versions.length} left`}</DataListMeta> : null
    }
    case "scheduled":
      return <StatusPill status="later">{g.at.replace(/,.*$/, "")}</StatusPill>
    case "sending":
      return <StatusPill status="reading">Sending</StatusPill>
    case "published":
      return <StatusPill status="drafted">Sent</StatusPill>
    case "failed":
      return <StatusPill status="failed">Didn’t go</StatusPill>
    default:
      return <StatusPill status="drafted">No time</StatusPill>
  }
}

/** The opening line, the words the feed will show first (the idea is the pane's heading). */
export function RowTitle({ row }: { row: Row }) {
  return <DataListTitle quiet={row.bucket === "sent"}>{row.opening || row.draft.idea}</DataListTitle>
}

/** The table beside the feed pane: what it goes to and what happens next, as marks only (the words go to assistive tech). */
export function CompactCell({ row }: { row: Row }) {
  const g = row.going
  const status =
    g.kind === "writing" ? null : g.kind === "scheduled" ? (
      <StatusPill status="later" hideWord>{`Goes out ${g.at}`}</StatusPill>
    ) : g.kind === "sending" ? (
      <StatusPill status="reading" hideWord>Sending</StatusPill>
    ) : g.kind === "published" ? (
      <StatusPill status="drafted" hideWord>Sent</StatusPill>
    ) : g.kind === "failed" ? (
      <StatusPill status="failed" hideWord>Didn’t go</StatusPill>
    ) : (
      <StatusPill status="drafted" hideWord>Approved, no time</StatusPill>
    )
  return (
    <span className="inline-flex items-center gap-1.5">
      <Channels row={row} />
      {status}
    </span>
  )
}

/**
 * The table beside the feed: Opening line, a marks cell (the channels and
 * what happens next) and Age. The pane takes the whole feed column, so the
 * list keeps only what a scan needs.
 */
export const DRAFT_COLUMNS: readonly DataListColumn<Row>[] = [
  { id: "title", header: "Opening line", width: "minmax(0,1fr)", cell: (r) => <RowTitle row={r} />, skeleton: "title" },
  { id: "marks", header: "", width: "4rem", cell: (r) => <CompactCell row={r} /> },
  { id: "age", header: "Age", width: "3.25rem", align: "end", cell: (r) => <DataListMono>{r.draft.from.at}</DataListMono> },
]

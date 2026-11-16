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

import type { Row } from "../use-drafts"

/*
 * The cells of a draft row: one fact in one shape per column, so a column
 * reads down as well as across. Each says its words to assistive tech; a
 * row is read as one sentence.
 */

/** "@mara_ships", or the source by name for your own work. */
export function fromName(row: Row) {
  const a = row.draft.from.adaptedFrom
  return a?.handle ? `@${a.handle}` : row.draft.from.sourceLabel || "Pasted"
}

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
 * the live dot for sending, the clock for a time, the tick for decided, the
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

export function RowTitle({ row, use }: { row: Row; use: "opening" | "idea" }) {
  return <DataListTitle quiet={row.bucket === "sent"}>{use === "idea" ? row.draft.idea : row.opening}</DataListTitle>
}

export function columns(use: "opening" | "idea"): readonly DataListColumn<Row>[] {
  return [
    { id: "glyph", header: "", width: "1rem", cell: (r) => <FromGlyph row={r} />, skeleton: "glyph" },
    { id: "title", header: use === "idea" ? "Draft" : "Opening line", width: "minmax(0,1fr)", cell: (r) => <RowTitle row={r} use={use} />, skeleton: "title" },
    { id: "from", header: "From", width: "8.5rem", wide: true, cell: (r) => <DataListMeta>{fromName(r)}</DataListMeta> },
    { id: "for", header: "For", width: "2.5rem", cell: (r) => <Channels row={r} /> },
    { id: "next", header: "Next", width: "5.5rem", cell: (r) => <NextCell row={r} /> },
    { id: "age", header: "Age", width: "3.25rem", align: "end", cell: (r) => <DataListMono>{r.draft.from.at}</DataListMono> },
  ]
}

/**
 * The fixed tracks plus gaps, for the fold rule: glyph 16, for 40, next 88,
 * age 52, five 12px gaps, and the row's 8 inset + 12 padding on each side.
 * The From column is wide-only.
 */
export const ROW_FIXED_PX = 16 + 40 + 88 + 52 + 5 * 12 + 40
export const FROM_COLUMN_PX = 136 + 12
export const DATA_WIDE_PX = 736

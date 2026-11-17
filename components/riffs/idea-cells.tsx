"use client"

import * as React from "react"

import {
  DataListMeta,
  DataListMono,
  DataListTitle,
  SourceGlyph,
  StatusMark,
  Tag,
  type DataListColumn,
} from "@/components/kit"
import { hasPlatformMark, PlatformMark } from "@/components/channels/platform-mark"

import { ageOf, channelPhrase, sourceName, type IdeaRow } from "./idea-rows"

/*
 * The cells of an idea row. Each is one fact in one shape, so a column reads
 * down as well as across; each says its words to assistive tech, since a row
 * is read as one sentence.
 */

/** Where Draft would put it, as marks; the names once, as a sentence, to assistive tech. */
export function IdeaChannels({ channels }: { channels: IdeaRow["channels"] }) {
  if (channels.length === 0) {
    return (
      <span className="text-kit-meta text-kit-ink-muted">
        <span aria-hidden>—</span>
        <span className="sr-only">No channel</span>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-kit-ink-muted">
      <span className="sr-only">{`For ${channelPhrase(channels)}`}</span>
      {channels.map((c) =>
        hasPlatformMark(c.id) ? (
          <span key={c.id} aria-hidden className="grid size-4 place-items-center *:size-[80%]">
            <PlatformMark platform={c.id} size={13} />
          </span>
        ) : (
          <span key={c.id} aria-hidden className="text-kit-meta">
            {c.label}
          </span>
        )
      )}
    </span>
  )
}

/**
 * The shape column: the idea's shape as a text tag, or, for a row with no
 * idea, its state. Waiting has no pill; an emptied source says so in words.
 */
export function IdeaShape({ row }: { row: IdeaRow }) {
  if (row.angle) return <Tag look="text">{row.angle.shape}</Tag>
  if (row.status === "reading") return <StatusMark status="reading" />
  if (row.status === "failed") return <StatusMark status="failed" />
  return <DataListMeta>No ideas left</DataListMeta>
}

/** The title, muted when there is nothing to do on it, with Drafted beside it. */
export function IdeaTitle({ row }: { row: IdeaRow }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <DataListTitle quiet={row.status !== "waiting"}>{row.title}</DataListTitle>
      {row.status === "drafted" ? <StatusMark status="drafted" /> : null}
    </span>
  )
}

/**
 * The table's columns. `Source` is wide-only: under 46rem the glyph column
 * already shows where it came from, and the sr-only name says it.
 */
export const IDEA_COLUMNS: readonly DataListColumn<IdeaRow>[] = [
  {
    id: "glyph",
    header: "",
    width: "1rem",
    skeleton: "glyph",
    cell: (r) => (
      <span className="grid place-items-center text-kit-ink-muted">
        <SourceGlyph id={r.riff.sourceId} size="dense" />
        <span className="sr-only">{`${sourceName(r.riff)}: `}</span>
      </span>
    ),
  },
  { id: "idea", header: "Idea", width: "minmax(0,1fr)", skeleton: "title", cell: (r) => <IdeaTitle row={r} /> },
  {
    id: "source",
    header: "Source",
    width: "7.5rem",
    wide: true,
    // The glyph column's sr-only name already says it.
    cell: (r) => <span aria-hidden className="flex min-w-0"><DataListMeta>{sourceName(r.riff)}</DataListMeta></span>,
  },
  { id: "shape", header: "Shape", width: "5.5rem", cell: (r) => <IdeaShape row={r} /> },
  { id: "for", header: "For", width: "3.25rem", cell: (r) => <IdeaChannels channels={r.channels} /> },
  {
    id: "age",
    header: "Age",
    width: "3rem",
    align: "end",
    cell: (r) => <DataListMono>{ageOf(r.riff)}</DataListMono>,
  },
]

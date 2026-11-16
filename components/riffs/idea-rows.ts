/**
 * Ideas as rows (docs/design/workspace.md): one row per idea (an angle), so
 * the table can carry the idea's own columns (source, shape, where it goes,
 * age). A source still being read, one that failed, or one with no ideas
 * left has no idea to stand for it, so it is a row of its own with a status
 * in the shape column.
 *
 * Pure and client-safe: the page derives the rows from the riffs the server
 * read, minus what the person set aside on this page and has not had written
 * yet.
 */

import { CHANNELS_FOR_SHAPE, type Angle, type Riff } from "@/lib/riffs"
import { riffTitle } from "@/components/quincy"

/**
 * `waiting` — an idea nobody has drafted. `drafted` — done. `reading` —
 * Quincy is reading the source now. `failed` — no post came of it. `empty` —
 * a source whose ideas were all set aside.
 */
export type IdeaStatus = "waiting" | "drafted" | "reading" | "failed" | "empty"

export type IdeaRow = {
  /** The angle id; for a row with no idea, the riff id. What `?idea=` holds. */
  key: string
  riff: Riff
  angle: Angle | null
  title: string
  status: IdeaStatus
  /** Where Draft would put it (`CHANNELS_FOR_SHAPE`). */
  channels: readonly { id: string; label: string }[]
}

/** Rows newest source first, each source's ideas in the model's order. `gone` holds keys set aside here. */
export function ideaRows(riffs: readonly Riff[], gone: ReadonlySet<string>): IdeaRow[] {
  const rows: IdeaRow[] = []
  for (const source of riffs) {
    if (gone.has(source.id)) continue
    const riff = { ...source, angles: source.angles.filter((a) => !gone.has(a.id)) }
    if (riff.state !== "ready" || riff.angles.length === 0) {
      rows.push({
        key: riff.id,
        riff,
        angle: null,
        title: riffTitle(source),
        status: riff.state === "working" ? "reading" : riff.state === "failed" ? "failed" : "empty",
        channels: [],
      })
      continue
    }
    for (const angle of riff.angles) {
      rows.push({
        key: angle.id,
        riff,
        angle,
        title: angle.hook,
        status: angle.status === "drafted" ? "drafted" : "waiting",
        channels: CHANNELS_FOR_SHAPE[angle.shape] ?? [],
      })
    }
  }
  return rows
}

/** Still asks something of the person: an idea waiting, or a source to read, retry or let go. */
export function isOpen(row: IdeaRow) {
  return row.status !== "drafted"
}

/* ── Filters ─────────────────────────────────────────────────────────── */

/**
 * There is no "Later": `riff_angle` has no column for it, and a later held
 * only in the browser would come back as waiting on the next visit.
 */
export type StatusFilter = "open" | "drafted" | "all"

export type IdeaFilters = {
  q: string
  source: string
  shape: string
  channel: string
  status: StatusFilter
}

export const NO_FILTERS: IdeaFilters = { q: "", source: "all", shape: "all", channel: "all", status: "open" }

/** Any filter but the status on: what Clear clears. */
export function filtersOn(f: IdeaFilters) {
  return f.q !== "" || f.source !== "all" || f.shape !== "all" || f.channel !== "all"
}

function statusMatches(row: IdeaRow, f: StatusFilter) {
  if (f === "all") return true
  return f === "open" ? isOpen(row) : row.status === "drafted"
}

export function matches(row: IdeaRow, f: IdeaFilters, except?: keyof IdeaFilters) {
  if (except !== "q" && f.q) {
    const q = f.q.toLowerCase()
    if (!row.title.toLowerCase().includes(q) && !row.riff.scrap.toLowerCase().includes(q)) return false
  }
  if (except !== "source" && f.source !== "all" && sourceName(row.riff) !== f.source) return false
  if (except !== "shape" && f.shape !== "all" && row.angle?.shape !== f.shape) return false
  if (except !== "channel" && f.channel !== "all" && !row.channels.some((c) => c.id === f.channel)) return false
  if (except !== "status" && !statusMatches(row, f.status)) return false
  return true
}

export type CountedOption<V extends string> = { value: V; label: string; count: number }

/** One filter's options, each with how many rows it would leave given the other filters. */
export function optionsFor(rows: readonly IdeaRow[], f: IdeaFilters, key: "source" | "shape" | "channel"): CountedOption<string>[]
export function optionsFor(rows: readonly IdeaRow[], f: IdeaFilters, key: "status"): CountedOption<StatusFilter>[]
export function optionsFor(rows: readonly IdeaRow[], f: IdeaFilters, key: "source" | "shape" | "channel" | "status") {
  const pool = rows.filter((r) => matches(r, f, key))
  const count = (pred: (r: IdeaRow) => boolean) => pool.filter(pred).length
  if (key === "status") {
    return (
      [
        ["open", "Open"],
        ["drafted", "Drafted"],
        ["all", "All"],
      ] as const
    ).map(([value, label]) => ({ value, label, count: count((r) => statusMatches(r, value)) }))
  }
  if (key === "source") {
    const names = [...new Set(rows.map((r) => sourceName(r.riff)))]
    return [
      { value: "all", label: "Any source", count: pool.length },
      ...names.map((n) => ({ value: n, label: n, count: count((r) => sourceName(r.riff) === n) })),
    ]
  }
  if (key === "shape") {
    const shapes = [...new Set(rows.flatMap((r) => (r.angle ? [r.angle.shape] : [])))]
    return [
      { value: "all", label: "Any shape", count: pool.length },
      ...shapes.map((s) => ({ value: s, label: s, count: count((r) => r.angle?.shape === s) })),
    ]
  }
  const channels = new Map<string, string>()
  for (const r of rows) for (const c of r.channels) channels.set(c.id, c.label)
  return [
    { value: "all", label: "Any channel", count: pool.length },
    ...[...channels].map(([id, label]) => ({ value: id, label, count: count((r) => r.channels.some((c) => c.id === id)) })),
  ]
}

/* ── Words ───────────────────────────────────────────────────────────── */

/** The source as the page names it: "Voice notes", "GitHub", or "Written here" for typed text. */
export function sourceName(riff: Pick<Riff, "sourceLabel">) {
  return riff.sourceLabel.trim() || "Written here"
}

/**
 * The age for the mono column, from the day string the server rendered
 * (`formatConversationDate`): "Today" → "today", "Yesterday" → "1d",
 * "3 days ago" → "3d", "26 Aug" as it is.
 */
export function ageOf(riff: Pick<Riff, "capturedAt">) {
  const a = riff.capturedAt
  if (a === "Today") return "today"
  if (a === "Yesterday") return "1d"
  const m = a.match(/^(\d+) days? ago$/)
  return m ? `${m[1]}d` : a
}

/** "Today", "Yesterday", then everything older under "Earlier": the narrow list's day groups. */
export function dayOf(riff: Pick<Riff, "capturedAt">) {
  return riff.capturedAt === "Today" || riff.capturedAt === "Yesterday" ? riff.capturedAt : "Earlier"
}

/** "X and LinkedIn". */
export function channelPhrase(channels: readonly { label: string }[]) {
  const labels = channels.map((c) => c.label)
  if (labels.length <= 1) return labels.join("")
  return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`
}

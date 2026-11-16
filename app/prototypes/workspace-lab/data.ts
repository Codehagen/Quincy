/**
 * The workspace lab's rows, derived from the ideas lab's fixtures
 * (../ideas-lab/fixtures.ts, owner's brief: reuse them). All fictional.
 *
 * Ideas is a list of *ideas* here, not of sources: one row per angle, so a
 * table can carry the idea's own columns (source, shape, channels, age).
 * A source still being read, or one that failed, has no ideas yet, so it is
 * a row of its own with a status in place of the shape.
 */

import { CHANNELS_FOR_SHAPE, type Angle, type Riff } from "@/lib/riffs"
import { riffTitle } from "@/components/quincy"

import { LAB_RIFFS } from "../ideas-lab/fixtures"

export { LAB_RIFFS }

export type RowStatus = "waiting" | "later" | "drafted" | "reading" | "failed"

export type Row = {
  /** The angle id, or the riff id for a row that has no ideas yet. */
  id: string
  riff: Riff
  angle: Angle | null
  title: string
  status: RowStatus
  channels: { id: string; label: string }[]
}

/**
 * The person's own baseline, for the one number the page states: ideas they
 * draft in a usual week. Fixture; on /ideas it would be the median of the
 * last eight weeks of drafted angles.
 */
export const DRAFTED_PER_WEEK = 4

export type Store = {
  drafted: ReadonlySet<string>
  dropped: ReadonlySet<string>
  later: ReadonlySet<string>
}

export function rowsFor(riffs: readonly Riff[], s: Store): Row[] {
  const rows: Row[] = []
  for (const riff of riffs) {
    if (riff.state !== "ready" || riff.angles.length === 0) {
      rows.push({
        id: riff.id,
        riff,
        angle: null,
        title: riffTitle(riff),
        status: riff.state === "working" ? "reading" : "failed",
        channels: [],
      })
      continue
    }
    for (const angle of riff.angles) {
      if (s.dropped.has(angle.id)) continue
      rows.push({
        id: angle.id,
        riff,
        angle,
        title: angle.hook,
        status: s.drafted.has(angle.id) ? "drafted" : s.later.has(angle.id) ? "later" : "waiting",
        channels: CHANNELS_FOR_SHAPE[angle.shape] ?? [],
      })
    }
  }
  return rows
}

/* ── Filters ─────────────────────────────────────────────────────────── */

export type StatusFilter = "open" | "later" | "drafted" | "all"

export type Filters = {
  q: string
  source: string
  shape: string
  channel: string
  status: StatusFilter
  /** One source's ideas only (the three-pane layout's rail). */
  riff: string
}

export const NO_FILTERS: Filters = { q: "", source: "all", shape: "all", channel: "all", status: "open", riff: "all" }

/** Open is what still asks something of you: waiting ideas, and sources being read or failed. */
function statusMatches(row: Row, f: StatusFilter) {
  if (f === "all") return true
  if (f === "open") return row.status === "waiting" || row.status === "reading" || row.status === "failed"
  return row.status === f
}

export function matches(row: Row, f: Filters, except?: keyof Filters) {
  if (except !== "q" && f.q) {
    const q = f.q.toLowerCase()
    if (!row.title.toLowerCase().includes(q) && !row.riff.scrap.toLowerCase().includes(q)) return false
  }
  if (except !== "source" && f.source !== "all" && row.riff.sourceLabel !== f.source) return false
  if (except !== "shape" && f.shape !== "all" && row.angle?.shape !== f.shape) return false
  if (except !== "channel" && f.channel !== "all" && !row.channels.some((c) => c.id === f.channel)) return false
  if (except !== "status" && !statusMatches(row, f.status)) return false
  if (except !== "riff" && f.riff !== "all" && row.riff.id !== f.riff) return false
  return true
}

/** The options of one filter, each with how many rows it would show given the other filters. */
export function optionsFor(rows: Row[], f: Filters, key: "source" | "shape" | "channel" | "status") {
  const pool = rows.filter((r) => matches(r, f, key))
  const count = (pred: (r: Row) => boolean) => pool.filter(pred).length
  if (key === "status") {
    return (
      [
        ["open", "Open"],
        ["later", "Later"],
        ["drafted", "Drafted"],
        ["all", "All"],
      ] as const
    ).map(([value, label]) => ({ value, label, count: count((r) => statusMatches(r, value)) }))
  }
  if (key === "source") {
    const labels = [...new Set(rows.map((r) => r.riff.sourceLabel))]
    return [
      { value: "all", label: "Any source", count: pool.length },
      ...labels.map((l) => ({ value: l, label: l, count: count((r) => r.riff.sourceLabel === l) })),
    ]
  }
  if (key === "shape") {
    return [
      { value: "all", label: "Any shape", count: pool.length },
      ...(["Short post", "Thread", "Carousel", "Essay"] as const).map((s) => ({
        value: s,
        label: s,
        count: count((r) => r.angle?.shape === s),
      })),
    ]
  }
  return [
    { value: "all", label: "Any channel", count: pool.length },
    { value: "x", label: "X", count: count((r) => r.channels.some((c) => c.id === "x")) },
    { value: "linkedin", label: "LinkedIn", count: count((r) => r.channels.some((c) => c.id === "linkedin")) },
  ]
}

/** "Today", "Yesterday", then everything older under "Earlier". */
export function dayOf(riff: Riff) {
  return riff.capturedAt === "Today" || riff.capturedAt === "Yesterday" ? riff.capturedAt : "Earlier"
}

/** Short age for the mono column: "Today" → "today", "3 days ago" → "3d". */
export function ageOf(riff: Riff) {
  const a = riff.capturedAt
  if (a === "Today") return "today"
  if (a === "Yesterday") return "1d"
  const m = a.match(/^(\d+) days? ago$/)
  if (m) return `${m[1]}d`
  return a
}

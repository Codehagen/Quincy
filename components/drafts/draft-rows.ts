import type { Draft, Version } from "@/lib/drafts"
import { goingOutOfVersion, type GoingOut, type GoingOutSession } from "@/lib/going-out"

/**
 * The rows of /drafts, pure: one row per piece, which group it is in, the
 * version that speaks for it, and the filters over them. No React here, so
 * the order and the filter counts can be tested without a page.
 */

/** What happens next, as the page groups it (Lineup's sections, the Status filter). */
export type Bucket = "waiting" | "failed" | "no-time" | "out" | "sent"

export const BUCKET_LABEL: Record<Bucket, string> = {
  waiting: "Waiting on you",
  failed: "Didn't go",
  "no-time": "Approved, no time yet",
  out: "Going out",
  sent: "Sent",
}

export const BUCKET_ORDER: readonly Bucket[] = ["waiting", "failed", "no-time", "out", "sent"]

export type Row = {
  id: string
  draft: Draft
  /**
   * Where the piece stood in `getDrafts`, which reads oldest first. Higher
   * is newer; the page sorts newest first inside each group by it.
   */
  order: number
  /** The post's first line, as the feed shows it (the row's title). */
  opening: string
  bucket: Bucket
  /** The version that speaks for the row: the first undecided, else the most urgent. */
  lead: Version
  going: GoingOut
}

/** The first line with words on it. */
export function firstLine(text: string) {
  return text.split("\n").find((l) => l.trim() !== "")?.trim() ?? ""
}

const RANK: Record<GoingOut["kind"], number> = {
  writing: 0,
  failed: 1,
  sending: 2,
  "no-slot": 3,
  "slots-full": 3,
  "slot-came-later": 3,
  approved: 3,
  scheduled: 4,
  published: 5,
}

export function bucketOf(g: GoingOut): Bucket {
  switch (g.kind) {
    case "writing":
      return "waiting"
    case "failed":
      return "failed"
    case "sending":
    case "scheduled":
      return "out"
    case "published":
      return "sent"
    default:
      return "no-time"
  }
}

/**
 * The rows, waiting first and newest first inside each group. `getDrafts`
 * reads oldest first, so the old page opened on a three-month-old draft;
 * the newest is what you were last thinking about.
 */
export function buildRows(
  drafts: readonly Draft[],
  {
    edits = {},
    session = () => ({}),
  }: {
    /** Unapproved edits by version id: the row's opening follows what you typed. */
    edits?: Readonly<Record<string, string | undefined>>
    /** What this page's own actions returned for a version (placement, Post now). */
    session?: (v: Version) => GoingOutSession
  } = {}
): Row[] {
  const out = drafts
    .filter((d) => d.versions.length > 0)
    .map((d, order) => {
      const goings = d.versions.map((v) => ({ v, g: goingOutOfVersion(v, session(v)) }))
      const lead = [...goings].sort((a, b) => RANK[a.g.kind] - RANK[b.g.kind])[0]!
      const first = d.versions[0]!
      return {
        id: d.id,
        draft: d,
        order,
        opening: firstLine(edits[first.id] ?? first.text),
        bucket: bucketOf(lead.g),
        lead: lead.v,
        going: lead.g,
      }
    })
  return out.sort((a, b) => BUCKET_ORDER.indexOf(a.bucket) - BUCKET_ORDER.indexOf(b.bucket) || b.order - a.order)
}

/** "@mara_ships" for a saved post, or the source by name for your own work. */
export function fromName(row: Pick<Row, "draft">) {
  const a = row.draft.from.adaptedFrom
  return a?.handle ? `@${a.handle}` : row.draft.from.sourceLabel || "Pasted"
}

/* ── Filters ──────────────────────────────────────────────────────────── */

export type StatusFilter = "any" | Bucket
export type FromFilter = "any" | "saved" | "own"
/** "any", or a channel id ("x", "linkedin"). */
export type ChannelFilter = string
export type Filters = { status: StatusFilter; from: FromFilter; channel: ChannelFilter; q: string }
export const NO_FILTERS: Filters = { status: "any", from: "any", channel: "any", q: "" }

export function matches(r: Row, f: Filters, skip?: keyof Filters) {
  if (skip !== "status" && f.status !== "any" && r.bucket !== f.status) return false
  if (skip !== "from" && f.from !== "any" && (f.from === "saved") !== Boolean(r.draft.from.adaptedFrom)) return false
  if (skip !== "channel" && f.channel !== "any" && !r.draft.versions.some((v) => v.channel === f.channel)) return false
  if (f.q.trim()) {
    const q = f.q.trim().toLowerCase()
    const hay = [r.draft.idea, r.draft.from.adaptedFrom?.handle ?? "", r.draft.from.sourceLabel, ...r.draft.versions.map((v) => v.text)]
      .join(" ")
      .toLowerCase()
    if (!hay.includes(q)) return false
  }
  return true
}

export function filtersOn(f: Filters) {
  return f.status !== "any" || f.from !== "any" || f.channel !== "any" || f.q.trim() !== ""
}

export type FilterOption<V extends string> = { value: V; label: string; count: number }

/** Each option of one filter, with how many rows it would leave given the others. */
export function optionsFor(rows: readonly Row[], f: Filters, key: "status"): FilterOption<StatusFilter>[]
export function optionsFor(rows: readonly Row[], f: Filters, key: "from"): FilterOption<FromFilter>[]
export function optionsFor(rows: readonly Row[], f: Filters, key: "channel"): FilterOption<ChannelFilter>[]
export function optionsFor(rows: readonly Row[], f: Filters, key: "status" | "from" | "channel"): FilterOption<string>[] {
  const pool = rows.filter((r) => matches(r, f, key))
  const count = (pred: (r: Row) => boolean) => pool.filter(pred).length
  if (key === "status") {
    return [
      { value: "any", label: "Any status", count: pool.length },
      ...BUCKET_ORDER.map((b) => ({ value: b, label: BUCKET_LABEL[b], count: count((r) => r.bucket === b) })),
    ]
  }
  if (key === "from") {
    return [
      { value: "any", label: "Anywhere", count: pool.length },
      { value: "saved", label: "Posts you saved", count: count((r) => Boolean(r.draft.from.adaptedFrom)) },
      { value: "own", label: "Your own work", count: count((r) => !r.draft.from.adaptedFrom) },
    ]
  }
  // The channels the drafts are written for, from the rows themselves: a
  // filter value nothing could match is not offered.
  const labels = new Map<string, string>()
  for (const r of rows) for (const v of r.draft.versions) if (!labels.has(v.channel)) labels.set(v.channel, v.label)
  return [
    { value: "any", label: "Any channel", count: pool.length },
    ...[...labels].map(([channel, label]) => ({
      value: channel,
      label,
      count: count((r) => r.draft.versions.some((v) => v.channel === channel)),
    })),
  ]
}

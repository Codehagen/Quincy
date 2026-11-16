"use client"

import * as React from "react"

import type { RuleOffer } from "@/lib/edit-classes"
import { goingOutLine, goingOutOfVersion, type GoingOut, type GoingOutSession } from "@/lib/going-out"
import type { SendNowResult } from "@/lib/publish-run"

import { LAB_DRAFTS, X_SLOTS, deepen, REAL_DEPTH, type LabDraft, type LabVersion } from "./data"

/**
 * One store for the whole lab: the three layouts, the desktop and the phone
 * are windows onto the same drafts, so an Approve in one shows in the next.
 * Every verb is one the server has today (app/(app)/drafts/actions.ts), and
 * each answers the way its action does; nothing here calls one.
 *
 *   approveVersion        A, Approve   → the next free slot, or no-slot / slots-full
 *   reopenVersion         U, Undo / Reopen
 *   discardVersion        hold Discard → the version goes; the piece with its last one
 *   placeApprovedVersion  Give it a time (approved before the slot existed)
 *   postNow               Post now, behind its confirmation; may fail
 *   answerVoiceRule       Add to voice / Not now, after an edited approval
 *
 * The edit stays local until Approve, as on /drafts today: approving sends
 * the text as edited, and the server's diff against the drafted body is
 * where a rule offer comes from.
 */

const APPROVE_MS = 350
const POST_MS = 1100
const PLACE_MS = 500

export type Bucket = "waiting" | "failed" | "no-time" | "out" | "sent"

export const BUCKET_LABEL: Record<Bucket, string> = {
  waiting: "Waiting on you",
  failed: "Didn't go",
  "no-time": "Approved, no time yet",
  out: "Going out",
  sent: "Sent",
}

const BUCKET_ORDER: Bucket[] = ["waiting", "failed", "no-time", "out", "sent"]

export type Row = {
  id: string
  draft: LabDraft
  /** The post's first line, as the feed shows it. */
  opening: string
  bucket: Bucket
  /** The version that speaks for the row: the first undecided, else the most urgent. */
  lead: LabVersion
  going: GoingOut
}

export type StatusFilter = "any" | Bucket
export type FromFilter = "any" | "saved" | "own"
export type ChannelFilter = "any" | "x" | "linkedin"
export type Filters = { status: StatusFilter; from: FromFilter; channel: ChannelFilter; q: string }
export const NO_FILTERS: Filters = { status: "any", from: "any", channel: "any", q: "" }

export type Notice =
  | { kind: "approved"; id: number; title: string; versionId: string; sentence: string }
  | { kind: "discarded"; id: number; title: string; whole: boolean }
  | { kind: "posted"; id: number; title: string; ok: boolean }

/** A Notice before it has an id: Omit over each member, so the union stays discriminated. */
type NoticeInput = Notice extends infer N ? (N extends Notice ? Omit<N, "id"> : never) : never

export type Phase = "live" | "loading" | "empty"

export type View = "marked" | "preview"

export type DraftsStore = {
  phase: Phase
  rows: Row[]
  shown: Row[]
  filters: Filters
  setFilter: <K extends keyof Filters>(key: K, value: Filters[K]) => void
  clearFilters: () => void
  selected: Row | null
  select: (id: string | null) => void
  /** Set when an action moved the selection; layouts reveal the row. */
  moved: { id: string; n: number } | null
  session: (v: LabVersion) => GoingOutSession
  textOf: (v: LabVersion) => string
  editingId: string | null
  /** Starting an edit also puts that version back in Marked up: editing happens there. */
  setEditing: (versionId: string | null) => void
  /** Marked up (default) or the feed preview, per version. */
  viewOf: (versionId: string) => View
  setView: (versionId: string, view: View) => void
  /** P: the open draft's versions all to Preview, or all back to Marked up. */
  togglePreview: (row: Row) => void
  saveEdit: (versionId: string, text: string) => void
  approving: string | null
  posting: string | null
  placing: string | null
  approve: (row: Row, versionId?: string) => void
  reopen: (versionId: string) => void
  discard: (row: Row, versionId: string) => void
  place: (versionId: string) => void
  postNow: (versionId: string) => void
  offers: Record<string, RuleOffer | undefined>
  answerOffer: (versionId: string, accept: boolean) => void
  notice: Notice | null
  dismissNotice: () => void
  /** Reopen the last approval. Returns the piece's id, to reveal it. */
  undo: () => string | null
  reset: () => void
}

function firstLine(text: string) {
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

function bucketOf(g: GoingOut): Bucket {
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

/** What the lab "server" would say a rule offer is, from the drafted and the approved text. */
function offerFor(before: string, after: string, label: string): RuleOffer | null {
  if (before.trim() === after.trim()) return null
  if (/#\w/.test(before) && !/#\w/.test(after)) return { class: "hashtag-removed", text: `Leave hashtags out of ${label} posts.` }
  if (after.length < before.length * 0.75) return { class: "shortened", text: `Keep ${label} posts short: three short paragraphs at most.` }
  const lines = (t: string) => t.split("\n").filter((l) => l.trim()).length
  if (lines(after) < lines(before)) return { class: "line-cut", text: "End on the point. Cut a closing line that only restates it." }
  return null
}

function matches(r: Row, f: Filters, skip?: keyof Filters) {
  if (skip !== "status" && f.status !== "any" && r.bucket !== f.status) return false
  if (skip !== "from" && f.from !== "any" && (f.from === "saved") !== Boolean(r.draft.from.adaptedFrom)) return false
  if (skip !== "channel" && f.channel !== "any" && !r.draft.versions.some((v) => v.channel === f.channel)) return false
  if (f.q.trim()) {
    const q = f.q.trim().toLowerCase()
    const hay = [r.draft.idea, r.draft.from.adaptedFrom?.handle ?? "", ...r.draft.versions.map((v) => v.text)].join(" ").toLowerCase()
    if (!hay.includes(q)) return false
  }
  return true
}

export function filtersOn(f: Filters) {
  return f.status !== "any" || f.from !== "any" || f.channel !== "any" || f.q.trim() !== ""
}

/** Each option of one filter, with how many rows it would leave given the others. */
export function optionsFor<K extends "status" | "from" | "channel">(rows: readonly Row[], f: Filters, key: K) {
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
  return [
    { value: "any", label: "Any channel", count: pool.length },
    { value: "x", label: "X", count: count((r) => r.draft.versions.some((v) => v.channel === "x")) },
    { value: "linkedin", label: "LinkedIn", count: count((r) => r.draft.versions.some((v) => v.channel === "linkedin")) },
  ]
}

export function useDrafts({ phase, depth }: { phase: Phase; depth: "fixtures" | "real" }): DraftsStore {
  const seed = React.useMemo(() => (depth === "real" ? deepen(LAB_DRAFTS, REAL_DEPTH) : LAB_DRAFTS), [depth])
  const [drafts, setDrafts] = React.useState<LabDraft[]>(seed)
  const [seedSeen, setSeedSeen] = React.useState(seed)
  const [edits, setEdits] = React.useState<Record<string, string | undefined>>({})
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [views, setViews] = React.useState<Record<string, View | undefined>>({})
  const [placements, setPlacements] = React.useState<Record<string, GoingOutSession["placement"]>>({})
  const [posts, setPosts] = React.useState<Record<string, SendNowResult | undefined>>({})
  const [offers, setOffers] = React.useState<Record<string, RuleOffer | undefined>>({})
  const [approving, setApproving] = React.useState<string | null>(null)
  const [posting, setPosting] = React.useState<string | null>(null)
  const [placing, setPlacing] = React.useState<string | null>(null)
  const [filters, setFilters] = React.useState<Filters>(NO_FILTERS)
  const [selectedId, setSelectedId] = React.useState<string | null>("d01")
  const [moved, setMoved] = React.useState<DraftsStore["moved"]>(null)
  const [notice, setNotice] = React.useState<Notice | null>(null)
  const [lastApproved, setLastApproved] = React.useState<string[]>([])
  const noticeId = React.useRef(0)

  if (seed !== seedSeen) {
    setSeedSeen(seed)
    setDrafts(seed)
  }

  const session = React.useCallback(
    (v: LabVersion): GoingOutSession => ({ placement: placements[v.id], posted: posts[v.id] }),
    [placements, posts]
  )

  const rows = React.useMemo<Row[]>(() => {
    if (phase === "empty") return []
    const out = drafts.map((d) => {
      const goings = d.versions.map((v) => ({ v, g: goingOutOfVersion(v, { placement: placements[v.id], posted: posts[v.id] }) }))
      const lead = [...goings].sort((a, b) => RANK[a.g.kind] - RANK[b.g.kind])[0]!
      return {
        id: d.id,
        draft: d,
        opening: firstLine(edits[d.versions[0]!.id] ?? d.versions[0]!.text),
        bucket: bucketOf(lead.g),
        lead: lead.v,
        going: lead.g,
      }
    })
    // Waiting first, newest first inside each group (/drafts today is oldest first: proposed).
    return out.sort((a, b) => BUCKET_ORDER.indexOf(a.bucket) - BUCKET_ORDER.indexOf(b.bucket) || a.draft.age - b.draft.age)
  }, [drafts, placements, posts, edits, phase])

  const shown = React.useMemo(() => rows.filter((r) => matches(r, filters)), [rows, filters])
  // Keep the open piece while a filter hides it (workspace.md); drop it only when it is gone.
  const selected = rows.find((r) => r.id === selectedId) ?? null

  // Stable, so the foot's timer and its one announcement run once per note.
  const dismissNotice = React.useCallback(() => setNotice(null), [])

  const say = (n: NoticeInput) => setNotice({ ...n, id: ++noticeId.current })

  const takenSlots = React.useMemo(() => new Set(drafts.flatMap((d) => d.versions.map((v) => v.goingOut).filter(Boolean) as string[])), [drafts])

  const patchVersion = (versionId: string, patch: (v: LabVersion) => LabVersion | null) =>
    setDrafts((ds) =>
      ds
        .map((d) => ({ ...d, versions: d.versions.flatMap((v) => (v.id === versionId ? [patch(v)].filter((x): x is LabVersion => x != null) : [v])) }))
        .filter((d) => d.versions.length > 0)
    )

  /** The next waiting row after this one in the view, else the one before. */
  const nextWaiting = (fromId: string) => {
    const list = shown.length ? shown : rows
    const i = list.findIndex((r) => r.id === fromId)
    const after = list.slice(i + 1).find((r) => r.bucket === "waiting" && r.id !== fromId)
    const before = [...list.slice(0, Math.max(0, i))].reverse().find((r) => r.bucket === "waiting")
    return after ?? before ?? null
  }

  const moveTo = (id: string | null) => {
    setSelectedId(id)
    if (id) setMoved((m) => ({ id, n: (m?.n ?? 0) + 1 }))
  }

  const approve = (row: Row, versionId?: string) => {
    const v = versionId ? row.draft.versions.find((x) => x.id === versionId) : row.draft.versions.find((x) => x.state === "writing")
    if (!v || v.state !== "writing" || approving) return
    const text = edits[v.id] ?? v.text
    setApproving(v.id)
    setEditingId(null)
    window.setTimeout(() => {
      // The server places it in the next free slot for its channel, or says why not.
      let goingOut: string | null = null
      if (v.channel === "x") {
        goingOut = X_SLOTS.find((s) => !takenSlots.has(s)) ?? null
        if (!goingOut) setPlacements((p) => ({ ...p, [v.id]: { scheduled: false, reason: "slots-full" } }))
      }
      patchVersion(v.id, (x) => ({ ...x, state: "approved", text, goingOut }))
      setEdits((e) => ({ ...e, [v.id]: undefined }))
      const offer = offerFor(v.text, text, v.label)
      if (offer) setOffers((o) => ({ ...o, [v.id]: offer }))
      setApproving(null)
      setLastApproved((l) => [...l, v.id])
      const g = goingOutOfVersion({ ...v, state: "approved", goingOut }, { placement: goingOut || v.channel !== "x" ? undefined : { scheduled: false, reason: "slots-full" } })
      say({ kind: "approved", title: firstLine(text), versionId: v.id, sentence: goingOutLine(g, v.label).text })
      // The finishing approval hands on to the next piece waiting (the page's throughput rule).
      const finishes = row.draft.versions.every((x) => x.id === v.id || x.state === "approved")
      if (finishes) moveTo(nextWaiting(row.id)?.id ?? row.id)
    }, APPROVE_MS)
  }

  const reopen = (versionId: string) => {
    patchVersion(versionId, (x) => ({ ...x, state: "writing", goingOut: null, sent: null }))
    setPlacements((p) => ({ ...p, [versionId]: undefined }))
    setPosts((p) => ({ ...p, [versionId]: undefined }))
    setOffers((o) => ({ ...o, [versionId]: undefined }))
    setLastApproved((l) => l.filter((id) => id !== versionId))
  }

  const undo = () => {
    const id = lastApproved[lastApproved.length - 1]
    if (!id) return null
    const piece = drafts.find((d) => d.versions.some((v) => v.id === id))
    reopen(id)
    setNotice(null)
    if (piece) moveTo(piece.id)
    return piece?.id ?? null
  }

  const discard = (row: Row, versionId: string) => {
    const whole = row.draft.versions.length === 1
    const next = whole ? nextWaiting(row.id) : null
    patchVersion(versionId, () => null)
    if (editingId === versionId) setEditingId(null)
    say({ kind: "discarded", title: row.opening, whole })
    if (whole) moveTo(next?.id ?? null)
  }

  const place = (versionId: string) => {
    setPlacing(versionId)
    window.setTimeout(() => {
      const at = X_SLOTS.find((s) => !takenSlots.has(s)) ?? null
      if (at) patchVersion(versionId, (x) => ({ ...x, goingOut: at }))
      else setPlacements((p) => ({ ...p, [versionId]: { scheduled: false, reason: "slots-full" } }))
      setPlacing(null)
    }, PLACE_MS)
  }

  const postNow = (versionId: string) => {
    const v = drafts.flatMap((d) => d.versions).find((x) => x.id === versionId)
    if (!v) return
    setPosting(versionId)
    window.setTimeout(() => {
      const result: SendNowResult = v.failsWith ? { ok: false, message: v.failsWith } : { ok: true, url: `https://x.com/you/status/${versionId}` }
      setPosts((p) => ({ ...p, [versionId]: result }))
      if (result.ok) patchVersion(versionId, (x) => ({ ...x, goingOut: null }))
      setPosting(null)
      say({ kind: "posted", title: firstLine(v.text), ok: result.ok })
    }, POST_MS)
  }

  return {
    phase,
    rows,
    shown,
    filters,
    setFilter: (key, value) => setFilters((f) => ({ ...f, [key]: value })),
    clearFilters: () => setFilters(NO_FILTERS),
    selected,
    select: (id) => setSelectedId(id),
    moved,
    session,
    textOf: (v) => edits[v.id] ?? v.text,
    editingId,
    setEditing: (id) => {
      if (id) setViews((m) => ({ ...m, [id]: "marked" }))
      setEditingId(id)
    },
    viewOf: (id) => views[id] ?? "marked",
    setView: (id, view) => setViews((m) => ({ ...m, [id]: view })),
    togglePreview: (row) => {
      const ids = row.draft.versions.map((v) => v.id)
      const to: View = ids.some((id) => (views[id] ?? "marked") === "marked") ? "preview" : "marked"
      if (editingId && ids.includes(editingId)) return
      setViews((m) => ({ ...m, ...Object.fromEntries(ids.map((id) => [id, to])) }))
    },
    saveEdit: (versionId, text) => {
      setEdits((e) => ({ ...e, [versionId]: text }))
      setEditingId(null)
    },
    approving,
    posting,
    placing,
    approve,
    reopen,
    discard,
    place,
    postNow,
    offers,
    answerOffer: (versionId) => setOffers((o) => ({ ...o, [versionId]: undefined })),
    notice,
    dismissNotice,
    undo,
    reset: () => {
      setDrafts(seed)
      setEdits({})
      setEditingId(null)
      setViews({})
      setPlacements({})
      setPosts({})
      setOffers({})
      setNotice(null)
      setLastApproved([])
      setFilters(NO_FILTERS)
      setSelectedId("d01")
    },
  }
}

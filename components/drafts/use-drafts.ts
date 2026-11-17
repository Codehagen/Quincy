"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { parseAsString, useQueryState } from "nuqs"

import {
  approveVersion,
  discardVersion,
  placeApprovedVersion,
  postNow as postNowAction,
  reopenVersion,
} from "@/app/(app)/drafts/actions"
import type { Draft, Version } from "@/lib/drafts"
import type { RuleOffer } from "@/lib/edit-classes"
import { goingOutLine, goingOutOfVersion, type GoingOutSession } from "@/lib/going-out"
import type { SendNowResult } from "@/lib/publish-run"
import type { ApprovalPlacement } from "@/lib/scheduling"

import { NO_FILTERS, buildRows, firstLine, matches, type Filters, type Row } from "./draft-rows"

/**
 * The /drafts page's state: the rows, the filters, which draft is open, the
 * edit in progress, and the verbs. Every write is one of the existing server
 * actions in app/(app)/drafts/actions.ts, and every guard behind them
 * (ownership of the version, the publish claim, the slot search) is theirs.
 * Nothing here spends on its own: Post now only runs from its confirmed
 * dialog, and Approve only from a press of A or the button.
 *
 *   approveVersion        A, Approve   → the next free slot, or no-slot / slots-full
 *   reopenVersion         U, Undo / Reopen
 *   discardVersion        hold Discard → the version goes; the piece with its last one
 *   placeApprovedVersion  Give it a time (approved before the slot existed)
 *   postNow               Post now, behind its confirmation; may fail
 *   answerVoiceRule       Add to voice / Not now (RuleOfferLine calls it)
 *
 * - **The open draft is the URL** (`?piece=`), so it survives a refresh,
 *   the back button and a link. A missing or discarded id falls back to the
 *   first waiting row.
 * - **The edit stays local until Approve**, as it always has: approving
 *   sends the text as edited, and the server's diff against the drafted body
 *   is where a voice rule offer comes from (lib/edit-classes.ts). Writing
 *   the edit first would erase that diff. A reload loses an unsaved edit.
 * - **Approve waits for the server** ("Approving…"): where the post goes
 *   (a slot, no slot, every slot full) is only known once the server has
 *   placed it, and the foot says that sentence. Undo, Reopen and Discard are
 *   optimistic and put the page back if the write fails.
 */

export type Notice =
  | { kind: "approved"; id: number; title: string; versionId: string; sentence: string }
  | { kind: "discarded"; id: number; title: string; whole: boolean }
  | { kind: "posted"; id: number; title: string; ok: boolean }
  | { kind: "failed"; id: number; message: string }

/** A Notice before it has an id: Omit over each member, so the union stays discriminated. */
type NoticeInput = Notice extends infer N ? (N extends Notice ? Omit<N, "id"> : never) : never

export type DraftsStore = ReturnType<typeof useDrafts>

const FAILED = "That didn't go through. The page shows what the server has."

export function useDrafts(fromServer: Draft[]) {
  const router = useRouter()

  /**
   * Server data arriving after mount (each action revalidates /drafts, and
   * `router.refresh()` hands down a fresh list), adopted during render, as
   * React documents for a changed prop. Unsaved edits live apart in `edits`
   * and survive it.
   */
  const [seen, setSeen] = React.useState(fromServer)
  const [drafts, setDrafts] = React.useState(fromServer)
  if (fromServer !== seen) {
    setSeen(fromServer)
    setDrafts(fromServer)
  }

  const [edits, setEdits] = React.useState<Record<string, string | undefined>>({})
  const [editingId, setEditingId] = React.useState<string | null>(null)
  /** What each approval or Give it a time returned, by version: the server's answer, once it has said. */
  const [placements, setPlacements] = React.useState<Record<string, ApprovalPlacement | undefined>>({})
  /**
   * What Post now did, by version. Kept across refreshes, because the
   * failures that never reach `scheduled_post` (no connection, over the
   * limit) exist nowhere else.
   */
  const [posts, setPosts] = React.useState<Record<string, SendNowResult | undefined>>({})
  /**
   * A voice rule the approval you just made is worth proposing, by version.
   * Session memory: after the write the drafted and approved bodies are the
   * same text, so nothing on the server can recompute it.
   */
  const [offers, setOffers] = React.useState<Record<string, RuleOffer | undefined>>({})
  const [approving, setApproving] = React.useState<string | null>(null)
  const [posting, setPosting] = React.useState<string | null>(null)
  const [placing, setPlacing] = React.useState<string | null>(null)
  const [filters, setFilters] = React.useState<Filters>(NO_FILTERS)
  const [param, setParam] = useQueryState("piece", parseAsString)
  const [moved, setMoved] = React.useState<{ id: string; n: number } | null>(null)
  const [notice, setNotice] = React.useState<Notice | null>(null)
  const [lastApproved, setLastApproved] = React.useState<string[]>([])
  const noticeId = React.useRef(0)

  const session = React.useCallback(
    (v: Version): GoingOutSession => ({ placement: placements[v.id], posted: posts[v.id] }),
    [placements, posts]
  )

  const rows = React.useMemo(() => buildRows(drafts, { edits, session }), [drafts, edits, session])
  const shown = React.useMemo(() => rows.filter((r) => matches(r, filters)), [rows, filters])

  /**
   * The open draft: what `?piece=` names, kept while a filter hides it (the
   * pane keeps showing what you were reading) and dropped only when it is
   * gone. With nothing named, the newest waiting draft; with nothing
   * waiting either, nothing, so the pane can say everything is decided.
   */
  const selected = React.useMemo(
    () => rows.find((r) => r.id === param) ?? rows.find((r) => r.bucket === "waiting") ?? null,
    [param, rows]
  )

  const select = React.useCallback((id: string | null) => void setParam(id), [setParam])

  // Stable, so the foot's timer and its one announcement run once per note.
  const dismissNotice = React.useCallback(() => setNotice(null), [])
  const say = (n: NoticeInput) => setNotice({ ...n, id: ++noticeId.current } as Notice)

  const patchVersion = (versionId: string, patch: (v: Version) => Version | null) =>
    setDrafts((ds) =>
      ds
        .map((d) => ({
          ...d,
          versions: d.versions.flatMap((v) => (v.id === versionId ? [patch(v)].filter((x): x is Version => x != null) : [v])),
        }))
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
    select(id)
    if (id) setMoved((m) => ({ id, n: (m?.n ?? 0) + 1 }))
  }

  /** A write failed: say so, and take the server's version of the page. */
  const failed = (error: unknown) => {
    console.error(error)
    say({ kind: "failed", message: FAILED })
    router.refresh()
  }

  /**
   * Approve one version with the text as it stands, edits included. The
   * finishing approval of a piece hands on to the next waiting draft: the
   * page's measure is throughput, not a receipt.
   */
  const approve = (row: Row, versionId?: string) => {
    const v = versionId ? row.draft.versions.find((x) => x.id === versionId) : row.draft.versions.find((x) => x.state === "writing")
    if (!v || v.state !== "writing" || approving) return
    const text = edits[v.id] ?? v.text
    // Worked out at the press: after the write this row no longer looks waiting.
    const finishes = row.draft.versions.every((x) => x.id === v.id || x.state === "approved")
    const next = finishes ? nextWaiting(row.id) : null
    setApproving(v.id)
    setEditingId(null)
    approveVersion(v.id, text)
      .then(({ ruleOffer, ...placement }) => {
        patchVersion(v.id, (x) => ({ ...x, state: "approved", text }))
        setPlacements((p) => ({ ...p, [v.id]: placement }))
        setEdits((e) => ({ ...e, [v.id]: undefined }))
        if (ruleOffer) setOffers((o) => ({ ...o, [v.id]: ruleOffer }))
        setLastApproved((l) => [...l, v.id])
        const g = goingOutOfVersion({ ...v, state: "approved", goingOut: null, sent: null }, { placement })
        say({ kind: "approved", title: firstLine(text), versionId: v.id, sentence: goingOutLine(g, v.label).text })
        if (finishes) moveTo(next?.id ?? row.id)
      })
      .catch(failed)
      .finally(() => setApproving(null))
  }

  /** Put an approved version back in play. Its queued post, if any, goes too (the server's half). */
  const reopen = (versionId: string) => {
    patchVersion(versionId, (x) => ({ ...x, state: "writing", goingOut: null, sent: null }))
    setPlacements((p) => ({ ...p, [versionId]: undefined }))
    setPosts((p) => ({ ...p, [versionId]: undefined }))
    setOffers((o) => ({ ...o, [versionId]: undefined }))
    setLastApproved((l) => l.filter((id) => id !== versionId))
    reopenVersion(versionId).catch(failed)
  }

  /** U: reopen the last approval made here. Returns the piece's id, to reveal it. */
  const undo = () => {
    const id = lastApproved[lastApproved.length - 1]
    if (!id) return null
    const piece = drafts.find((d) => d.versions.some((v) => v.id === id))
    reopen(id)
    setNotice(null)
    if (piece) moveTo(piece.id)
    return piece?.id ?? null
  }

  /** The hold is the confirmation; the server has no undo, so neither does this. */
  const discard = (row: Row, versionId: string) => {
    const whole = row.draft.versions.length === 1
    const next = whole ? nextWaiting(row.id) : null
    patchVersion(versionId, () => null)
    if (editingId === versionId) setEditingId(null)
    setEdits((e) => ({ ...e, [versionId]: undefined }))
    say({ kind: "discarded", title: row.opening, whole })
    if (whole) moveTo(next?.id ?? null)
    discardVersion(versionId).catch(failed)
  }

  /** Give an approved version a time. Not optimistic: the honest sentence is the server's. */
  const place = (versionId: string) => {
    setPlacing(versionId)
    placeApprovedVersion(versionId)
      .then((placement) => setPlacements((p) => ({ ...p, [versionId]: placement })))
      .catch(failed)
      .finally(() => {
        setPlacing(null)
        router.refresh()
      })
  }

  /**
   * Send one approved version now. Never optimistic: it is a request to
   * somebody else's platform, which can refuse it, take it and say nothing,
   * or take twenty seconds. Only the confirmed dialog calls this.
   */
  const postNow = (versionId: string) => {
    const v = drafts.flatMap((d) => d.versions).find((x) => x.id === versionId)
    if (!v || posting) return
    setPosting(versionId)
    postNowAction(versionId)
      .then((result) => {
        setPosts((p) => ({ ...p, [versionId]: result }))
        say({ kind: "posted", title: firstLine(v.text), ok: result.ok })
      })
      .catch((error: unknown) => {
        console.error(error)
        setPosts((p) => ({ ...p, [versionId]: { ok: false, message: "Quincy could not reach the platform. Try again." } }))
        say({ kind: "posted", title: firstLine(v.text), ok: false })
      })
      .finally(() => {
        setPosting(null)
        router.refresh()
      })
  }

  return {
    rows,
    shown,
    filters,
    setFilter: <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters((f) => ({ ...f, [key]: value })),
    clearFilters: () => setFilters(NO_FILTERS),
    selected,
    select,
    /** Set when an action moved the selection; the surface reveals the row. */
    moved,
    session,
    textOf: (v: Version) => edits[v.id] ?? v.text,
    editingId,
    setEditing: setEditingId,
    saveEdit: (versionId: string, text: string) => {
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
    notice,
    dismissNotice,
    undo,
  }
}

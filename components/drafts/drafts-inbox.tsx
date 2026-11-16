"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { parseAsString, useQueryState } from "nuqs"

import {
  approveVersion,
  discardVersion,
  placeApprovedVersion,
  postNow,
  reopenVersion,
} from "@/app/(app)/drafts/actions"
import {
  counts,
  countWaiting,
  countWithoutTime,
  isDone,
  type Draft,
} from "@/lib/drafts"
import type { RuleOffer } from "@/lib/edit-classes"
import type { SendNowResult } from "@/lib/publish-run"
import type { ApprovalPlacement } from "@/lib/scheduling"
import {
  ButtonLink,
  Count,
  EmptyState,
  KitPage,
  List,
  ListHeading,
  ListRow,
  Mono,
  Stage,
} from "@/components/kit"
import { Friend } from "@/components/mascot"

import { DraftPiece } from "./draft-piece"

/**
 * /drafts: the pieces waiting on you, and the one that is open.
 *
 * **List and detail in one Stage** (docs/design/page.md), since the page moved
 * to the kit on 2026-11-16. It was a two-pane inbox — a rail of pieces beside
 * one open piece — and the grouping that inbox was chosen for survives: what is
 * waiting on you first, what is done after. Getting the list's first rows to be
 * finished work was the defect the grouping fixed (`getDrafts` orders by
 * `createdAt` ascending), and it should not come back.
 *
 * **The state lives here**, because two questions need an answer above the
 * version: whether a piece is finished (every version decided) and how much is
 * still waiting on you. A card that owned its own approved flag could answer
 * neither, and the count in the summary would go stale the moment you pressed
 * anything.
 *
 * **Optimistic, then confirmed.** Each mutation updates local state first and
 * fires the matching server action after. If the write fails the state is
 * rolled back and `router.refresh()` pulls the truth back down, because a page
 * that shows approved for writing nobody approved is the one failure mode
 * worth the extra code.
 */
type ListState = {
  drafts: Draft[]
}

/**
 * Rows before the open piece (page.md: at most 6). The rest wait behind one
 * row that names how many, so the detail is never far below the row that
 * opened it.
 */
const ROW_CAP = 6

const rowId = (draftId: string) => `draft-row-${draftId}`

export function DraftsInbox({
  initial,
  initials,
}: {
  initial: Draft[]
  /** The person's initials, for the DraftCard's Avatar. */
  initials: string
}) {
  const router = useRouter()

  /**
   * Server data arriving after mount, which `useState(initial)` alone ignores:
   * every `router.refresh()` this page triggers hands down a fresh `initial`.
   * Adjusted during render rather than in an effect, React's documented way to
   * react to a changed prop. Only the server-derived slice is replaced;
   * unsaved edits live in `edits` and survive it.
   */
  const [fromServer, setFromServer] = React.useState(initial)
  const [state, setState] = React.useState<ListState>({ drafts: initial })

  if (initial !== fromServer) {
    setFromServer(initial)
    setState({ drafts: initial })
  }

  /**
   * Edits not yet approved, per version id.
   *
   * Local on purpose, as the old inline editor was. Approving sends the edited
   * text, and the server compares it with the body Quincy drafted — that diff
   * is where a voice rule offer comes from (lib/edit-classes.ts). Writing the
   * edit to the row first would make the two the same and the offer would
   * never be made. Held here rather than in the card so a refresh after
   * another version's approval does not take the words away.
   */
  const [edits, setEdits] = React.useState<Record<string, string | undefined>>({})

  /** Which versions are being edited, so Save is the one action (actions.md, step 1). */
  const [editing, setEditing] = React.useState<Record<string, boolean | undefined>>({})

  /** What the server did with each approval, once it has said. Keyed by version. */
  const [placements, setPlacements] = React.useState<
    Record<string, ApprovalPlacement | undefined>
  >({})

  /** The version whose "Give it a time" is in flight. */
  const [placing, setPlacing] = React.useState<string | null>(null)

  /**
   * A rule the approval you just made is worth proposing, per version. Session
   * memory: after the write the drafted and approved bodies are the same text,
   * so nothing on the server can recompute it.
   */
  const [offers, setOffers] = React.useState<
    Record<string, RuleOffer | undefined>
  >({})

  /**
   * What Post now did, per version. Kept after `router.refresh`, because the
   * failures that never reach `scheduled_post` — no connection, over the
   * limit — exist nowhere else.
   */
  const [posts, setPosts] = React.useState<
    Record<string, SendNowResult | undefined>
  >({})

  /** The version whose "Post now" is in flight. */
  const [posting, setPosting] = React.useState<string | null>(null)

  const [showAll, setShowAll] = React.useState(false)

  const { drafts } = state

  const open = drafts.filter((d) => !isDone(d))
  const finished = drafts.filter(isDone)

  /**
   * Which piece is open, in the URL, so it survives this page's own refreshes,
   * a reload, the back button, and a link sent to yourself. The URL is the only
   * copy.
   */
  const [openPiece, setOpenPiece] = useQueryState("piece", parseAsString)

  const select = React.useCallback(
    (id: string) => {
      void setOpenPiece(id)
    },
    [setOpenPiece]
  )

  /**
   * Falls back rather than trusting the id: a link to a discarded piece, a typed
   * `?piece=`, the tick after discarding the piece you were reading. Open work
   * first.
   */
  const selected =
    drafts.find((d) => d.id === openPiece) ?? open[0] ?? drafts[0] ?? null
  const selectedKey = selected?.id ?? ""

  /**
   * Finishing a piece hands off to the next one, and the button you pressed
   * goes with the piece. Focus lands on the next piece's row, which is where
   * picking a row leaves it too (page.md).
   */
  const focusRow = React.useRef<string | null>(null)
  React.useEffect(() => {
    const id = focusRow.current
    if (!id) return
    focusRow.current = null
    document.getElementById(rowId(id))?.focus({ preventScroll: true })
  }, [selectedKey])

  /** Fire a write, and put the page back if it fails. */
  const persist = React.useCallback(
    (before: ListState, write: () => Promise<void>) => {
      write().catch((error) => {
        console.error(error)
        setState(before)
        router.refresh()
      })
    },
    [router]
  )

  const versionIdFor = React.useCallback(
    (draftId: string, channel: string) =>
      drafts
        .find((d) => d.id === draftId)
        ?.versions.find((v) => v.channel === channel)?.id,
    [drafts]
  )

  const forget = (versionId: string) => {
    setEdits((current) => ({ ...current, [versionId]: undefined }))
    setEditing((current) => ({ ...current, [versionId]: undefined }))
  }

  const approve = React.useCallback(
    (draftId: string, channel: string, text: string) => {
      // The write goes out with the text as edited, not as loaded. Approving
      // writing you changed but did not send is the one way this page could lie.
      const versionId = versionIdFor(draftId, channel)
      if (versionId) {
        /**
         * Approving also places the version in a slot, and it can honestly fail
         * to. The optimistic update cannot know which, so the card says nothing
         * about a time until the server answers.
         */
        persist(state, async () => {
          const { ruleOffer, ...placement } = await approveVersion(versionId, text)
          setPlacements((current) => ({ ...current, [versionId]: placement }))
          if (ruleOffer) {
            setOffers((current) => ({ ...current, [versionId]: ruleOffer }))
          }
        })
        setEdits((current) => ({ ...current, [versionId]: undefined }))
      }

      const piece = drafts.find((d) => d.id === draftId)
      const finishes = piece?.versions.every(
        (v) => v.channel === channel || v.state === "approved"
      )

      setState((current) => ({
        drafts: current.drafts.map((d) =>
          d.id !== draftId
            ? d
            : {
                ...d,
                versions: d.versions.map((v) =>
                  v.channel !== channel
                    ? v
                    : { ...v, state: "approved" as const, text }
                ),
              }
        ),
      }))

      /**
       * The finishing approval lands you on the next piece still waiting, not on
       * a receipt: the failing metric on this page is throughput. Computed here,
       * because the commit has not rendered yet and the finishing piece still
       * looks open from outside.
       */
      if (finishes) {
        const next = drafts.find((d) => d.id !== draftId && !isDone(d))
        if (next) {
          focusRow.current = next.id
          select(next.id)
        }
      }
    },
    [drafts, persist, select, state, versionIdFor]
  )

  /** Put an approved version back in play. The piece stops being finished. */
  const reopen = React.useCallback(
    (draftId: string, channel: string) => {
      const versionId = versionIdFor(draftId, channel)
      if (versionId) {
        persist(state, () => reopenVersion(versionId))
        // A previous Post now result and a rule offer were both about an
        // approval that no longer stands.
        setPosts((current) => ({ ...current, [versionId]: undefined }))
        setOffers((current) => ({ ...current, [versionId]: undefined }))
        setPlacements((current) => ({ ...current, [versionId]: undefined }))
      }

      setState((current) => ({
        drafts: current.drafts.map((d) =>
          d.id !== draftId
            ? d
            : {
                ...d,
                versions: d.versions.map((v) =>
                  v.channel !== channel
                    ? v
                    : // reopenVersion drops the queued or failed post too.
                      { ...v, state: "writing" as const, goingOut: null, sent: null }
                ),
              }
        ),
      }))
    },
    [persist, state, versionIdFor]
  )

  /**
   * Discard removes the version outright; the hold on the button is the
   * confirmation. A piece whose last version is discarded has nothing in it,
   * so the whole piece goes.
   */
  const discard = React.useCallback(
    (draftId: string, channel: string) => {
      const versionId = versionIdFor(draftId, channel)
      if (versionId) {
        persist(state, () => discardVersion(versionId))
        forget(versionId)
      }

      setState((current) => ({
        drafts: current.drafts
          .map((d) =>
            d.id !== draftId
              ? d
              : { ...d, versions: d.versions.filter((v) => v.channel !== channel) }
          )
          .filter((d) => d.versions.length > 0),
      }))
    },
    [persist, state, versionIdFor]
  )

  /**
   * Give an already-approved version a time. Not optimistic: the only change
   * is a sentence, and the honest one is what the server produces.
   */
  const place = React.useCallback(
    (versionId: string) => {
      setPlacing(versionId)
      placeApprovedVersion(versionId)
        .then((placement) =>
          setPlacements((current) => ({ ...current, [versionId]: placement }))
        )
        .catch((error) => console.error(error))
        .finally(() => {
          setPlacing(null)
          router.refresh()
        })
    },
    [router]
  )

  /**
   * Send one approved version now. Never optimistic: it is a request to
   * somebody else's platform, which can refuse it, take it and say nothing, or
   * take twenty seconds.
   */
  const post = React.useCallback(
    (versionId: string) => {
      setPosting(versionId)
      postNow(versionId)
        .then((result) =>
          setPosts((current) => ({ ...current, [versionId]: result }))
        )
        .catch((error) => {
          console.error(error)
          setPosts((current) => ({
            ...current,
            [versionId]: {
              ok: false,
              message: "Quincy could not reach the platform. Try again.",
            },
          }))
        })
        .finally(() => {
          setPosting(null)
          router.refresh()
        })
    },
    [router]
  )

  /**
   * List order, which is also `j`/`k` order: what is waiting, then what is
   * done. One array, so moving past the last open piece continues into the
   * finished ones.
   */
  const order = React.useMemo(
    () => [...open, ...finished].map((d) => d.id),
    [open, finished]
  )

  const move = React.useCallback(
    (delta: number) => {
      if (order.length === 0) return
      const at = order.indexOf(selectedKey)
      const to = order[Math.min(Math.max(at + delta, 0), order.length - 1)]
      if (to) {
        // Moving past the cap shows the rest, so the open row is never hidden.
        if (order.indexOf(to) >= ROW_CAP) setShowAll(true)
        select(to)
      }
    },
    [order, select, selectedKey]
  )

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      // `j` inside a draft is someone writing the letter j.
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable))
        return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      // A dialog (Post now) owns the keyboard while it is open.
      if (t?.closest('[role="alertdialog"],[role="dialog"]')) return

      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault()
        move(1)
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault()
        move(-1)
      }
    }

    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [move])

  // Nothing ever arrived, or you discarded the last piece. The honest next
  // step is Ideas, where a piece is decided on, not Lineup.
  if (drafts.length === 0) {
    return (
      <KitPage title="Drafts">
        <Stage aria-label="Drafts">
          <EmptyState
            media={<Friend size={40} state="idle" className="text-kit-ink" />}
            bold="Nothing written yet."
            rest="Drafts start in Ideas. Pick one worth writing and I'll write a version for each channel you post to."
          >
            <ButtonLink href="/riffs" variant="action">
              Go to Ideas
            </ButtonLink>
          </EmptyState>
        </Stage>
      </KitPage>
    )
  }

  const waiting = countWaiting(drafts)
  const withoutTime = countWithoutTime(drafts)

  /**
   * Counts what is still a decision, not what exists. When nothing is left it
   * says so instead of "0 versions waiting", a true sentence that reads like a
   * bug — and counts what is approved with no time, the thing that quietly
   * rots, rather than promising Lineup has it.
   */
  const summary =
    waiting.drafts === 0 ? (
      withoutTime === 0 ? (
        "Nothing is waiting on you. Every approved version has a time on Lineup."
      ) : (
        <>
          Nothing is waiting on you, but <Count value={withoutTime} />{" "}
          {withoutTime === 1 ? "version has" : "versions have"} no time yet.
        </>
      )
    ) : (
      <>
        <Count value={waiting.versions} />{" "}
        {waiting.versions === 1 ? "version" : "versions"} waiting on you, in{" "}
        <Count value={waiting.drafts} /> {waiting.drafts === 1 ? "draft" : "drafts"}.
      </>
    )

  // At most ROW_CAP rows, and the open one is always among them.
  const ordered = [...open, ...finished]
  const capped = !showAll && ordered.length > ROW_CAP
  let visible = capped ? ordered.slice(0, ROW_CAP) : ordered
  if (capped && selected && !visible.includes(selected)) {
    visible = [...visible.slice(0, ROW_CAP - 1), selected]
  }
  const hidden = ordered.length - visible.length
  const visibleOpen = visible.filter((d) => !isDone(d))
  const visibleDone = visible.filter(isDone)
  // A heading only when the rows span both groups (lists.md).
  const grouped = open.length > 0 && finished.length > 0

  const row = (d: Draft, done: boolean) => {
    const c = counts(d)
    const channels = d.versions.map((v) => v.label).join(", ")
    return (
      <ListRow
        key={d.id}
        id={rowId(d.id)}
        selected={d.id === selectedKey}
        titleLines={2}
        description={`${channels} · ${d.from.sourceLabel} · ${d.from.at}`}
        meta={<Mono>{done ? "Done" : `${c.total - c.approved} left`}</Mono>}
        onClick={() => select(d.id)}
      >
        {d.idea}
      </ListRow>
    )
  }

  const anyEditing = Object.values(editing).some(Boolean)

  return (
    <KitPage title="Drafts" summary={summary}>
      <Stage
        aria-label="Drafts"
        {...(open.length > 0
          ? {
              lead: "Read it, then approve it.",
              rest: "Nothing goes out in your name until you do.",
            }
          : {
              lead: "Everything here is decided.",
              rest: "Each one says when it goes out, or why it has no time yet.",
            })}
      >
        <List width="with-margin" aria-label="Pieces">
          {grouped && visibleOpen.length > 0 ? (
            <ListHeading>Waiting on you</ListHeading>
          ) : null}
          {visibleOpen.map((d) => row(d, false))}
          {grouped && visibleDone.length > 0 ? <ListHeading>Done</ListHeading> : null}
          {visibleDone.map((d) => row(d, true))}
          {hidden > 0 ? (
            <ListRow onClick={() => setShowAll(true)}>
              Show {hidden} more
            </ListRow>
          ) : null}
        </List>

        {selected ? (
          // Keyed on the piece, so moving down the list mounts fresh cards and
          // no card inherits the last piece's edit state.
          <DraftPiece
            key={selected.id}
            draft={withEdits(selected, edits)}
            done={isDone(selected)}
            initials={initials}
            placements={placements}
            placing={placing}
            offers={offers}
            posts={posts}
            posting={posting}
            anyEditing={anyEditing}
            onApprove={(channel, text) => approve(selected.id, channel, text)}
            onDiscard={(channel) => discard(selected.id, channel)}
            onReopen={(channel) => reopen(selected.id, channel)}
            onSave={(versionId, text) =>
              setEdits((current) => ({ ...current, [versionId]: text }))
            }
            onEditingChange={(versionId, on) =>
              setEditing((current) => ({ ...current, [versionId]: on }))
            }
            onPlace={place}
            onPost={post}
          />
        ) : null}
      </Stage>
    </KitPage>
  )
}

/** The piece with this session's unapproved edits laid over its writing versions. */
function withEdits(draft: Draft, edits: Record<string, string | undefined>): Draft {
  return {
    ...draft,
    versions: draft.versions.map((v) => {
      const edit = edits[v.id]
      return v.state === "writing" && edit !== undefined ? { ...v, text: edit } : v
    }),
  }
}

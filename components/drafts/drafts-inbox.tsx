"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { flushSync } from "react-dom"
import { parseAsString, useQueryState } from "nuqs"

import {
  approveVersion,
  discardVersion,
  placeApprovedVersion,
  reopenVersion,
} from "@/app/(app)/drafts/actions"
import {
  counts,
  countWaiting,
  countWithoutTime,
  isDone,
  type Draft,
} from "@/lib/drafts"
import type { ApprovalPlacement } from "@/lib/scheduling"
import { cn } from "@/lib/utils"
import { withViewTransition } from "@/lib/view-transition"
import { SourceMark } from "@/components/sources/source-mark"

import { DonePane, WorkingPane } from "./draft-pane"
import { AllClear, NoDrafts } from "./draft-parts"

/**
 * /drafts, as an inbox: a rail of pieces on the left, one piece open on the
 * right.
 *
 * **Inbox, not a feed of cards.** Four pages were built against the whole
 * production table and compared — Queue (the shipped list of cards), Focus (one
 * piece at a time, nothing else on screen), Feed, and this. Inbox won for two
 * reasons that outlive the taste argument:
 *
 * - **It is the reversible bet.** Inbox → Focus is a later addition; Focus →
 *   Inbox is a rewrite.
 * - **Grouping fixes a real defect.** `getDrafts` orders `createdAt` ascending,
 *   so the first two things on this page were receipts — finished work, at the
 *   top, above everything still waiting on you. Nothing has been approved since
 *   2026-08-05 while drafts keep accumulating, which says the failing metric on
 *   this surface is throughput and not readability. A list that opens on work
 *   you already did is the wrong end of that.
 *
 * **The state lives here**, as it did in the list this replaces, because two
 * questions need an answer above the version: whether a piece is finished (every
 * version decided) and how much is still waiting on you. A row that owned its
 * own approved flag could answer neither, and the count on the rail would go
 * stale the moment you pressed anything.
 *
 * **The list and the completion map are one `useState`, not two.** They have to
 * change together — "this version is approved" and "that made the piece
 * finished" are one fact — and reading the list from a closure to decide the
 * second was wrong for any two approvals in the same tick: the second click saw
 * the state from before the first, so approving three versions quickly left a
 * piece sitting at 3/3 that never became done. One updater, one `current`, no
 * staleness.
 *
 * **Optimistic, then confirmed.** Each mutation updates local state first and
 * fires the matching server action after. The local update is what the view
 * transition animates against — waiting for a round trip would mean the row sits
 * still for 200ms and then jumps, which is worse than not animating at all. If
 * the write fails the state is rolled back and `router.refresh()` pulls the
 * truth back down, because a page that shows approved for writing nobody
 * approved is the one failure mode worth the extra code.
 */
type ListState = {
  drafts: Draft[]
  /** Which version completed each finished piece, so focus knows where to land. */
  completedBy: Record<string, string>
}

export function DraftsInbox({ initial }: { initial: Draft[] }) {
  const router = useRouter()

  /**
   * Server data arriving after mount, which `useState(initial)` alone ignores.
   *
   * `useState` reads its argument once. So every `router.refresh()` this page
   * triggers — after approving, after giving a version a time — re-rendered the
   * server component, handed down a fresh `initial`, and changed nothing on
   * screen. The write landed and the interface sat still, which reads as a
   * broken button.
   *
   * Adjusting state during render rather than in an effect, which is React's
   * documented way to react to a changed prop: it re-renders immediately, with
   * no intermediate paint of the stale value.
   *
   * Only the server-derived slice is replaced. `completedBy` is this session's
   * memory of which approval finished a piece, and it is what points focus at
   * the right Reopen — resetting it would lose that every time the page
   * refreshed. Each row keeps its own text state, so unsaved edits survive too.
   */
  const [fromServer, setFromServer] = React.useState(initial)
  const [state, setState] = React.useState<ListState>({
    drafts: initial,
    completedBy: {},
  })

  if (initial !== fromServer) {
    setFromServer(initial)
    setState((current) => ({ ...current, drafts: initial }))
  }

  /**
   * Which control should inherit focus after the last action.
   *
   * Every mutation here unmounts the button that triggered it, and the browser
   * answers that by dropping focus to `<body>` — so a keyboard user who approves
   * a version is returned to the top of the document. Separate from `ListState`
   * because it is presentation, not data, and null on first render so nothing
   * steals focus on load.
   */
  const [focused, setFocused] = React.useState<{
    draftId: string
    channel: string
  } | null>(null)

  /**
   * What the server did with each approval, once it has said. Keyed by version.
   *
   * Presentation rather than data, like `focused`: it exists so the done pane can
   * name the outcome instead of asserting one. Per version rather than per piece,
   * because two channels are two different slots at two different times — the
   * row this replaces keyed it by piece and had to pick one of them.
   */
  const [placements, setPlacements] = React.useState<
    Record<string, ApprovalPlacement | undefined>
  >({})

  /** The version whose "Give it a time" is in flight. */
  const [placing, setPlacing] = React.useState<string | null>(null)

  const { drafts, completedBy } = state

  const open = drafts.filter((d) => !isDone(d))
  const finished = drafts.filter(isDone)

  /**
   * Which piece is open, in the URL.
   *
   * A two-pane page whose pane is not addressable loses your place on every
   * refresh — and this page refreshes itself, after every approval and every
   * placement. `?piece=` is what survives that, a reload, the back button, and a
   * link sent to yourself.
   *
   * **The URL is the only copy**, with no mirrored React state beside it, and
   * that is load-bearing rather than tidy. Finishing a piece has to commit the
   * approval *and* the move to the next piece inside one `flushSync`, so both
   * land in the same view-transition snapshot — which only works if this setter
   * commits synchronously. It does: nuqs emits to its subscribers inline and the
   * subscriber calls `setState` in the same tick, and while the history entry
   * itself is throttled, the hook reads its own queued value in preference to
   * the URL until that lands. A second copy of the selection held in `useState`
   * would buy nothing and owe a reconciliation.
   *
   * No default: which piece opens first is a fact about the data, not a
   * constant, and it is decided below.
   */
  const [openPiece, setOpenPiece] = useQueryState("piece", parseAsString)

  /** Floating-promise handling in one place — the setter resolves on the flush. */
  const select = React.useCallback(
    (id: string) => {
      void setOpenPiece(id)
    },
    [setOpenPiece]
  )

  /**
   * Falls back rather than trusting the id, because the id can be stale in three
   * ordinary ways: a link to a piece that has since been discarded, a `?piece=`
   * somebody typed, and the tick after discarding the piece you were reading.
   * Open work first — landing on a receipt is the defect the grouping exists to
   * fix, and it should not come back through the empty case.
   */
  const selected =
    drafts.find((d) => d.id === openPiece) ?? open[0] ?? drafts[0] ?? null
  const selectedKey = selected?.id ?? ""

  /**
   * Whether the transition about to run is a handoff to a different piece.
   *
   * **The two cases need opposite treatments and were getting the same one.**
   * Approving one version of a multi-version piece leaves the piece in the pane:
   * the row before and the row after are the same version of the same post,
   * which is a genuine shared element, and morphing it is right.
   *
   * Finishing a piece replaces the pane with a *different* piece. Nothing is
   * shared. But `pane-row-{i}` is positional, so row 0 of the old piece and row 0
   * of the new one answered to the same name and the browser dutifully morphed
   * one into the other: two unrelated posts cross-fading in one box, which is the
   * old text bleeding through the new.
   *
   * So on a handoff the rows give up their names and the pane, which never had
   * one, keeps not having one — unnamed content belongs to the root snapshot,
   * which globals.css pins to `animation: none; opacity: 1`. The pane cuts to the
   * next piece in a single frame while the rail row travels from "Waiting on you"
   * to "Done". That is the honest division of labour: the rail is carrying the
   * story of what you just did, and the pane is only showing you the next task.
   *
   * A whole-pane cross-fade was built and rejected — the outgoing and incoming
   * pieces are different posts, and fading them through each other reads as a
   * double exposure.
   */
  const [handingOff, setHandingOff] = React.useState(false)

  const paneScroller = React.useRef<HTMLDivElement>(null)

  /**
   * A new piece starts at its own beginning.
   *
   * Measured: scrolled 600px into the 2,914-character Substack draft and then
   * approving it left `scrollTop` at 600 while the incoming piece was only 672px
   * tall — so the browser clamped the scroll to 0 on its own, in whatever frame
   * layout happened to settle. That uncontrolled snap is the lurch this page had,
   * and it was never a motion bug: with the pane cutting rather than animating
   * there is nothing to explain the movement, so it reads as the page falling
   * upward.
   *
   * A layout effect rather than an effect: it runs after the DOM is updated and
   * *before* paint, so the reset and the content swap are one visual change
   * instead of two. Inside a view transition — where React commits under
   * `flushSync` — it runs synchronously too, which means the new snapshot is
   * captured already scrolled to the top rather than mid-document.
   *
   * Keyed on the piece, so this also covers moving through the rail with `j`/`k`
   * or a click: landing halfway down a post you have not read is the same bug
   * wearing different clothes.
   */
  React.useLayoutEffect(() => {
    if (paneScroller.current) paneScroller.current.scrollTop = 0
  }, [selectedKey])

  /**
   * Fire a write, and put the page back if it fails.
   *
   * The snapshot is taken before the optimistic update rather than derived
   * afterwards, so a rollback restores exactly what was on screen instead of
   * something reconstructed from what we think changed.
   */
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

  /** The row id for a channel on a piece. Actions address versions, never slugs. */
  const versionIdFor = React.useCallback(
    (draftId: string, channel: string) =>
      drafts.find((d) => d.id === draftId)?.versions.find((v) => v.channel === channel)
        ?.id,
    [drafts]
  )

  const approve = React.useCallback(
    (draftId: string, channel: string, text: string) => {
      // Whether the piece is now finished or not, the successor control lives on
      // the same version: Reopen, in whichever pane comes next.
      setFocused({ draftId, channel })

      // The write goes out with the text as edited, not as loaded. Approving
      // writing you changed but did not save is the one way this page could lie:
      // the row would say approved and hold the version you rejected.
      const versionId = versionIdFor(draftId, channel)
      if (versionId) {
        /**
         * The one write on this page whose result the UI has to read.
         *
         * Approving also places the version in a slot, and it can honestly fail
         * to — no slot for the channel, or every slot inside the horizon taken.
         * The optimistic update cannot know which, so the done pane starts out
         * saying nothing about the Lineup and this fills it in when the server
         * answers. Guessing would put us back where we started: a page that says
         * "queued in Lineup" when nothing was queued.
         */
        persist(state, async () => {
          const placement = await approveVersion(versionId, text)
          setPlacements((current) => ({ ...current, [versionId]: placement }))
        })
      }

      const piece = drafts.find((d) => d.id === draftId)
      const finishes = piece?.versions.every(
        (v) => v.channel === channel || v.state === "approved"
      )

      const commit = () =>
        setState((current) => {
          const next = current.drafts.map((d) =>
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
          )

          const finished = next.find((d) => d.id === draftId)?.versions.every(
            (v) => v.state === "approved"
          )

          return {
            drafts: next,
            completedBy: finished
              ? { ...current.completedBy, [draftId]: channel }
              : current.completedBy,
          }
        })

      if (!finishes) {
        withViewTransition(commit)
        return
      }

      /**
       * The finishing approval: hand off to the next piece still waiting.
       *
       * **Landing on the next task rather than on a receipt** is the whole point
       * of the grouping — the page's failing metric is throughput, and a queue
       * that stops to show you what you just did after every item is a queue that
       * asks you to restart yourself N times.
       *
       * The next piece is computed here rather than read from the rendered list,
       * because at this moment the commit has not happened yet: the finishing
       * piece still looks open from outside, and anything deriving "the next one"
       * from what is on screen would pick the piece being finished.
       *
       * **Selection moves inside the transition, never before it.**
       * `startViewTransition` snapshots the current layout the moment it is
       * called, so advancing first would put the next piece into the "before"
       * snapshot and leave nothing to morph. Both updates land in the same
       * `flushSync`, so the rail row travels to Done and the next piece arrives
       * as one gesture.
       *
       * The rename has to happen *before* the capture, in its own `flushSync`:
       * the old snapshot is taken from whatever is on screen at that instant, so
       * setting it afterwards would name the new state only and match nothing.
       */
      const next = drafts.find((d) => d.id !== draftId && !isDone(d))

      flushSync(() => setHandingOff(true))

      withViewTransition(() => {
        commit()
        if (next) select(next.id)
      }).then(() =>
        // Names go back once the pane has settled, so the next in-piece approval
        // morphs as before. After the transition rather than inside it — inside,
        // the new snapshot would be named differently from the old one and match
        // nothing.
        setHandingOff(false)
      )
    },
    [drafts, persist, select, state, versionIdFor]
  )

  /**
   * Put an approved version back in play, from either pane. Both are the same
   * operation — one version returns to being a decision — so the piece stops
   * being finished either way.
   */
  const reopen = React.useCallback(
    (draftId: string, channel: string) => {
      setFocused({ draftId, channel })

      const versionId = versionIdFor(draftId, channel)
      if (versionId) persist(state, () => reopenVersion(versionId))

      withViewTransition(() =>
        setState((current) => ({
          drafts: current.drafts.map((d) =>
            d.id !== draftId
              ? d
              : {
                  ...d,
                  versions: d.versions.map((v) =>
                    v.channel !== channel ? v : { ...v, state: "writing" as const }
                  ),
                }
          ),
          // Rebuilt without the key rather than destructured around it: the
          // omit-by-rest idiom leaves a binding nothing reads, and there is no
          // `varsIgnorePattern` configured to excuse it.
          completedBy: Object.fromEntries(
            Object.entries(current.completedBy).filter(([id]) => id !== draftId)
          ),
        }))
      )
    },
    [persist, state, versionIdFor]
  )

  /**
   * Discard removes the version outright — it is confirmed at the button, and a
   * discarded version is not a state the model has. A piece whose last version is
   * discarded is a piece with nothing in it, so the whole piece goes, and the
   * dialog says so before you commit.
   */
  const discard = React.useCallback(
    (draftId: string, channel: string) => {
      const versionId = versionIdFor(draftId, channel)
      if (versionId) persist(state, () => discardVersion(versionId))

      withViewTransition(() =>
        setState((current) => ({
          ...current,
          drafts: current.drafts
            .map((d) =>
              d.id !== draftId
                ? d
                : { ...d, versions: d.versions.filter((v) => v.channel !== channel) }
            )
            .filter((d) => d.versions.length > 0),
        }))
      )
    },
    [persist, state, versionIdFor]
  )

  /**
   * Give an already-approved version a time.
   *
   * Not optimistic and not wrapped in a view transition, unlike approving:
   * nothing moves, the only change is a sentence, and the honest version of that
   * sentence is the one the server produces. `router.refresh` re-reads `goingOut`
   * from lib/drafts.ts, which is the same value a reload would show — so the pane
   * cannot end up claiming a time a refresh would take back.
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
   * Rail order, which is also `j`/`k` order: what is waiting, then what is done.
   * One array so moving down past the last open piece continues into the
   * receipts rather than stopping at a boundary the eye cannot see.
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
      if (to) select(to)
    },
    [order, select, selectedKey]
  )

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      // `j` inside a draft is someone writing the letter j. Stealing these would
      // make the editor unusable.
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable))
        return
      if (e.metaKey || e.ctrlKey || e.altKey) return

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

  // Nothing ever arrived, or you discarded the last piece. Either way there is no
  // rail to draw and the honest next step is Riffs, not Lineup.
  if (drafts.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-8 py-10">
        <h1 className="text-card-title">Drafts</h1>
        <NoDrafts />
      </div>
    )
  }

  const waiting = countWaiting(drafts)

  return (
    // `h-full min-h-0`, not `flex-1` — the pattern components/chat/studio-chat.tsx
    // already uses inside this exact scroll container. It fills the layout's
    // scroller precisely rather than growing it, which is what lets the two sides
    // scroll independently.
    <div className="flex h-full min-h-0">
      <nav
        aria-label="Drafts"
        className="flex w-72 shrink-0 flex-col overflow-y-auto border-r border-border bg-sidebar"
      >
        <div className="flex flex-col gap-1 p-3">
          <h1 className="text-card-title">Drafts</h1>
          {waiting.drafts === 0 ? (
            // Finished, but not empty: the receipts are still in the rail below.
            // This replaces the count rather than sitting alongside it, because
            // "0 drafts · 0 versions waiting on you" is a true sentence that
            // reads like a bug.
            <AllClear withoutTime={countWithoutTime(drafts)} />
          ) : (
            /* Counts what is still a decision, not what exists — a piece whose
               versions are all approved is finished work kept for reference.
               Tabular figures because both tick down as you work, and
               proportional digits make a count jitter. */
            <p className="text-caption text-muted-foreground">
              <span className="font-mono tabular-nums">{waiting.drafts}</span>{" "}
              {waiting.drafts === 1 ? "draft" : "drafts"}
              <span aria-hidden="true"> · </span>
              <span className="font-mono tabular-nums">{waiting.versions}</span>{" "}
              {waiting.versions === 1 ? "version" : "versions"} waiting on you
            </p>
          )}
        </div>

        {open.length > 0 ? (
          <Section title="Waiting on you">
            {open.map((d) => (
              <PieceRow
                key={d.id}
                draft={d}
                done={false}
                selected={d.id === selectedKey}
                onSelect={() => select(d.id)}
              />
            ))}
          </Section>
        ) : null}

        {finished.length > 0 ? (
          <Section title="Done">
            {finished.map((d) => (
              <PieceRow
                key={d.id}
                draft={d}
                done
                selected={d.id === selectedKey}
                onSelect={() => select(d.id)}
              />
            ))}
          </Section>
        ) : null}
      </nav>

      {/* `scrollbar-gutter: stable` so the gutter is reserved whether or not the
          piece is long enough to scroll. Without it, going from a piece that
          overflows to one that does not takes the scrollbar away and the text
          column widens by its width — a horizontal twitch riding along with the
          vertical one. */}
      <div
        ref={paneScroller}
        className="min-w-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]"
      >
        {selected ? (
          isDone(selected) ? (
            <DonePane
              key={`done-${selected.id}`}
              draft={selected}
              completedBy={completedBy[selected.id]}
              placements={placements}
              placing={placing}
              takeFocus={focused?.draftId === selected.id}
              onPlace={place}
              onReopen={(channel) => reopen(selected.id, channel)}
            />
          ) : (
            // Keyed on the piece, so moving down the rail mounts a fresh pane and
            // no row inherits the last piece's unsaved text.
            <WorkingPane
              key={selected.id}
              draft={selected}
              focusChannel={
                focused?.draftId === selected.id ? focused.channel : undefined
              }
              nameRows={!handingOff}
              onApprove={(channel, text) => approve(selected.id, channel, text)}
              onDiscard={(channel) => discard(selected.id, channel)}
              onReopen={(channel) => reopen(selected.id, channel)}
            />
          )
        ) : null}
      </div>
    </div>
  )
}

/**
 * A named group in the rail. A real `<h2>`, because the whole argument for
 * grouping is that the two halves are different kinds of thing, and that is how
 * a screen reader user finds out.
 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-0.5 p-1.5">
      {/* `text-eyebrow`, not `text-caption` plus a hand-set `tracking-wide`. The
          scale already has a role for a small uppercase label and it carries the
          0.06em the capitals need. `px-3` lines the label's left edge up with the
          row labels below, which sit inside a `p-3` button. */}
      <h2 className="px-3 pt-2 pb-1 text-eyebrow font-medium text-muted-foreground uppercase">
        {title}
      </h2>
      {children}
    </section>
  )
}

/**
 * One piece, as a row you select rather than a card you read.
 *
 * What it carries is fixed by what the decision needs: which channels (a piece
 * going to X is a different job from a piece going to Substack), how much is
 * left, and where it came from — never a preview of the text, which is the thing
 * selecting it is for.
 */
function PieceRow({
  draft,
  selected,
  done,
  onSelect,
}: {
  draft: Draft
  selected: boolean
  done: boolean
  onSelect: () => void
}) {
  const c = counts(draft)

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      /**
       * Named, so the browser can animate this row between the two groups.
       *
       * Finishing a piece moves it from "Waiting on you" to "Done", and an
       * element cannot animate out of one list position into another with CSS at
       * all — which is why lib/view-transition.ts exists. Without a name the row
       * teleports, and a teleport at the moment of completion reads as the piece
       * having been lost rather than filed.
       */
      style={{ viewTransitionName: `row-${draft.id}` }}
      className={cn(
        "flex w-full flex-col gap-1.5 rounded-lg p-3 text-start transition-colors duration-150 ease-out outline-none",
        "hover:bg-accent/60 focus-visible:ring-3 focus-visible:ring-ring/50",
        // Selection is a surface, never a left bar — a 2px accent stripe reads as
        // a status (this one is live) in a product where brass already means
        // exactly that. `bg-accent` is a sand step and says "here you are".
        selected && "bg-accent hover:bg-accent"
      )}
    >
      <div className="flex items-center gap-2">
        {/* Channel marks rather than a count. Two versions and three versions
            look the same as "2" and "3"; X-and-LinkedIn and X-and-Substack are
            different pieces of work. `-space-x-1` overlaps them into one object
            so the row does not grow with the piece. */}
        <div className="flex shrink-0 -space-x-1">
          {draft.versions.map((v) => (
            <SourceMark
              key={v.channel}
              id={v.channel}
              label={v.label}
              className="size-5 ring-2 ring-sidebar"
            />
          ))}
        </div>
        {/* Two lines, then clamp. One line truncates most of these ideas into
            uselessness — the real ones run past 100 characters — and three makes
            the rail a wall of prose. */}
        <p className="line-clamp-2 min-w-0 flex-1 text-caption font-medium text-pretty">
          {draft.idea}
        </p>
      </div>

      <p className="text-caption text-muted-foreground">
        {draft.from.sourceLabel}
        <span aria-hidden="true"> · </span>
        {draft.from.at}
        <span aria-hidden="true"> · </span>
        {done ? (
          "done"
        ) : (
          <span className="font-mono tabular-nums">{c.total - c.approved} left</span>
        )}
      </p>
    </button>
  )
}

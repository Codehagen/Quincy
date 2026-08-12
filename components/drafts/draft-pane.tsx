"use client"

import Link from "next/link"
import { ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { duplicates, type Draft, type Version } from "@/lib/drafts"
import { measurePost } from "@/lib/post-length"
import type { ApprovalPlacement } from "@/lib/scheduling"
import { Button } from "@/components/ui/button"
import { SourceMark } from "@/components/sources/source-mark"

import { Clamp, DuplicateNotice, PieceHeader, useFocusOnAppear } from "./draft-parts"
import { GutterRow } from "./gutter-row"

/**
 * What the right-hand side of /drafts shows: one piece, in one of its two
 * states.
 *
 * **The pane is a Ledger** — one column, every version, real measure, no card.
 * Four were compared inside the rail against the whole production table: Board
 * (the old `DraftCard`, three columns), Fitted (the same card with the grid
 * reading the pane instead of the window), Ledger, and Reader (one version at a
 * time behind a channel switcher). Ledger won on three arguments:
 *
 * - **The majority case has one version.** Five of seven real pieces do, and for
 *   those every grid layout leaves half to two-thirds of the pane empty. Fitted
 *   is worse than Board here: at 1280 its container clears the two-column
 *   threshold, so a lone Substack piece gets ~314px of a 736px pane.
 * - **Side-by-side was worth less than it looked.** Its value scales with how
 *   much you cannot hold in your head, and the two real multi-version pieces are
 *   62 and 94/251 characters. Meanwhile three columns in this pane are ~205px —
 *   about 22 characters to the line, against the 45–75 prose wants.
 * - **It deletes a prerequisite instead of adding one.** Fitted needed
 *   `DraftCard`'s grid converted to container queries; Ledger does not use a
 *   grid at all, so the `md:`/`xl:` breakpoints that caused this stop existing.
 *
 * Reader is the one to keep in a pocket rather than throw away: if Atomize
 * starts producing three-version pieces with a newsletter among them, a channel
 * switcher on top of Ledger is additive, not a rewrite.
 */

/**
 * The pane's own frame. Identical in both states, so the left edge never moves.
 *
 * **`max-w-2xl`, and the number is measured rather than picked.** 42rem is 672px,
 * less `px-8` is 608, less the 7rem margin and its gap is a 480px reading column
 * — about 73 characters in Geist at 14px, just inside the 45–75 that prose wants.
 * It was `max-w-3xl`, which ran 544px at 1280 and 576px at 1440: 83 and 87
 * characters. That is the same defect the card had, overshot in the other
 * direction, on a page whose argument for dropping the card was measure. Capping
 * here rather than on the text also holds the column at one width from 1280 up,
 * so the line breaks you approve are the line breaks somebody else's window
 * shows.
 *
 * **Not `ch`.** `max-w-[60ch]` appears on the fold line and the duplicate notice
 * and reads like it is doing this job; it is not. `ch` is the width of "0", which
 * in Geist is 9.28px against a 6.59px average letter, so 60ch is 557px — wider
 * than the column it is nominally bounding. Those guards are inert at this size.
 */
function Pane({
  draft,
  children,
}: {
  draft: Draft
  children: React.ReactNode
}) {
  return (
    <section
      aria-labelledby={`piece-${draft.id}-idea`}
      className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-8 py-8"
    >
      <PieceHeader draft={draft} />
      {children}
    </section>
  )
}

/**
 * The piece you are deciding.
 *
 * `gap-6` between rows: at `gap-3` three versions read as one striped block, and
 * a drawn rule wants less air than nothing at all does.
 */
export function WorkingPane({
  draft,
  focusChannel,
  nameRows,
  onApprove,
  onDiscard,
  onReopen,
}: {
  draft: Draft
  focusChannel?: string
  /**
   * Give each row its own view-transition name, so an in-piece approval morphs
   * and staggers.
   *
   * False during a handoff to a different piece. `pane-row-{i}` is positional,
   * so row 0 of the outgoing piece and row 0 of the incoming one answer to the
   * same name and the browser dutifully morphs one into the other: two unrelated
   * posts cross-fading in one box, which is the old text bleeding through the
   * new. A morph asserts "this is the same thing", and across a handoff that is
   * not true. See `drafts-inbox.tsx` for where the flag is flipped and why the
   * flip has to happen before the snapshot.
   */
  nameRows: boolean
  onApprove: (channel: string, text: string) => void
  onDiscard: (channel: string) => void
  onReopen: (channel: string) => void
}) {
  const twins = duplicates(draft)

  return (
    <Pane draft={draft}>
      <div className="flex flex-col gap-6">
        {draft.versions.map((v, i) => (
          // `group/row` so a row can style itself by its position in the stack —
          // the first one suppresses its own separator, which is a fact only the
          // stack knows.
          //
          // The positional `view-transition-name` is what carries the stagger:
          // when the pane changes piece the rows leave in order, composited from
          // a snapshot rather than by animating layout.
          <div
            key={v.channel}
            className="group/row flex flex-col gap-1.5"
            style={nameRows ? { viewTransitionName: `pane-row-${i}` } : undefined}
          >
            <GutterRow
              version={v}
              draftId={draft.id}
              idea={draft.idea}
              isLast={draft.versions.length === 1}
              takeFocus={focusChannel === v.channel}
              twin={twins[v.channel]}
              onApprove={(text) => onApprove(v.channel, text)}
              onDiscard={() => onDiscard(v.channel)}
              onReopen={() => onReopen(v.channel)}
            />
          </div>
        ))}
      </div>
    </Pane>
  )
}

/**
 * When this version goes out, or the honest reason it has no time.
 *
 * **Server truth first, session memory second.** `goingOut` comes from
 * lib/drafts.ts and survives a reload; `placement` is what the approval you just
 * made returned, and it is the only thing that can describe a write the page has
 * not re-read yet. Reading only `placement` is what produced the failure this
 * was rewritten for: a real account with two approved drafts, neither scheduled,
 * and a row that said "Approved" and nothing else the moment the page refreshed.
 * Reading only `goingOut` is the same bug from the other side — the optimistic
 * state has no time in it, so a version the server just scheduled would sit
 * there claiming it has none.
 *
 * Per version, not per piece. Two channels are two different slots at two
 * different times, and one sentence covering both would have to pick one.
 */
function when(
  version: Version,
  placement?: ApprovalPlacement
): { text: string; muted: boolean; placeable: boolean } {
  if (version.goingOut) {
    return { text: `Going out ${version.goingOut}`, muted: false, placeable: false }
  }

  if (placement?.scheduled) {
    /**
     * A placement past the visible week gets the date as well, for two reasons.
     * "Monday" alone is ambiguous once there is more than one Monday in play —
     * and more importantly, /lineup draws seven days, so this post is scheduled
     * and will not be on the page. Saying only "going out Monday" would send
     * someone to look for it and find nothing.
     */
    const at = new Date(placement.at).toLocaleString(undefined, {
      weekday: placement.beyondThisWeek ? "short" : "long",
      ...(placement.beyondThisWeek ? { day: "numeric", month: "short" } : {}),
      hour: "2-digit",
      minute: "2-digit",
    })

    return {
      text: placement.beyondThisWeek
        ? `Going out ${at}, past the week Lineup shows`
        : `Going out ${at}`,
      muted: false,
      placeable: false,
    }
  }

  // Every slot inside the horizon is taken. `hasSlot` cannot tell this apart
  // from the case below — the channel does have a rhythm, it is just full — so
  // it is only knowable from what the server just answered.
  if (placement && !placement.scheduled && placement.reason === "slots-full") {
    return {
      text: `Every ${version.label} slot is taken for the next two weeks — free one up on Lineup`,
      muted: true,
      placeable: false,
    }
  }

  /**
   * Approved, a slot exists, and still no time. It happens when the approval
   * came first and the slot came after — placement runs at the moment of
   * approval and never again, so adding the slot later changes nothing on its
   * own. This is the one state here whose fix is a press rather than a journey.
   */
  if (version.hasSlot) {
    return {
      text: "Approved before that slot existed, so it has no time yet",
      muted: true,
      placeable: true,
    }
  }

  return {
    text: `No ${version.label} slot yet, so it has no time`,
    muted: true,
    placeable: false,
  }
}

function PublishedVersion({
  version,
  twin,
  placement,
  placing,
  takeFocus,
  onPlace,
  onReopen,
}: {
  version: Version
  twin?: string
  placement?: ApprovalPlacement
  /** A place request for this version is in flight. */
  placing: boolean
  takeFocus: boolean
  onPlace: () => void
  onReopen: () => void
}) {
  const { used, limit } = measurePost(version.text, version.channel)
  const state = when(version, placement)
  const reopenRef = useFocusOnAppear<HTMLButtonElement>(takeFocus)

  return (
    <article className="flex gap-4 border-t border-border pt-6 [border-top-width:var(--border-hairline)] first:border-t-0 first:pt-0">
      {/* The same 7rem margin as the working pane, so the left edge is
          continuous between the two states of the page. */}
      <div className="flex w-28 shrink-0 flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <SourceMark id={version.channel} label={version.label} className="size-5" />
          <h3 className="text-card-title">{version.label}</h3>
        </div>
        <p className="font-mono text-caption text-muted-foreground tabular-nums">
          {used}
          {limit === null ? "" : ` / ${limit}`}
        </p>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {/* Three states, three sentences. Only the first is finished work, and
            the other two have different next steps — collapsing them into
            "queued" is the bug plans/010 fixed. */}
        <p className="text-caption">
          <span className={state.muted ? "text-muted-foreground" : undefined}>
            {state.text}
          </span>
        </p>

        <Clamp text={version.text}>
          {() => (
            <p className="text-body text-pretty whitespace-pre-wrap">{version.text}</p>
          )}
        </Clamp>

        {twin ? <DuplicateNotice twin={twin} label={version.label} /> : null}

        <div className="flex items-center gap-2">
          <Button
            ref={reopenRef}
            type="button"
            variant="ghost"
            size="sm"
            className="-mx-2 text-muted-foreground"
            onClick={onReopen}
          >
            Reopen
          </Button>

          {/* The repair for the state above, and the reason it is a button
              rather than advice: the alternative is "reopen and approve again",
              which routes a decision you have already made back through the
              state where you have not made it, and rewrites `approvedAt` to
              today for something you approved on Tuesday.

              Default variant, not ghost. It is the only thing standing between
              this version and going out, so it should not be the quietest
              control in the row. Sized for the longer of the two labels, or the
              row reflows the instant you press it — which reads as the layout
              flinching away from the click. */}
          {state.placeable ? (
            <Button
              type="button"
              size="sm"
              disabled={placing}
              onClick={onPlace}
              style={{ minWidth: "9.5rem" }}
            >
              {placing ? "Giving it a time…" : "Give it a time"}
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  )
}

/**
 * The piece you have finished: **Published**.
 *
 * Three done panes were compared — Receipt (the old `DoneDraft`: one muted row
 * and a disclosure), Archive (the working pane frozen) and this. Published won
 * on one concrete fact rather than on taste: it is the only one that says *when
 * each version goes out*, which is the sole open question about an approved
 * version and the thing `forste-post` exposes — approved before a LinkedIn slot
 * existed, so it has no time at all. Receipt buries that in a clause behind a
 * click; Archive never mentions it, and says "Approved" twice instead.
 *
 * **The writing stays readable here, at full size.** It used to be reachable
 * only through a disclosure on a collapsed row, and before that not at all —
 * so between approving and publishing there was no surface in the product that
 * would show you what was about to go out in your name. That was defensible
 * while approving was the end of it. It stopped being defensible when
 * lib/publish-run.ts started sending on a schedule, because the whole safety
 * argument in docs/vision.md rests on you having read the text.
 *
 * Reopen rather than Undo, and on every version rather than only the one that
 * finished the piece. Approving is not destructive, so it needs no confirmation;
 * but a piece leaving the queue is a surprise, and a surprise you cannot reverse
 * is what makes people distrust the button. Undo could only ever reverse an
 * action from this session — Reopen is the same gesture without that limit.
 *
 * **Never a toast**, which is the rule this surface exists to keep. A timed,
 * dismissible container holding the only route back to a thing is a deadline on
 * noticing your own mistake. This pane has no deadline at all: the piece keeps
 * its row in the rail under "Done", so the way back is still there tomorrow.
 */
export function DonePane({
  draft,
  completedBy,
  placements,
  placing,
  takeFocus,
  onPlace,
  onReopen,
}: {
  draft: Draft
  /** Which version finished it, when you are the one who did. */
  completedBy?: string
  /** What the server said about a time, per version id, once it has said. */
  placements: Record<string, ApprovalPlacement | undefined>
  /** The version id whose place request is in flight. */
  placing: string | null
  takeFocus: boolean
  onPlace: (versionId: string) => void
  onReopen: (channel: string) => void
}) {
  const twins = duplicates(draft)

  return (
    <Pane draft={draft}>
      <div className="flex flex-col gap-6">
        {draft.versions.map((v) => (
          <PublishedVersion
            key={v.channel}
            version={v}
            twin={twins[v.channel]}
            placement={placements[v.id]}
            placing={placing === v.id}
            // Only the version whose Approve button this replaced inherits
            // focus, and only when you are the one who pressed it. A piece that
            // arrived already approved has nothing to hand focus to.
            takeFocus={takeFocus && completedBy === v.channel}
            onPlace={() => onPlace(v.id)}
            onReopen={() => onReopen(v.channel)}
          />
        ))}
      </div>

      <Button
        nativeButton={false}
        variant="outline"
        className="self-start"
        render={<Link href="/lineup" />}
      >
        Open Lineup
        <HugeiconsIcon aria-hidden="true" data-icon="inline-end" icon={ArrowRight01Icon} />
      </Button>
    </Pane>
  )
}

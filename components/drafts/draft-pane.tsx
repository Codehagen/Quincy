"use client"

import * as React from "react"
import Link from "next/link"
import {
  ArrowRight01Icon,
  LinkSquare02Icon,
  SentIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { duplicates, type Draft, type Version } from "@/lib/drafts"
import { measurePost } from "@/lib/post-length"
import type { SendNowResult } from "@/lib/publish-run"
import type { ApprovalPlacement } from "@/lib/scheduling"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { SourceMark } from "@/components/sources/source-mark"

import {
  Clamp,
  DuplicateNotice,
  PieceHeader,
  useFocusOnAppear,
} from "./draft-parts"
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
            style={
              nameRows ? { viewTransitionName: `pane-row-${i}` } : undefined
            }
          >
            <GutterRow
              version={v}
              draftId={draft.id}
              idea={draft.idea}
              isLast={draft.versions.length === 1}
              takeFocus={focusChannel === v.channel}
              twin={twins[v.channel]}
              // Already loaded on every piece — `getDrafts` selects it so a
              // draft can say what it is downstream of — so recognising a
              // failed drafting call costs a comparison and no query.
              hook={draft.from.riffHook}
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
type When = {
  text: string
  muted: boolean
  /** Show "Give it a time": approved, a slot exists, and no time was taken. */
  placeable: boolean
  /** Show "Post now": nothing has gone out and nothing is in flight. */
  postable: boolean
  /** The live post, once there is one. */
  url?: string | null
  /**
   * `wrong` for the two states where something did not happen that was supposed
   * to. Everything else on this row is quiet on purpose — a pane of muted
   * sentences is the right register for "here is what will happen" — but a post
   * the platform refused is not a note, and rendering it in the same grey as
   * "no slot yet" is how a failure goes unread for a week.
   */
  tone?: "wrong"
}

function when(
  version: Version,
  placement?: ApprovalPlacement,
  posted?: SendNowResult
): When {
  /**
   * On the internet already. Everything below is about a future, and this
   * version does not have one — so it is answered first, from the server’s row
   * rather than from anything this session remembers.
   */
  if (version.sent?.state === "published") {
    return {
      text: `Posted ${version.sent.at}`,
      muted: false,
      placeable: false,
      postable: false,
      url: version.sent.url,
    }
  }

  /**
   * The press you just made, before the page has re-read anything.
   *
   * Both halves matter. A success needs saying in the second before
   * `router.refresh` lands, and a failure may leave no trace on the row at all
   * — "no LinkedIn account is connected" never reaches `scheduled_post`, so
   * without this the row would fall through to "no slot yet" and the reason the
   * post did not go would be nowhere on screen.
   */
  if (posted) {
    return posted.ok
      ? {
          text: "Posted just now",
          muted: false,
          placeable: false,
          postable: false,
          url: posted.url,
        }
      : {
          text: posted.message,
          muted: true,
          placeable: false,
          // Retryable, because most of these are: a connection to repair, a
          // limit to wait out. The two that are not — published and sending —
          // are caught above and by the branch below.
          postable: true,
          tone: "wrong" as const,
        }
  }

  // Claimed and mid-flight. Nothing automated resolves this and neither does a
  // button, so the row offers none — see `claim` in lib/publish-run.ts.
  if (version.sent?.state === "sending") {
    return {
      text: "Quincy is sending this one. Check the account before trying again.",
      muted: true,
      placeable: false,
      postable: false,
    }
  }

  // It tried and the platform said no. The words are the platform’s, never
  // paraphrased, and the next step is to press Post now again once whatever
  // they describe is fixed.
  if (version.sent?.state === "failed") {
    return {
      text: version.sent.error ?? "It did not go out.",
      muted: true,
      placeable: false,
      postable: true,
      tone: "wrong" as const,
    }
  }

  if (version.goingOut) {
    return {
      text: `Going out ${version.goingOut}`,
      muted: false,
      placeable: false,
      postable: true,
    }
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
      postable: true,
    }
  }

  // Every slot inside the horizon is taken. `hasSlot` cannot tell this apart
  // from the case below — the channel does have a rhythm, it is just full — so
  // it is only knowable from what the server just answered.
  if (placement && !placement.scheduled && placement.reason === "slots-full") {
    return {
      text: `Every ${version.label} slot is taken for the next two weeks — free one up on Lineup, or send it now`,
      muted: true,
      placeable: false,
      postable: true,
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
      postable: true,
    }
  }

  return {
    text: `No ${version.label} slot yet, so it has no time — give it one on Lineup, or send it now`,
    muted: true,
    placeable: false,
    postable: true,
  }
}

/**
 * Send it now, with the one confirmation this pane adds.
 *
 * **Why a dialog, on a product whose rule is that only Discard gets one.** That
 * rule holds because everything else here is reversible: approving is undone by
 * Reopen, a time is undone by moving it, and both leave the writing where it
 * was. This one is not. The text is on somebody's timeline a second later, in
 * their name, and the product has no unsend — `reopenVersion` says as much out
 * loud. A press that cannot be taken back is worth a sentence first.
 *
 * The dialog is controlled rather than left to close itself: `AlertDialogAction`
 * is a plain button, and the row it sits behind survives the press, so without
 * this the confirmation would stay open over a post that had already gone.
 */
function PostNow({
  label,
  idea,
  pending,
  primary,
  onPost,
}: {
  label: string
  idea: string
  pending: boolean
  /** True when this is the only way this version goes out at all. */
  primary: boolean
  onPost: () => void
}) {
  const [open, setOpen] = React.useState(false)

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            type="button"
            size="sm"
            variant={primary ? "default" : "outline"}
            disabled={pending}
            aria-label={`Post the ${label} version now`}
          />
        }
      >
        <HugeiconsIcon aria-hidden="true" icon={SentIcon} />
        {pending ? "Posting…" : "Post now"}
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Post this to {label} now?</AlertDialogTitle>
          {/* Names the channel and says the two things that are actually true
              and actually irreversible: it goes out under your own account, and
              nothing here can take it back. */}
          <AlertDialogDescription>
            The {label} version of “{idea}” goes out immediately, in your name.
            Quincy cannot unsend it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Not yet</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              setOpen(false)
              onPost()
            }}
          >
            Post now
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function PublishedVersion({
  version,
  idea,
  twin,
  placement,
  placing,
  posting,
  posted,
  takeFocus,
  onPlace,
  onPost,
  onReopen,
}: {
  version: Version
  /** The piece's idea, for the Post now confirmation. */
  idea: string
  twin?: string
  placement?: ApprovalPlacement
  /** A place request for this version is in flight. */
  placing: boolean
  /** A post request for this version is in flight. */
  posting: boolean
  /** What the server said about sending it, once it has said. */
  posted?: SendNowResult
  takeFocus: boolean
  onPlace: () => void
  onPost: () => void
  onReopen: () => void
}) {
  const { used, limit } = measurePost(version.text, version.channel)
  const state = when(version, placement, posted)
  const reopenRef = useFocusOnAppear<HTMLButtonElement>(takeFocus)

  return (
    <article className="flex gap-4 border-t [border-top-width:var(--border-hairline)] border-border pt-6 first:border-t-0 first:pt-0">
      {/* The same 7rem margin as the working pane, so the left edge is
          continuous between the two states of the page. */}
      <div className="flex w-28 shrink-0 flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <SourceMark
            id={version.channel}
            label={version.label}
            className="size-5"
          />
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
          <span
            // `role="alert"` only on the wrong ones. A live region announcing
            // "going out Monday" on every render would talk over the page.
            role={state.tone === "wrong" ? "alert" : undefined}
            className={
              state.tone === "wrong"
                ? "text-destructive"
                : state.muted
                  ? "text-muted-foreground"
                  : undefined
            }
          >
            {state.text}
          </span>
        </p>

        <Clamp text={version.text}>
          {() => (
            <p className="text-body text-pretty whitespace-pre-wrap">
              {version.text}
            </p>
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

          {/* The other way out, and the only one when the channel has no
              rhythm at all. It is the filled control exactly then: a row whose
              every action is quiet is a row with no next step, which is the
              dead end this button was added to end.

              It steps back to outline the moment the version has a future of
              its own — a time already taken, or a slot waiting to give it one.
              A post that goes out Tuesday does not need the loudest control on
              the row telling you to send it today. */}
          {state.postable ? (
            <PostNow
              label={version.label}
              idea={idea}
              pending={posting}
              primary={!state.placeable && !version.goingOut}
              onPost={onPost}
            />
          ) : null}

          {/* The receipt. A row that says posted and cannot show you the post
              is asking you to take our word for it. */}
          {state.url ? (
            <Button
              nativeButton={false}
              variant="outline"
              size="sm"
              // Matches the receipt on /lineup: same wording, same icon, same
              // new tab. Two surfaces describing one post should not each have
              // their own idea of what a link to it looks like.
              render={
                <Link href={state.url} target="_blank" rel="noreferrer" />
              }
            >
              View post
              <HugeiconsIcon
                aria-hidden="true"
                data-icon="inline-end"
                icon={LinkSquare02Icon}
              />
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
  posts,
  posting,
  takeFocus,
  onPlace,
  onPost,
  onReopen,
}: {
  draft: Draft
  /** Which version finished it, when you are the one who did. */
  completedBy?: string
  /** What the server said about a time, per version id, once it has said. */
  placements: Record<string, ApprovalPlacement | undefined>
  /** The version id whose place request is in flight. */
  placing: string | null
  /** What the server said about sending it, per version id, once it has said. */
  posts: Record<string, SendNowResult | undefined>
  /** The version id whose post request is in flight. */
  posting: string | null
  takeFocus: boolean
  onPlace: (versionId: string) => void
  onPost: (versionId: string) => void
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
            idea={draft.idea}
            twin={twins[v.channel]}
            placement={placements[v.id]}
            placing={placing === v.id}
            posting={posting === v.id}
            posted={posts[v.id]}
            // Only the version whose Approve button this replaced inherits
            // focus, and only when you are the one who pressed it. A piece that
            // arrived already approved has nothing to hand focus to.
            takeFocus={takeFocus && completedBy === v.channel}
            onPlace={() => onPlace(v.id)}
            onPost={() => onPost(v.id)}
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
        <HugeiconsIcon
          aria-hidden="true"
          data-icon="inline-end"
          icon={ArrowRight01Icon}
        />
      </Button>
    </Pane>
  )
}

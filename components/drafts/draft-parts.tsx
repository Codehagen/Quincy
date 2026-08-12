"use client"

import * as React from "react"
import Link from "next/link"
import {
  Alert01Icon,
  ArrowDown01Icon,
  Delete02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import type { Draft, Version } from "@/lib/drafts"
import { countGraphemes, measurePost, splitAtFold } from "@/lib/post-length"
import { cn } from "@/lib/utils"
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

/**
 * The pieces both panes of /drafts are built from.
 *
 * The page is an Inbox: a rail of pieces on the left, one piece open on the
 * right, in one of two states — being decided or decided. Both panes live in
 * `draft-pane.tsx`. This file is what they share: the plumbing of a version row,
 * the header a piece gets when it is open, and the two empty states.
 *
 * **What used to be here and is gone.** `Lineage`, `VersionEditor` and
 * `ApprovedVersion` were the parts of a card, and the card is gone — see
 * `drafts-inbox.tsx` for the run that replaced it and what the production table
 * said to make that the right call. Their jobs did not disappear with them:
 * `PieceHeader` below is `Lineage` minus the duplication a rail makes of it, and
 * `GutterRow` is `VersionEditor` and `ApprovedVersion` as one row that morphs
 * between the two states rather than two components that swap.
 *
 * The rules that shaped this surface, in the order they bit, and which all still
 * hold in the pane:
 *
 * - **A draft is writing, so it gets a measure.** The gutter layout exists to
 *   give it one: a fixed margin for the channel and one shared left edge for
 *   every text. Measured at 1280, the pane's column runs 480px — about 73
 *   characters in Geist at 14px, inside the 45–75 prose wants. The card managed
 *   37. See `Pane` in draft-pane.tsx for where the cap is set and why it is not
 *   written in `ch`.
 * - **And a depth.** Every version rests at the same reading window and says
 *   how much is under it — see `CLAMP_AFTER` below for why, and what the
 *   database said that made it necessary.
 * - **Validate late.** The counter is live because a character ceiling is a
 *   constraint you steer by, not a mistake you get told about — but it only
 *   turns red once you are actually over, the field only reports invalid then,
 *   and the message is wired to the field with `aria-describedby` so the reason
 *   reaches a screen reader rather than only an eye.
 * - **One primary action per version.** Approve is filled. Discard is ghost,
 *   pushed to the far edge, and confirmed; proximity implies equivalence and
 *   these are not equivalent.
 * - **Layout must not move as you type.** The counter is tabular, and it sits in
 *   the margin rather than in the text column, so neither the number changing
 *   nor the fold line appearing shifts the controls under your cursor.
 *
 * **No platform chrome.** No avatar, no handle, no like button. contentport
 * mimics X in full and is right to — they are X-only. We publish to N channels,
 * and mirroring N design systems we do not own is N moving targets that change
 * without telling us. The avatar and the engagement bar change no words. The
 * fold and the counting change every word, and both are here.
 */

/**
 * Hoisted rather than inlined at the call site.
 *
 * `useSyncExternalStore` re-subscribes whenever the `subscribe` identity
 * changes, so an inline `() => () => {}` tore down and rebuilt a subscription
 * on every render of every row on the page — for a value that never changes at
 * runtime. One module-level reference, no resubscription.
 */
const NEVER_CHANGES = () => () => {}
const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform)
const notMac = () => false

/**
 * Where a version's text stops at rest, and the run that decided it.
 *
 * **The failure.** `Textarea` carries `field-sizing-content`, so a version's
 * height is its text's height. That is fine while every version is a feed post,
 * which is the only case the prototype behind it ever showed — its Substack
 * fixture was a 108-character teaser. (That surface was `app/prototypes/drafts`
 * and is deleted; this comment is the record.) The production table on
 * 2026-08-09 was not that:
 *
 * | channel  | rows | avg  | max  | max lines |
 * | -------- | ---- | ---- | ---- | --------- |
 * | substack | 2    | 1502 | 2914 | 34        |
 * | linkedin | 3    | 250  | 436  | 9         |
 * | x        | 4    | 124  | 274  | 7         |
 *
 * A 30× spread inside one piece. The Substack version of "Hvordan vi prissetter
 * en agent" is 2,914 characters, so it renders about 2,000px tall; nothing here
 * was collapsible until it was approved, so there was no way out of it from the
 * page.
 *
 * **The decision**, from four variants built against those rows rather than
 * against fixtures. The prototype surface was `app/prototypes/draft-length` and
 * is deleted; this comment is the record, which is why the rejected three are
 * written down:
 *
 * - Chosen — **clamp**: one reading window for every version, the rest behind a
 *   button that names how much it is. The pane is bounded by construction, so
 *   a stack of versions is a few hundred pixels rather than a few thousand —
 *   which is also what keeps "the rows below move" an honest animation.
 * - Rejected — **spines**: every version an accordion bar, one open at a time
 *   at 68ch. The best reading experience of the four and it cost the thing the
 *   page existed for at the time: two versions could never be in full view
 *   together. Worth revisiting now that the pane is one column anyway.
 * - Rejected — **breakout**: split on `CHANNEL_RULES`, a channel with a limit
 *   keeps its column and a channel without one takes a full-width row. Right
 *   about long-form being a different object, and moot once the grid went.
 *
 * **The number.** 700 is read off the table: every real X version (max 274) and
 * every real LinkedIn version (max 436) is under it, so a feed post is never
 * clipped and never grows a control it has no use for. Only long-form crosses
 * it. `18rem` is about thirteen lines at the pane's width — far enough to judge
 * an opening, a voice, and whether two channels are saying the same thing, which
 * is every question this page asks.
 */
const CLAMP_AFTER = 700
const CLAMP_HEIGHT = "18rem"

/** ⌘ on a Mac, Ctrl everywhere else. Read after mount so SSR and client agree. */
export function useModifier() {
  return React.useSyncExternalStore(NEVER_CHANGES, isMac, notMac) ? "⌘" : "Ctrl"
}

/**
 * Move focus onto a control that has just replaced the one you pressed.
 *
 * Approving unmounts the Approve button. The browser then drops focus to
 * `<body>`, so a keyboard user who approves the last version is returned to the
 * top of the document with no idea what happened — measured, not assumed.
 * riff-parts.tsx already fights this in `Steer`; every state change on this page
 * that swaps a focused control for a different one owes the same debt.
 *
 * `active` is false on first render for every row, so nothing steals focus on
 * page load. It only becomes true for the one element that replaced whatever you
 * just pressed.
 */
export function useFocusOnAppear<T extends HTMLElement>(active: boolean) {
  const ref = React.useRef<T>(null)

  React.useEffect(() => {
    if (active) ref.current?.focus()
  }, [active])

  return ref
}

/**
 * Everything a version's editor needs that is not chrome.
 *
 * Text stays local to the row and only travels up on approve. Lifting it would
 * re-render the pane on every keystroke to serve a value nothing else reads
 * until you commit it.
 */
export function useRow(version: Version, draftId: string, hook?: string) {
  const [text, setText] = React.useState(version.text)
  const id = `row-${draftId}-${version.channel}`
  const overId = `${id}-over`
  const foldId = `${id}-fold`
  const hookId = `${id}-hook`
  const { used, limit, over } = measurePost(text, version.channel)
  const hidden = splitAtFold(text, version.channel).hidden.trim()

  /**
   * The body is the angle's hook, verbatim — so the model never wrote it.
   *
   * `draftAngle` falls back to writing the hook into every channel body when
   * its model call fails, deliberately, so you get a line you can work from
   * rather than an error and nothing. /riffs says so on the angle card. /drafts
   * did not, and /drafts is where it is actually met: on 2026-08-08 a Substack
   * version whose whole body was an 89-character hook sat in this editor
   * looking like something Quincy had written.
   *
   * Compared against `text`, not `version.text`. The notice is about what is in
   * the field right now, so it clears itself on the first keystroke — once you
   * have written anything it is no longer your hook sitting there, and a notice
   * that outlived the condition would be the more annoying bug.
   */
  const isHook =
    hook !== undefined && hook.trim() !== "" && text.trim() === hook.trim()

  // Every annotation describes the field, and all are conditional — an id
  // pointing at an element that is not rendered is worse than no id, because a
  // screen reader announces nothing and reports no error.
  const describedBy =
    [over > 0 ? overId : null, hidden ? foldId : null, isHook ? hookId : null]
      .filter(Boolean)
      .join(" ") || undefined

  return {
    text,
    setText,
    id,
    overId,
    foldId,
    hookId,
    isHook,
    used,
    limit,
    over,
    describedBy,
  }
}

/**
 * Clip a long version to the reading window, with the rest one press away.
 *
 * The mask sits on this box and its child goes bare. Masking a bordered field
 * whole fades the border along with the text, so a clamped version renders as a
 * bordered box dissolving across its bottom third — that reads as a rendering
 * fault, not as text continuing. In the gutter layout the field has no border to
 * lose, which is one of the quieter things that layout bought.
 *
 * `overflow-hidden` is what keeps the fade honest: a capped textarea scrolls by
 * default, and a fade over something that scrolls hides the line you are
 * scrolling toward. The clip has to be a real dead end, with the button below as
 * the only way past it.
 *
 * No motion on the reveal. Height cannot transition to `auto`, and the grid-rows
 * trick that solves that elsewhere only spans 0fr to 1fr — it has nothing to say
 * about clamped to full. An instant open is the honest option; a 2,000px slide
 * would be worse than the jump.
 */
export function Clamp({
  text,
  className,
  children,
}: {
  text: string
  className?: string
  /** Receives `onFocus`, because every route into the text has to open it. */
  children: (state: { onFocus: () => void }) => React.ReactNode
}) {
  /**
   * State, not a ref, and reset by remount: reopening an approved version mounts
   * a fresh row, which should rest clamped like every other.
   *
   * `graphemes` rather than the counter's `used`: `used` charges X a flat 23 per
   * link, which is the right number for the ceiling and the wrong one for "how
   * much text is under the fade" — a post with three links would advertise fewer
   * characters than it hides. `text.length` is wrong the other way, counting a
   * flag as four. See lib/post-length.ts.
   */
  const [expanded, setExpanded] = React.useState(false)
  const graphemes = countGraphemes(text)
  const long = graphemes > CLAMP_AFTER
  const clamped = long && !expanded

  return (
    <>
      <div
        className={cn(
          "flex min-h-0 flex-col",
          clamped && "overflow-hidden",
          className
        )}
        style={
          clamped
            ? {
                maxHeight: CLAMP_HEIGHT,
                // A mask rather than a gradient overlay: this has to composite
                // with the page ground in both themes, and an overlay tuned to
                // one of them is a grey smear in the other.
                maskImage:
                  "linear-gradient(to bottom, black calc(100% - 3.5rem), transparent)",
              }
            : undefined
        }
      >
        {/* Focusing opens it — typing into a clipped field would put the caret
            under the cut. The clamp is a resting state, not a mode. */}
        {children({ onFocus: () => setExpanded(true) })}
      </div>

      {/* Only where something is actually under the cut — otherwise this is a
          dead control on every short post. Named by how much it reveals, because
          "Show more" on a two-paragraph teaser and on a 2,900-character
          newsletter are very different promises. */}
      {long ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-my-1 self-start text-muted-foreground"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
        >
          <HugeiconsIcon
            aria-hidden="true"
            icon={ArrowDown01Icon}
            // Same curve and duration as every other disclosure indicator in the
            // product. `prefers-reduced-motion` is flattened globally in
            // app/globals.css.
            className={cn(
              "transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
              expanded && "rotate-180"
            )}
          />
          {expanded
            ? "Show less"
            : `Show all ${graphemes.toLocaleString("en")} characters`}
        </Button>
      ) : null}
    </>
  )
}

/**
 * "142 / 280", in the platform's own units.
 *
 * Not `text.length`. A Norwegian flag is four UTF-16 units and one character; a
 * link on X costs a flat 23 whatever its real length. lib/post-length.ts does
 * the counting and is tested, because a counter that is wrong is worse than no
 * counter — it is wrong confidently, and you approve on the strength of it.
 *
 * Tabular figures, and it lives in the row's margin rather than in the text
 * column, so the number changing as you type never moves the controls under your
 * cursor. The over-limit sentence carries an id: it is the field's error
 * message, and an `aria-invalid` field whose reason is an unassociated paragraph
 * tells a screen reader user that something is wrong and never what.
 */
export function Counter({
  used,
  limit,
  over,
  messageId,
  className,
}: {
  used: number
  limit: number | null
  over: number
  messageId: string
  className?: string
}) {
  return (
    <div
      className={cn("flex min-h-5 flex-wrap items-baseline gap-x-2", className)}
    >
      <p
        className={cn(
          // `whitespace-nowrap` is load-bearing: in a narrow margin "251 / 280"
          // wrapped onto three lines and dragged the row's height with it.
          "font-mono text-caption whitespace-nowrap tabular-nums",
          over > 0 ? "text-destructive" : "text-muted-foreground"
        )}
      >
        {used}
        {limit === null ? "" : ` / ${limit}`}
      </p>
      {over > 0 ? (
        <p id={messageId} className="text-caption text-pretty text-destructive">
          {over} over — trim it or split it into a thread
        </p>
      ) : null}
    </div>
  )
}

/**
 * Where the feed stops showing it.
 *
 * **A boundary, not a copy.** The first version of this reprinted everything
 * above the fold, which put the same 140 characters on screen twice, twenty
 * pixels apart — it read as a rendering bug, and the half it duplicated was the
 * half already in the editor above. What you cannot see from a textarea is not
 * the text; it is where the cut lands. So that is all this shows: a few words
 * either side of the boundary, and whether it lands mid-word.
 *
 * Rendered as a caption line rather than a filled block, because an annotation
 * about a field should not carry the same weight as the field. In our own type
 * throughout — the fold is a constraint worth showing, the avatar and the like
 * button are decoration that would age the moment they redesign.
 *
 * Renders nothing when nothing is hidden.
 */
export function Fold({
  text,
  channel,
  id,
}: {
  text: string
  channel: string
  id: string
}) {
  const { visible, hidden } = splitAtFold(text, channel)
  if (!hidden.trim()) return null

  // Mid-word means no whitespace on either side of the cut. It is the one fact
  // here worth leading with, because it is the one that makes the fold read as
  // broken to someone scrolling past.
  const midWord = /\S$/.test(visible) && /^\S/.test(hidden)

  // A keyhole either side of the boundary. Enough to recognise where you are in
  // your own sentence, far short of reprinting it.
  const before = visible.slice(-24).replace(/^\S*\s/, "")
  const after = hidden.slice(0, 16).replace(/\s\S*$/, "")

  return (
    <p
      id={id}
      className="max-w-[60ch] text-caption text-pretty text-muted-foreground"
    >
      {midWord ? "Feed cuts mid-word" : "Feed cuts"} after{" "}
      <span className="text-foreground">
        “…{before}
        {/* `aria-hidden`, not `aria-label="fold"`. A bare span has role
            `generic`, which prohibits an accessible name, so the label was
            dropped and the pipe was announced as a pipe mid-sentence. The
            surrounding text already says a cut happens here. */}
        <span className="text-destructive" aria-hidden="true">
          |
        </span>
        {after}…”
      </span>{" "}
      {/* Only the digits are tabular. Setting the whole phrase in mono put a
          slab of monospace mid-sentence; the number is the part that changes as
          you type, and it is the only part that needs to hold its width. */}
      <span className="whitespace-nowrap">
        <span className="font-mono tabular-nums">{countGraphemes(hidden)}</span>{" "}
        characters hidden
      </span>
    </p>
  )
}

/**
 * Discard, behind a confirmation.
 *
 * Discarding a version destroys writing, cannot be undone, and sits one click
 * from the thing you actually came to press. That is the shape forms-and-inputs
 * puts a confirmation in front of. It is a real dialog rather than `confirm()`,
 * and the destructive verb is on the confirming button rather than on "OK", so
 * the last thing you read before committing says what happens.
 *
 * Approve gets no dialog on purpose: it is reversible from the pane, and a
 * confirmation on the primary action of a queue is how a queue becomes unusable.
 */
export function DiscardVersion({
  label,
  idea,
  isLast,
  className,
  onDiscard,
}: {
  label: string
  idea: string
  /** True when this is the only version left, so the piece goes with it. */
  isLast: boolean
  className?: string
  onDiscard?: () => void
}) {
  return (
    <AlertDialog>
      {/* Same height as Approve, deliberately. It was `size="sm"`, which put a
          28px control next to a 32px one in the same row and left their
          baselines 2px apart — the kind of thing nobody sees and everybody
          feels. Weight comes from variant and colour, and `ghost` plus
          `muted-foreground` already carries it. */}
      <AlertDialogTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            className={cn("text-muted-foreground", className)}
            aria-label={`Discard the ${label} version`}
          />
        }
      >
        <HugeiconsIcon aria-hidden="true" icon={Delete02Icon} />
        Discard
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isLast ? `Discard “${idea}”?` : `Discard the ${label} version?`}
          </AlertDialogTitle>
          {/* The last version is a different question with a different answer,
              so it gets a different sentence. Saying "the other versions are
              untouched" when there are none is a promise the dialog cannot
              keep — you press Discard expecting to lose one text and the whole
              piece goes. */}
          <AlertDialogDescription>
            {isLast ? (
              <>
                This is the only version left, so the whole piece goes with it.
                “{idea}” is deleted and cannot be brought back.
              </>
            ) : (
              <>
                The {label} version of “{idea}” is deleted and cannot be brought
                back. The other versions of this piece are untouched.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onDiscard}>
            Discard
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/**
 * The open piece's own header.
 *
 * **Why this is not `Lineage`.** In a pane, `Lineage` says the idea, the source
 * and the age twenty pixels to the right of a rail row that just said all three
 * — and unlike a mail client, the rail is never scrolled away, so both are on
 * screen at once. That duplication was most of why the pane read as redundant
 * rather than cramped.
 *
 * So the source name goes: the tile beside the heading already marks it, and the
 * rail row already spells it. The **age stays**, because it is the one thing
 * here that changes the decision — a piece written four days ago may not be
 * worth sending today — and so do the riff hook and the adaptation, which the
 * rail has no room for and which are what you check before approving somebody
 * else's idea in your own voice.
 *
 * `text-section` rather than `text-display`. The real ideas run past a hundred
 * characters; at 40px the longest one is five lines of heading above a
 * 62-character post, which inverts the hierarchy it is supposed to establish.
 *
 * An `<h2>`, not an `<h1>` — the rail owns the page's h1 ("Drafts"), and this is
 * a section of it. Level and size are separate decisions and this is the case
 * that shows why.
 */
export function PieceHeader({ draft }: { draft: Draft }) {
  return (
    <header className="flex items-start gap-3">
      {/* A channel tile, borrowed from Sources rather than rebuilt: the fallback
          chain is already exactly right — a real brand mark where one exists, a
          hugeicon where it does not, an initial where neither. */}
      <SourceMark
        id={draft.from.sourceId}
        label={draft.from.sourceLabel}
        className="mt-0.5 size-7"
      />
      <div className="flex min-w-0 flex-col gap-1">
        {/* `text-pretty`, not `balance`: these run long enough that balancing
            burns width to even out lines nobody is counting, where `pretty` only
            stops the last word stranding. */}
        <h2 id={`piece-${draft.id}-idea`} className="text-section text-pretty">
          {draft.idea}
        </h2>
        <p className="text-caption text-pretty text-muted-foreground">
          {draft.from.at}
          {/* The angle it was drafted from. Often the same sentence as the
              idea — `riffHook` and `idea` match on five of the seven real
              pieces — so it renders only when it adds something, rather than
              printing the heading again one line below itself in italics. */}
          {draft.from.riffHook && draft.from.riffHook !== draft.idea ? (
            <>
              <span aria-hidden="true"> · </span>
              <span className="italic">“{draft.from.riffHook}”</span>
            </>
          ) : null}
        </p>
        {/* The borrowed half of the chain, and the reason it is a separate line
            rather than another middot clause: "this came out of somebody else's
            post" is a different kind of fact from where and when, and it is the
            one a reader has to be able to check before approving. A pasted post
            has no URL, so the handle stands alone rather than rendering a link
            to nowhere. */}
        {draft.from.adaptedFrom ? (
          <p className="text-caption text-muted-foreground">
            Adapted from{" "}
            {draft.from.adaptedFrom.url ? (
              <a
                href={draft.from.adaptedFrom.url}
                target="_blank"
                rel="noreferrer noopener"
                className="underline underline-offset-4 hover:text-foreground"
              >
                {draft.from.adaptedFrom.handle
                  ? `@${draft.from.adaptedFrom.handle}`
                  : "a post"}
              </a>
            ) : draft.from.adaptedFrom.handle ? (
              `@${draft.from.adaptedFrom.handle}`
            ) : (
              "a post you pasted"
            )}
          </p>
        ) : null}
      </div>
    </header>
  )
}

/**
 * "Identical to the X version" — the check that catches a live production bug.
 *
 * Under the version it describes, not above it: you read the text, then you are
 * told what is wrong with it. Same `text-destructive` the over-limit counter
 * uses, because these are the same class of fact — this will go out wrong.
 *
 * Never a blocker and never a dialog: publishing the same sentence twice is a
 * decision you are allowed to make, it just should not be one you make without
 * noticing. See `duplicates` in lib/drafts.ts for what counts as the same.
 */
export function DuplicateNotice({
  twin,
  label,
}: {
  twin: string
  label: string
}) {
  return (
    <p className="max-w-[60ch] text-caption text-pretty text-destructive">
      Identical to the {twin} version — this one was not adapted for {label}.
    </p>
  )
}

/**
 * This version is the angle's hook, because the drafting call failed.
 *
 * Muted rather than destructive, and that is the judgment in it: nothing is
 * broken and nothing was lost. There is a draft, it is one line, and the line
 * is yours — `text-destructive` would report a fault where the product made a
 * deliberate choice to hand you something usable. `DuplicateNotice` above is
 * red because two channels carrying identical text *is* a fault.
 *
 * The wording differs from the /riffs version of this sentence on purpose.
 * There it reads "The draft is your hook, waiting for you", because the reader
 * is deciding whether to open it; here the reader is looking straight at the
 * text, so the promise is redundant and the instruction is not.
 */
export function HookNotice({ id }: { id: string }) {
  return (
    <p
      id={id}
      className="inline-flex max-w-[60ch] items-start gap-1.5 text-caption text-pretty text-muted-foreground"
    >
      <HugeiconsIcon
        aria-hidden="true"
        icon={Alert01Icon}
        className="mt-px size-3.5 shrink-0"
      />
      Quincy could not write this one — this is your hook. Rewrite it and it is
      yours.
    </p>
  )
}

/**
 * Nothing has arrived yet.
 *
 * Says why it is empty and what produces the first one, rather than reporting
 * an absence. Distinct from `AllClear` on purpose: "you have never had a draft"
 * and "you just approved the last one" are different facts with different next
 * steps, and one message covering both would be wrong half the time.
 */
export function NoDrafts() {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl bg-card p-6 shadow-xs">
      <div className="flex flex-col gap-1">
        <h2 className="text-card-title">Nothing written yet</h2>
        <p className="max-w-[60ch] text-caption text-pretty text-muted-foreground">
          Drafts arrive from Riffs. Pick an angle worth writing and Quincy
          writes it for each channel you publish to — one piece, in a version
          native to each.
        </p>
      </div>
      {/* A real link, because /riffs is a real page. */}
      <Button
        nativeButton={false}
        variant="outline"
        render={<Link href="/riffs" />}
      >
        Go to Riffs
      </Button>
    </div>
  )
}

/**
 * You cleared the queue.
 *
 * The other empty state, and the one a queue reaches far more often. On the rail
 * rather than in the pane, because the pane still has the finished pieces in it:
 * this replaces the waiting count, which would otherwise read "0 drafts · 0
 * versions waiting on you" — a true sentence that reads like a bug.
 *
 * **It used to promise scheduling and could not keep it.** The sentence was
 * "Approved versions are queued in Lineup, which decides when each one goes out",
 * which is the claim plans/010 removed from the done row and the same way wrong:
 * approving places a version only when a free slot exists for its channel.
 * Rendered against a cleared queue it sat directly above a pane saying "Approved
 * before that slot existed, so it has no time yet" — twice — so the one surface
 * that had your attention at the end of the job was the one contradicting the
 * rest of the page.
 *
 * So it counts instead. Nothing without a time is the only case that can honestly
 * point at Lineup as somewhere the work already is; anything else names how much
 * is stranded, because that is the thing that quietly rots. See
 * `countWithoutTime` in lib/drafts.ts.
 */
export function AllClear({
  withoutTime,
  className,
}: {
  /** Approved versions with no time yet. */
  withoutTime: number
  className?: string
}) {
  return (
    <p
      className={cn(
        "text-caption text-pretty text-muted-foreground",
        className
      )}
    >
      {withoutTime === 0 ? (
        "Nothing is waiting on you. Every approved version has a time on Lineup."
      ) : (
        <>
          Nothing is waiting on you, but{" "}
          {/* Tabular for the same reason the waiting count is: this number ticks
              down as you give versions a time, and proportional digits jitter. */}
          <span className="font-mono tabular-nums">{withoutTime}</span>{" "}
          {withoutTime === 1 ? "version has" : "versions have"} no time yet.
        </>
      )}
    </p>
  )
}

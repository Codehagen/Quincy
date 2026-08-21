"use client"

import * as React from "react"
import Link from "next/link"
import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SourceMark } from "@/components/sources/source-mark"

import type { Day, Entry, MoveTarget, Slot } from "./data"

/**
 * Shared by all three variants, so the comparison stays about layout.
 *
 * The rules that shaped these pieces:
 *
 * - **Time is the anchor, so it is the leftmost thing and it is tabular.**
 *   These stack in a column and read as one; proportional figures make a
 *   column of times ragged, which is the one thing a schedule cannot afford.
 * - **The opening line, not the post.** You come here to judge timing and
 *   order, not to re-read writing you already approved on Drafts. Showing the
 *   whole post would make the page a second Drafts with worse editing.
 * - **No primary action on a row.** Every row would carry one, and five filled
 *   buttons down a column means no next step — the same call riff-parts.tsx
 *   makes about angle cards. The decision here is *when*, and that lives on the
 *   time control.
 * - **Published recedes and stays.** It is history, and a queue whose items
 *   vanish once they happen gives you no way to see what actually went out.
 */

/**
 * The time, and the menu for changing it.
 *
 * **The time is the button.** There was a separate `Move` control on every row,
 * which put two buttons and no primary on each one. The time is the thing being
 * changed and it is already on screen, so it carries the affordance instead —
 * one control fewer per row, and the target sits on the value rather than
 * beside it. Hierarchy is subtraction.
 *
 * The cost is discoverability: a bare time does not look pressable. So it is a
 * real `<button>` with a chevron, a hover fill and the same focus ring
 * everything else here uses. It is never a bare `<span>` with a click handler.
 *
 * The menu is not a date picker, deliberately. Moving a post in this product
 * means one of three things — into a standing slot, onto the next day, or to
 * some arbitrary time — and a calendar treats all three as the third. Empty
 * slots on this post's own channel come first, because that is the case the
 * page is already showing you two rows below.
 */
function TimeControl({
  entry,
  openSlots,
  nextDay,
  takeFocus,
  onMove,
}: {
  entry: Entry
  openSlots: Slot[]
  nextDay?: Day
  takeFocus?: boolean
  onMove: (target: MoveTarget) => void
}) {
  const ref = React.useRef<HTMLButtonElement>(null)

  React.useEffect(() => {
    if (takeFocus) ref.current?.focus()
  }, [takeFocus])

  return (
    <DropdownMenu>
      {/* Rendered through the project's `Button`, not a hand-rolled one.
          The first version was a bare `<button>` with its own classes, and it
          silently opted out of two things every other control here gets: the
          `scale: 0.96` press state and the 44×44 hit area on coarse pointers.
          Both are keyed on `[data-slot="button"]` in globals.css, which a
          hand-rolled element never carries — it rendered 19px tall, on the
          primary control of the surface.

          Ghost and xs so it still reads as the time rather than as a button;
          the chevron and the hover fill carry the affordance. */}
      <DropdownMenuTrigger
        // `data-slot` set here rather than left to the primitive. The wrapper
        // in components/ui/dropdown-menu.tsx stamps
        // `data-slot="dropdown-menu-trigger"` and then spreads props over it,
        // so without this the element carries the trigger's slot and matches
        // none of the `[data-slot="button"]` rules in globals.css — including
        // the one that grows every control to a 44px hit area on coarse
        // pointers. Rendering through `Button` gets the look; this gets the
        // touch target, which is the half that actually matters on a phone.
        data-slot="button"
        render={
          <Button
            ref={ref}
            type="button"
            variant="ghost"
            size="xs"
            aria-label={`${entry.time} — change when the ${entry.channelLabel} post "${entry.idea}" goes out`}
            className="-mx-1.5 font-mono text-caption tabular-nums"
          />
        }
      >
        {entry.time}
        <HugeiconsIcon
          aria-hidden="true"
          icon={ArrowDown01Icon}
          className="size-3 opacity-60"
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start">
        {openSlots.length > 0 ? (
          <>
            {/* Wrapped in a Group, not just labelled. `DropdownMenuLabel`
                renders Base UI's `GroupLabel`, which throws outside a
                `Menu.Group` — a label without its group is a crash, not a
                styling detail.

                Named by what they are, not by "suggestions". These are
                commitments you already made that are standing empty. */}
            <DropdownMenuGroup>
              <DropdownMenuLabel>
                Empty {entry.channelLabel} slots
              </DropdownMenuLabel>
              {openSlots.map((slot) => (
                <DropdownMenuItem
                  key={slot.id}
                  onClick={() => onMove({ kind: "slot", slotId: slot.id })}
                >
                  {slot.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        ) : null}

        {nextDay ? (
          <DropdownMenuItem
            onClick={() =>
              onMove({ kind: "day", dayId: nextDay.id, time: entry.time })
            }
          >
            {nextDay.label}, same time
          </DropdownMenuItem>
        ) : null}

        {/* Disabled rather than a handler that silently does nothing — the same
            call /channels and /sources make about controls whose machinery does
            not exist yet. A picker is a real piece of work and pretending
            otherwise is how a button that looks live ships. */}
        <DropdownMenuItem disabled>Pick a time… (not built)</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** One scheduled post. */
export function EntryRow({
  entry,
  compact = false,
  openSlots = [],
  nextDay,
  takeFocus = false,
  onMove,
  onUnschedule,
}: {
  entry: Entry
  /** Set in the column layouts, where the row is already inside a narrow box. */
  compact?: boolean
  /** Empty slots this post could move into. Same channel only. */
  openSlots?: Slot[]
  /** The day after this one, for the "same time tomorrow" case. */
  nextDay?: Day
  /**
   * Set on the row that just moved. Its menu trigger was unmounted by the move,
   * so focus has to be handed to the new one or the browser drops it to
   * `<body>` and a keyboard user is returned to the top of the document.
   */
  takeFocus?: boolean
  /**
   * Optional so the losing variants can still mount this without wiring state
   * they are not exploring.
   */
  onMove?: (target: MoveTarget) => void
  onUnschedule?: () => void
}) {
  const published = entry.state === "published"

  return (
    <li
      // Named so a move is a slide between two days rather than the row
      // vanishing from one list and appearing in another. The infrastructure is
      // already in globals.css from Drafts; naming the row is all it costs.
      style={{ viewTransitionName: `post-${entry.id}` }}
      className={cn(
        "flex flex-col gap-2 rounded-lg p-3",
        published ? "bg-muted/40" : "bg-card shadow-xs"
      )}
    >
      <div className="flex items-center gap-2">
        {published || !onMove ? (
          // A sent post has no time left to change.
          <span
            className={cn(
              "font-mono text-caption tabular-nums",
              published ? "text-muted-foreground" : "text-foreground"
            )}
          >
            {entry.time}
          </span>
        ) : (
          <TimeControl
            entry={entry}
            openSlots={openSlots}
            nextDay={nextDay}
            takeFocus={takeFocus}
            onMove={onMove}
          />
        )}
        <SourceMark
          id={entry.channel}
          label={entry.channelLabel}
          className="size-5"
        />
        <span className="text-caption text-muted-foreground">
          {entry.channelLabel}
        </span>

        {published ? (
          <span className="ml-auto inline-flex items-center gap-1.5 text-caption text-muted-foreground">
            <HugeiconsIcon
              aria-hidden="true"
              icon={Tick02Icon}
              className="size-3.5"
            />
            Sent
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-0.5">
        {/* h3 under the day's h2. Each day is a list of distinct pieces, and as
            paragraphs the page ran h1 → h2 → nothing, so heading navigation
            could reach a day and never a post inside it. Same bar
            components/drafts/ already meets. Nothing moves visually. */}
        <h3
          className={cn(
            "text-card-title text-balance",
            published && "text-muted-foreground"
          )}
        >
          {entry.idea}
        </h3>
        {/* One line. The measure cap matters even here: this is the only prose
            on the page and it is still prose. */}
        <p className="max-w-[60ch] truncate text-caption text-muted-foreground">
          {entry.opening}
        </p>
      </div>

      {published ? null : (
        <div className={cn("flex items-center gap-2", compact && "flex-wrap")}>
          {/* The only button left on the row. `Move` used to sit here and is
              gone — the time above carries that job now, which leaves this row
              with one control and no competition for it.

              Labelled with what it acts on. A column of five rows means five
              buttons reading "Unschedule", which tells a screen reader user the
              verb and never the object. */}
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-muted-foreground"
            aria-label={`Unschedule the ${entry.channelLabel} post "${entry.idea}"`}
            onClick={onUnschedule}
          >
            Unschedule
          </Button>
        </div>
      )}
    </li>
  )
}

/**
 * What Unschedule leaves behind.
 *
 * **A receipt, not a confirmation.** Nothing was destroyed — the post is back
 * on Drafts, still approved, waiting for a new time — so asking first would tax
 * the common path and blunt the one dialog on this product that matters, the
 * Discard on a draft version. What the action does need is to say where the
 * post went, because a row that simply vanishes reads as deletion.
 *
 * The mirror of the done pane on Drafts, which says where a finished piece
 * went and keeps Reopen next to it. Same shape in the opposite direction, so
 * the product has one grammar for "this moved to another surface" rather than
 * a different treatment per page.
 *
 * `role="status"` so the move is announced rather than only seen. Not a timed
 * toast: a deadline on noticing your own mistake is not a kindness.
 */
export function UnscheduledRow({
  entry,
  takeFocus = false,
  onUndo,
}: {
  entry: Entry
  takeFocus?: boolean
  onUndo?: () => void
}) {
  const ref = React.useRef<HTMLButtonElement>(null)

  React.useEffect(() => {
    if (takeFocus) ref.current?.focus()
  }, [takeFocus])

  return (
    <li
      role="status"
      style={{ viewTransitionName: `post-${entry.id}` }}
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-muted/40 p-3"
    >
      <SourceMark
        id={entry.channel}
        label={entry.channelLabel}
        className="size-5"
      />
      <p className="text-caption">
        <span className="font-medium">{entry.idea}</span>
      </p>
      <p className="text-caption text-muted-foreground">
        Unscheduled — back in Drafts, still approved
      </p>

      <div className="ml-auto flex items-center gap-1">
        <Button
          ref={ref}
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          aria-label={`Put the ${entry.channelLabel} post "${entry.idea}" back at ${entry.time}`}
          onClick={onUndo}
        >
          Undo
        </Button>
        <Button
          nativeButton={false}
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          render={<Link href="/drafts" />}
        >
          Open Drafts
          <HugeiconsIcon
            aria-hidden="true"
            data-icon="inline-end"
            icon={ArrowRight01Icon}
          />
        </Button>
      </div>
    </li>
  )
}

/** A day's name, date and load. */
export function DayHeading({ day }: { day: Day }) {
  const queued = day.entries.filter((e) => e.state === "queued").length

  return (
    <div className="flex items-baseline gap-2 px-1">
      <h2 className="text-card-title">{day.label}</h2>
      <p className="text-caption text-muted-foreground">{day.date}</p>
      {/* A count, or nothing. It used to fall back to the word "sent", which
          put two different kinds of value in one slot — and a day whose posts
          have all gone out needs no summary, because every row already says
          Sent. Tabular so the number does not shift the row as it ticks. */}
      {queued > 0 ? (
        <p className="ml-auto font-mono text-caption text-muted-foreground tabular-nums">
          {queued} queued
        </p>
      ) : null}
    </div>
  )
}

/**
 * A day with nothing in it and nothing promised for it.
 *
 * One line, not a card and not a full-height cell. Most days in a publishing
 * week are empty, and a layout that gives each of them the weight of a day with
 * three posts is a layout that reports absence instead of showing a week.
 *
 * Distinct from `EmptySlotRow` on purpose. This is a day you never committed to
 * — a Saturday. The other is a commitment you are about to miss, and those are
 * different sentences with different next steps.
 */
export function EmptyDay() {
  return (
    <p className="px-1 py-1 text-caption text-muted-foreground">
      Nothing scheduled ·{" "}
      {/* A real link. This was a styled `<span>` carrying the exact underline
          treatment the genuine links on /sources use — it looked like a link,
          was not focusable, and did nothing when clicked. An underline is a
          hyperlink affordance; borrowing it for emphasis teaches people to
          click text that goes nowhere. /drafts is a real page, so this is a
          real anchor. */}
      <Link
        href="/drafts"
        className="text-foreground underline decoration-muted-foreground/40 underline-offset-4 hover:decoration-current"
      >
        pick from Drafts
      </Link>
    </p>
  )
}

/**
 * A standing slot with nothing in it.
 *
 * The whole reason the Slots model survives into Agenda. "Nothing goes out
 * Wednesday" is a fact you can do nothing with; "you have a Wednesday 12:00
 * LinkedIn slot and it is empty" is the same week with an obvious next step.
 *
 * Dashed and unfilled, because the treatment should read as an outline waiting
 * for content rather than as a card that happens to be short. It sits in time
 * order among the day's posts — a gap at noon between 08:00 and 16:45 is a
 * different problem from a gap after both.
 *
 * Lighter than an entry throughout: no shadow, no card fill, the idea line
 * absent entirely. It is an absence, and it should not out-weigh the things
 * that are actually going out.
 */
export function EmptySlotRow({ slot }: { slot: Slot }) {
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-dashed border-border p-3">
      <span className="font-mono text-caption text-muted-foreground tabular-nums">
        {slot.time}
      </span>
      <SourceMark
        id={slot.channel}
        label={slot.channelLabel}
        className="size-5"
      />
      <span className="text-caption text-muted-foreground">
        {slot.channelLabel}
      </span>
      <span className="text-caption text-muted-foreground">
        <span aria-hidden="true">· </span>slot is empty
      </span>

      {/* Ghost, and the only action on the row. An empty slot has exactly one
          thing you would want to do with it. */}
      <Button
        variant="ghost"
        size="sm"
        className="ml-auto"
        aria-label={`Fill the ${slot.time} ${slot.channelLabel} slot from Drafts`}
      >
        Fill from Drafts
      </Button>
    </li>
  )
}

/**
 * The week's shape, in one strip.
 *
 * This is what a calendar was going to be for, and the only thing it was
 * actually better at: seeing that Tuesday has three and Thursday has one
 * without reading anything. Seven bars costs a header row; a month grid costs
 * the whole page.
 *
 * Deliberately not interactive. It answers a question, it is not a control —
 * making it clickable would put a second navigation model on a page whose list
 * is already the navigation.
 */
export function CadenceStrip({ days }: { days: Day[] }) {
  const max = Math.max(1, ...days.map((d) => d.entries.length))

  return (
    // `select-none` alongside `aria-hidden`: the first hides it from screen
    // readers, the second keeps a drag across the page from picking up seven
    // weekday stubs that are pure decoration.
    <div className="flex items-end gap-1 select-none" aria-hidden="true">
      {days.map((day) => {
        const n = day.entries.length
        return (
          <div key={day.id} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex h-8 w-full items-end">
              <div
                className={cn(
                  "w-full rounded-xs",
                  n === 0 ? "bg-muted" : "bg-primary/70"
                )}
                style={{ height: n === 0 ? 2 : `${(n / max) * 100}%` }}
              />
            </div>
            <span className="text-caption text-muted-foreground">
              {day.short}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** One recurring slot, filled or not. */
export function SlotRow({ slot, entry }: { slot: Slot; entry?: Entry }) {
  return (
    <li
      className={cn(
        "flex flex-col gap-2 rounded-lg p-3",
        entry ? "bg-card shadow-xs" : "border border-dashed border-border"
      )}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-caption tabular-nums">
          {slot.label}
        </span>
        <SourceMark
          id={slot.channel}
          label={slot.channelLabel}
          className="size-5"
        />
        <span className="text-caption text-muted-foreground">
          {slot.channelLabel}
        </span>
      </div>

      {entry ? (
        <div className="flex flex-col gap-0.5">
          <h3 className="text-card-title">{entry.idea}</h3>
          <p className="max-w-[60ch] truncate text-caption text-muted-foreground">
            {entry.opening}
          </p>
        </div>
      ) : (
        /* The sentence a list of scheduled posts cannot say. Not "nothing goes
           out Wednesday" but "you have a Wednesday slot and it is going to
           waste", which has an obvious next step. */
        <div className="flex items-center gap-2">
          <p className="text-caption text-muted-foreground">
            Empty — Week Plan fills this on Sunday
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            aria-label={`Fill the ${slot.label} ${slot.channelLabel} slot now`}
          >
            Fill it now
          </Button>
        </div>
      )}
    </li>
  )
}

/** Empty state: says why it is empty and what produces the first one. */
export function NoLineup() {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl bg-card p-6 shadow-xs">
      <div className="flex flex-col gap-1">
        <h2 className="text-card-title">Nothing scheduled yet</h2>
        <p className="max-w-[60ch] text-caption text-pretty text-muted-foreground">
          Approve a version on Drafts and it lands here waiting for a time.
          Quincy fills next week&rsquo;s slots on Sunday evening, so Monday is
          never a blank week.
        </p>
      </div>
      <Button variant="outline">Go to Drafts</Button>
    </div>
  )
}

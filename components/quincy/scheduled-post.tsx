"use client"

import * as React from "react"

import {
  Menu,
  MenuItem,
  MenuPanel,
  MenuSeparator,
  MenuTrigger,
  Mono,
  Text,
  TextLink,
  type MenuPanelProps,
} from "@/components/kit"
import { Friend } from "@/components/mascot"
import { goingOutLine, goingOutOfEntry } from "@/lib/going-out"
import type { Day, Entry, Slot } from "@/lib/lineup"

/**
 * One approved version with a time, in the week (plans/030 #4; lab 26, 07,
 * 08). Sits in a kit `List` under the day's `ListHeading`.
 *
 * Not a ListRow: a ListRow is a button that opens its thing, and a row never
 * holds a Button (docs/design/lists.md). Here the time IS the
 * control — it opens a Menu of where the post can move — so the row is a
 * static line with one control in it, on the ListRow's measurements.
 *
 * Drag to reorder (lab 26) is not here: Base UI has no reorder behaviour, and
 * plan 029 defers it to when the Lineup page is built.
 */

/** Where a post can move. The same shape as `MoveTarget` in lineup-parts.tsx. */
export type ScheduledPostMove =
  | { kind: "slot"; slotId: string }
  | { kind: "day"; dayId: string; time: string }

export type ScheduledPostProps = {
  /** The scheduled_post row, from `getLineup` (lib/lineup.ts `Entry`). */
  entry: Entry
  /**
   * Open slots this post could move into. Same channel only, and only slots
   * still ahead: the caller filters out any whose time has passed today,
   * because a post moved there goes out at once inside the sweep's catch-up
   * window (lib/publish-run.ts). The server refuses it too (`movePost`).
   */
  openSlots?: Slot[]
  /** The day after this one, for "same time tomorrow". */
  nextDay?: Pick<Day, "id" | "label">
  onMove?: (to: ScheduledPostMove) => void
  /**
   * Back to Drafts: the post leaves the week and the writing stays approved.
   * Offered on a queued post, and on a failed one, where it is the only way
   * on (the sweep never retries a failed post, so moving it would not help).
   * May return a promise; the caller owns what a rejection says.
   *
   * A plain menu item, not a hold, here and in the Lineup's PostDetail: it
   * deletes the `scheduled_post` row only, and the version stays approved on
   * Drafts (`unschedulePost`), so nothing written is lost.
   */
  onUnschedule?: () => void | Promise<void>
  /**
   * A muted line under the row, for what the state alone does not say.
   * Defaults to the error on a `sending` post: "it has most likely gone
   * out, check the account before anyone retries" is the sentence that
   * matters there. Pass `null` to say nothing.
   */
  note?: React.ReactNode
  /**
   * Where focus goes after a command that removes this row (Move, Back to
   * Drafts): the UndoBar, or the row in its new day. See MenuPanel.
   */
  finalFocus?: MenuPanelProps["finalFocus"]
  /** Set on the row that just moved, so its new trigger takes focus. */
  takeFocus?: boolean
}

// ListRow's own measurements (components/kit/list-row.tsx), without the press.
const ROW = "flex min-h-11 w-full min-w-0 items-center gap-3 rounded-kit-control px-3 py-2"

export function ScheduledPost({
  entry,
  openSlots = [],
  nextDay,
  onMove,
  onUnschedule,
  finalFocus,
  takeFocus = false,
  note,
}: ScheduledPostProps) {
  const titleId = React.useId()
  const trigger = React.useRef<HTMLButtonElement>(null)
  const line = goingOutLine(goingOutOfEntry(entry), entry.channelLabel)
  const queued = entry.state === "queued"
  const canMove = queued && onMove != null && (openSlots.length > 0 || nextDay != null)
  const canUnschedule = (queued || entry.state === "failed") && onUnschedule != null
  const movable = canMove || canUnschedule
  const shownNote =
    note !== undefined ? note : entry.state === "sending" && entry.error ? entry.error : null

  React.useEffect(() => {
    if (takeFocus) trigger.current?.focus({ preventScroll: true })
  }, [takeFocus])

  return (
    <div data-slot="quincy-scheduled-post" data-state={entry.state} className={ROW}>
      <span className="shrink-0">
        {movable ? (
          <Menu>
            <MenuTrigger ref={trigger} aria-describedby={titleId}>
              <Mono tone="ink">{entry.time}</Mono>
            </MenuTrigger>
            <MenuPanel finalFocus={finalFocus}>
              {canMove
                ? openSlots.map((s) => (
                    <MenuItem key={s.id} onClick={() => onMove?.({ kind: "slot", slotId: s.id })}>
                      Move to {s.label}
                    </MenuItem>
                  ))
                : null}
              {canMove && nextDay ? (
                <MenuItem onClick={() => onMove?.({ kind: "day", dayId: nextDay.id, time: entry.time })}>
                  Same time {nextDay.label.toLowerCase() === "tomorrow" ? "tomorrow" : `on ${nextDay.label}`}
                </MenuItem>
              ) : null}
              {canUnschedule ? (
                <>
                  {canMove ? <MenuSeparator /> : null}
                  <MenuItem onClick={() => void onUnschedule?.()}>Back to Drafts</MenuItem>
                </>
              ) : null}
            </MenuPanel>
          </Menu>
        ) : (
          <Mono tone={queued ? "ink" : "muted"}>{entry.time}</Mono>
        )}
      </span>

      <span className="flex min-w-0 flex-1 flex-col">
        <Text as="span" weight="strong" id={titleId}>
          <span className="line-clamp-2 text-pretty">{entry.opening}</span>
        </Text>
        <Text as="span" variant="small" tone="muted">
          {entry.state === "failed" ? line.text : `${entry.channelLabel} · from ${entry.sourceLabel}`}
        </Text>
        {shownNote != null ? (
          <Text as="span" variant="small" tone="muted">
            {shownNote}
          </Text>
        ) : null}
      </span>

      <span className="shrink-0">
        <EntryState entry={entry} />
      </span>
    </div>
  )
}

function EntryState({ entry }: { entry: Entry }) {
  switch (entry.state) {
    case "queued":
      return null
    case "sending":
      return (
        <Text as="span" variant="small" role="status">
          <span className="inline-flex items-center gap-2">
            <Friend size={20} state="reading" className="shrink-0" />
            <span className="min-w-0">
              Sending
            </span>
          </span>
        </Text>
      )
    case "published":
      return (
        <Text as="span" variant="small" tone="muted">
          Posted
          {entry.url ? (
            <>
              {" · "}
              <TextLink href={entry.url} target="_blank" rel="noreferrer">
                View
              </TextLink>
            </>
          ) : null}
        </Text>
      )
    case "failed":
      // Ink, not red: a refusal is not destruction (docs/design/states.md).
      return (
        <Text as="span" variant="small" role="status">
          Not sent
        </Text>
      )
  }
}

import { and, asc, eq, gte, inArray, lt } from "drizzle-orm"

import { db } from "./db"
import { scheduledPost, slot } from "./schema-app"
import { isBeyondVisibleWeek, occurrencesOf } from "./slots"
// Re-exported so lib/scheduling.test.ts and the Add-a-slot dialog reach them
// through one name. The maths lives in lib/slots.ts because the dialog needs it
// client-side and this file imports the database driver.
export { isBeyondVisibleWeek, occurrencesOf } from "./slots"
import { resolveTimeZone } from "./timezone"

/**
 * Where approved writing goes, and when.
 *
 * The link between Drafts and Lineup. Approving used to set a state and stop,
 * while /drafts said "Approved and queued in Lineup" — so the product promised
 * this file for months before it existed. See plans/010.
 *
 * It lives here rather than in app/(app)/drafts/actions.ts because the rhythms
 * in lib/rhythms.ts will want the same placement — Week Plan's whole job is
 * filling next week's slots — and a copy of this reasoning inside a server
 * action is a copy that drifts.
 */

/**
 * How far ahead a slot is worth waiting for.
 *
 * A version approved on Monday for a channel whose only slot is Sunday should
 * take that Sunday. One approved for a channel whose slot was deleted last
 * month should not silently reappear in three weeks. Two weeks is the span the
 * page shows plus the one after it — far enough that a weekly rhythm always
 * finds its slot, close enough that nothing lands beyond the horizon the person
 * was looking at when they approved it.
 */
const HORIZON_DAYS = 14

export type Placement =
  /**
   * It has a time. `at` is the instant, `slotId` the commitment it fills.
   *
   * `beyondThisWeek` is what stops the receipt overclaiming. /lineup draws
   * seven days; anything further out is scheduled and invisible, and the user
   * has to be told which — see `isBeyondVisibleWeek`.
   */
  | { ok: true; at: Date; slotId: string; beyondThisWeek: boolean }
  /**
   * No slot for this channel, so no time — and therefore no row. The schema
   * says as much at lib/schema-app.ts: approved with no `scheduled_post` is
   * exactly "waiting on Drafts for a time". The caller must not invent one.
   */
  | { ok: false; reason: "no-slot" }
  /**
   * Every slot for this channel inside the horizon is already taken. Adding a
   * slot or unscheduling something is the way out, and both are the user's
   * call.
   */
  | { ok: false; reason: "slots-full" }

/**
 * What an approval did about a time, as the Drafts receipt needs to say it.
 *
 * Lives here rather than beside `approveVersion` because a `"use server"` file
 * exports actions and nothing else, and the client has to name this shape to
 * render it.
 */
export type ApprovalPlacement =
  | { scheduled: true; at: Date; beyondThisWeek: boolean }
  | { scheduled: false; reason: "no-slot" | "slots-full" }

/**
 * The next free slot for this channel, or an honest reason there is none.
 *
 * **Free, not next.** A slot already holding a post is not a candidate — two
 * posts at Monday 08:00 is not a rhythm, it is the thing a slot exists to
 * prevent — so the search walks forward through occurrences until it finds one
 * nothing points at.
 *
 * The check is a read, so two approvals racing could both pick the same
 * instant. `scheduled_post` has no unique key on `(slot_id)` to stop that, and
 * adding one would forbid the legitimate case of a slot deleted and its post
 * left behind. The consequence is two posts at the same minute, which is
 * visible on /lineup and fixable by dragging one — as opposed to the
 * alternative, which is an approval that fails for a reason the user cannot
 * see. Worth revisiting when approvals stop being one-at-a-time human presses.
 */
export async function nextFreeSlot({
  userId,
  channel,
  timezone,
  now = new Date(),
}: {
  userId: string
  channel: string
  timezone?: string | null
  now?: Date
}): Promise<Placement> {
  const zone = resolveTimeZone(timezone)

  const standing = await db
    .select()
    .from(slot)
    .where(and(eq(slot.userId, userId), eq(slot.channel, channel)))
    .orderBy(asc(slot.weekday), asc(slot.timeOfDay))

  if (standing.length === 0) {
    return { ok: false, reason: "no-slot" }
  }

  const weeks = Math.ceil(HORIZON_DAYS / 7)
  const horizon = new Date(now.getTime() + HORIZON_DAYS * 24 * 60 * 60 * 1000)

  const candidates = standing
    .flatMap((s) =>
      occurrencesOf(s.weekday, s.timeOfDay, zone, now, weeks).map((at) => ({
        at,
        slotId: s.id,
      }))
    )
    /**
     * A window with both ends, and the lower one is the important half.
     *
     * `occurrencesOf` walks forward from today *inclusive*, so on the day your
     * slot falls it offers this morning's 08:00 whether or not it is still
     * morning. `nextOccurrence` in app/(app)/lineup/actions.ts keeps that
     * instant deliberately — there, you dragged a post onto a slot that has
     * passed, and seeing it sit there reads as "you missed it".
     *
     * Here nobody chose the instant, and nobody is shown it before it is
     * committed. A time in the past reaches lib/publish-run.ts, which either
     * publishes it within five minutes — the receipt said 08:00 and it goes out
     * at 09:34, in your name — or, past the catch-up window, marks it failed
     * for being late. Approving in the afternoon is not a mistake and must not
     * produce either one.
     */
    .filter(
      (c) => c.at.getTime() > now.getTime() && c.at.getTime() < horizon.getTime()
    )
    .sort((a, b) => a.at.getTime() - b.at.getTime())

  if (candidates.length === 0) {
    return { ok: false, reason: "slots-full" }
  }

  /**
   * One query for every candidate rather than one per candidate.
   *
   * A slot is occupied if some post points at it *at that instant* — not merely
   * at the slot, which would make a slot single-use forever rather than weekly.
   * So the comparison is on `scheduledFor`, and `slotId` narrows it.
   */
  const taken = await db
    .select({
      slotId: scheduledPost.slotId,
      scheduledFor: scheduledPost.scheduledFor,
    })
    .from(scheduledPost)
    .where(
      and(
        eq(scheduledPost.userId, userId),
        inArray(
          scheduledPost.slotId,
          standing.map((s) => s.id)
        ),
        gte(scheduledPost.scheduledFor, candidates[0].at),
        lt(scheduledPost.scheduledFor, horizon)
      )
    )

  const occupied = new Set(
    taken.map((t) => `${t.slotId}@${t.scheduledFor.getTime()}`)
  )

  const free = candidates.find(
    (c) => !occupied.has(`${c.slotId}@${c.at.getTime()}`)
  )

  if (!free) {
    return { ok: false, reason: "slots-full" }
  }

  return {
    ok: true,
    at: free.at,
    slotId: free.slotId,
    beyondThisWeek: isBeyondVisibleWeek(free.at, now, zone),
  }
}

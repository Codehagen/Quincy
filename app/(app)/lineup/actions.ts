"use server"

import { revalidatePath } from "next/cache"
import { and, eq, inArray } from "drizzle-orm"

import { db } from "@/lib/db"
import { ensureStarterSlots } from "@/lib/scheduling"
import { getSession } from "@/lib/session"
import {
  CONNECTABLE_CHANNELS,
  scheduledPost,
  slot,
  type ConnectableChannel,
} from "@/lib/schema-app"
import {
  addCalendarDays,
  calendarDayIn,
  instantOf,
  isoWeekdayOf,
  parseDayKey,
  parseTimeOfDay,
  resolveTimeZone,
} from "@/lib/timezone"

/**
 * Mutations for /lineup.
 *
 * Every one of them re-reads the session and scopes its `where` to that user's
 * id. The row id arrives from the client and is therefore untrusted — a post id
 * belonging to somebody else must not be movable by guessing it, and the only
 * thing that reliably prevents that is the ownership check living in the same
 * statement as the write rather than in a caller that could forget.
 */

async function requireUser() {
  const session = await getSession()
  if (!session) throw new Error("Not signed in")
  return session.user
}

/**
 * A move this person asked for that cannot happen, in words they can act on.
 *
 * Returned rather than thrown: Next replaces a thrown server-action message
 * with a generic one in production, so "that time has passed" would reach the
 * screen as "An error occurred". Anything unexpected still throws.
 */
class Refusal extends Error {}

export type MoveResult = { ok: true } | { ok: false; message: string }

async function refusalsAsResults(run: () => Promise<void>): Promise<MoveResult> {
  try {
    await run()
    return { ok: true }
  } catch (error) {
    if (error instanceof Refusal) return { ok: false, message: error.message }
    throw error
  }
}

/** Where a move can land. Mirrors `MoveTarget` in lib/lineup-week.ts. */
type MoveTarget =
  | { kind: "slot"; slotId: string }
  | { kind: "day"; dayId: string; time: string }

/**
 * How far ahead of now a moved post has to land.
 *
 * lib/publish-run.ts sends anything queued whose time passed within the last
 * two hours (`CATCH_UP_MS`). So a move to 08:00 made at 08:30 is not "too
 * late" — it is "now": the next sweep picks it up and publishes it within
 * minutes. Nobody choosing a time on a schedule means that. The margin covers
 * the round trip and a sweep landing in the same minute.
 */
const MIN_LEAD_MS = 60 * 1000

/**
 * The most moves one reorder may carry. A week of posts is a handful; this is
 * a bound on what a forged request can make one statement batch do, not a
 * product limit anyone should meet.
 */
const MAX_MOVES = 50

/**
 * Turn a target into an instant and a slot, for this user, and refuse a time
 * that has passed.
 *
 * Landing in a slot records it; landing on a time clears `slotId`, because a
 * one-off is exactly a post with a time and no standing commitment behind it.
 * The slot it *leaves* needs no update — a slot is filled by whichever post
 * points at it, so pointing elsewhere frees it by definition.
 */
async function resolveTarget(
  userId: string,
  zone: string,
  target: MoveTarget,
  now: Date
): Promise<{ scheduledFor: Date; slotId: string | null }> {
  let scheduledFor: Date
  let slotId: string | null

  if (target?.kind === "slot") {
    const [target_] = await db
      .select()
      .from(slot)
      .where(and(eq(slot.id, target.slotId), eq(slot.userId, userId)))
      .limit(1)

    if (!target_) throw new Refusal("That slot is gone. Nothing moved.")

    // The slot says Monday 08:00; this week's Monday is what that means now.
    scheduledFor = nextOccurrence(target_.weekday, target_.timeOfDay, zone, now)
    slotId = target_.id
  } else if (target?.kind === "day") {
    // Both halves arrive from the client, so both are parsed rather than
    // trusted. `new Date(y, mo - 1, d, h, m)` accepted "2026-02-31" and rolled
    // it into March without saying so, on top of reading the server's zone.
    const date = parseDayKey(target.dayId)
    const time = parseTimeOfDay(target.time)
    if (!date || !time) throw new Refusal("That is not a day and a time.")

    scheduledFor = instantOf({ ...date, ...time }, zone)
    slotId = null
  } else {
    throw new Refusal("That is not a place a post can move to.")
  }

  if (scheduledFor.getTime() <= now.getTime() + MIN_LEAD_MS) {
    throw new Refusal(
      "That time has already passed. Pick a later one: a post moved there would go out straight away."
    )
  }

  return { scheduledFor, slotId }
}

/**
 * Move a post to a standing slot, or to a bare day and time.
 *
 * Only a `queued` post moves: one the sweep has claimed (`sending`) or settled
 * is a record, and the state check lives in the same statement as the write.
 * A time at or before now is refused — see `MIN_LEAD_MS`.
 */
export async function movePost(
  postId: string,
  target: MoveTarget
): Promise<MoveResult> {
  const user = await requireUser()
  return refusalsAsResults(async () => {
    // The zone the day id and the time in `target` were chosen in. They came off
    // a screen this person was looking at, so they are that person's wall clock
    // and nothing else — turning them into an instant against the server's zone
    // is what put an 08:00 slot out at 10:00.
    const zone = resolveTimeZone(user.timezone)

    const [existing] = await db
      .select({ id: scheduledPost.id })
      .from(scheduledPost)
      .where(
        and(
          eq(scheduledPost.id, postId),
          eq(scheduledPost.userId, user.id),
          eq(scheduledPost.state, "queued")
        )
      )
      .limit(1)

    if (!existing) {
      throw new Refusal(
        "That post has changed since the page loaded. Nothing moved."
      )
    }

    const { scheduledFor, slotId } = await resolveTarget(
      user.id,
      zone,
      target,
      new Date()
    )

    await db
      .update(scheduledPost)
      .set({ scheduledFor, slotId })
      .where(
        and(
          eq(scheduledPost.id, postId),
          eq(scheduledPost.userId, user.id),
          eq(scheduledPost.state, "queued")
        )
      )

    revalidatePath("/lineup")
  })
}

/**
 * A drop in the running order: several posts swap days and times at once.
 *
 * **All of it or none of it.** This used to be one `movePost` per changed
 * position, in sequence from the browser, and a failure part-way left two
 * posts on one slot with the error in the console. Every target is resolved
 * and checked before anything is written — ownership, `queued`, a time still
 * ahead — and then the updates go out as one `db.batch`, which the neon-http
 * driver sends as a single non-interactive transaction: they commit together
 * or not at all. One revalidate at the end, so the page re-reads once.
 */
export async function reorderLineup(
  moves: { postId: string; target: MoveTarget }[]
): Promise<MoveResult> {
  const user = await requireUser()
  return refusalsAsResults(async () => {
    const zone = resolveTimeZone(user.timezone)

    if (!Array.isArray(moves) || moves.length === 0) return
    if (moves.length > MAX_MOVES) throw new Refusal("Too many moves at once.")

    const ids = moves.map((m) => m.postId)
    if (ids.some((id) => typeof id !== "string") || new Set(ids).size !== ids.length) {
      throw new Refusal("Each post can move once.")
    }

    // Ownership and state, read once for the whole set. A post that is not this
    // user's, or that the sweep has already taken, fails the whole reorder
    // rather than leaving the rest of the order half-applied around it.
    const owned = await db
      .select({ id: scheduledPost.id })
      .from(scheduledPost)
      .where(
        and(
          inArray(scheduledPost.id, ids),
          eq(scheduledPost.userId, user.id),
          eq(scheduledPost.state, "queued")
        )
      )
    if (owned.length !== ids.length) {
      throw new Refusal(
        "One of these posts has changed since the page loaded. Nothing moved."
      )
    }

    const now = new Date()
    const resolved: { postId: string; scheduledFor: Date; slotId: string | null }[] = []
    for (const m of moves) {
      const at = await resolveTarget(user.id, zone, m.target, now)
      resolved.push({ postId: m.postId, ...at })
    }

    const updates = resolved.map((r) =>
      db
        .update(scheduledPost)
        .set({ scheduledFor: r.scheduledFor, slotId: r.slotId })
        .where(
          and(
            eq(scheduledPost.id, r.postId),
            eq(scheduledPost.userId, user.id),
            eq(scheduledPost.state, "queued")
          )
        )
    )
    // `moves` is non-empty (checked above), so so is this; batch's type wants
    // that said as a tuple.
    await db.batch(updates as [(typeof updates)[number], ...typeof updates])

    revalidatePath("/lineup")
  })
}

/**
 * Send a post back to Drafts.
 *
 * A delete, not a state change. A version that is approved with no row here is
 * exactly "waiting on Drafts for a time" — the state the receipt on screen
 * describes — and adding an `unscheduled` flag would make one fact
 * representable two ways and let them disagree.
 *
 * No confirmation upstream, deliberately: the writing and the approval both
 * survive, so this is reversible and a dialog would only blunt the one
 * confirmation on the product that matters, Discard on a draft version.
 */
export async function unschedulePost(postId: string) {
  const user = await requireUser()

  await db
    .delete(scheduledPost)
    .where(and(eq(scheduledPost.id, postId), eq(scheduledPost.userId, user.id)))

  revalidatePath("/lineup")
  revalidatePath("/drafts")
}

/**
 * Add a standing commitment: "Monday 08:00, X".
 *
 * The first thing a new account does on this page, and until this existed there
 * was no way to do it outside scripts/seed-drafts.ts — which is why approving a
 * draft had nowhere to put it. See plans/010.
 *
 * **Only channels Quincy can actually publish to.** A Threads slot would look
 * identical on screen and then sit there being filled by approvals that can
 * never go out, and the place that would discover it is lib/publish-run.ts,
 * hours later, marking a post failed for a reason the user could not have known
 * when they made the slot. Offering the choice is what would create the
 * problem, so the choice is not offered.
 */
export async function createSlot(input: {
  channel: string
  /** ISO weekday: 1 = Monday through 7 = Sunday. */
  weekday: number
  time: string
}) {
  const user = await requireUser()

  if (!(CONNECTABLE_CHANNELS as readonly string[]).includes(input.channel)) {
    throw new Error("Quincy cannot publish to that channel yet")
  }

  if (
    !Number.isInteger(input.weekday) ||
    input.weekday < 1 ||
    input.weekday > 7
  ) {
    throw new Error("Not a weekday")
  }

  // Parsed, not trusted, and re-serialised from the parse. The column is text
  // and sorts lexically as it reads, which only holds while every row is
  // zero-padded — "8:00" would sort after "10:00" and put the day out of order.
  const parsed = parseTimeOfDay(input.time)
  if (!parsed) throw new Error("Not a time")

  const timeOfDay = `${String(parsed.hour).padStart(2, "0")}:${String(
    parsed.minute
  ).padStart(2, "0")}`

  await db
    .insert(slot)
    .values({
      id: `slot_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
      userId: user.id,
      channel: input.channel as ConnectableChannel,
      weekday: input.weekday,
      timeOfDay,
    })
    // slot_user_channel_when_key already refuses a duplicate. Swallowing that
    // rather than surfacing it: pressing Add twice on the same slot means you
    // want that slot, and it exists. An error there would be the product
    // arguing with someone who got what they asked for.
    .onConflictDoNothing()

  revalidatePath("/lineup")
}

/**
 * Take the starting rhythm, in one press.
 *
 * The same two slots connecting a channel now writes — see `ensureStarterSlots`
 * — offered here for the accounts that connected before it did. Without this,
 * the only accounts that could reach a starting rhythm would be ones that
 * disconnected and connected again.
 *
 * It is a proposal on screen and a press, not a default that arrives: the
 * first-run panel spells out the days and the time before you take it, and
 * every row it creates is listed and removable in the same dialog as any other
 * slot.
 */
export async function applyStarterRhythm(channel: string) {
  const user = await requireUser()

  if (!(CONNECTABLE_CHANNELS as readonly string[]).includes(channel)) {
    throw new Error("Quincy cannot publish to that channel yet")
  }

  await ensureStarterSlots({
    userId: user.id,
    channel: channel as ConnectableChannel,
  })

  revalidatePath("/lineup")
}

/**
 * Drop a standing commitment.
 *
 * Anything already scheduled into it stays scheduled — `slot_id` is
 * `ON DELETE SET NULL`, so the post keeps its time and becomes a one-off. That
 * is the honest reading: you are retiring a rhythm, not cancelling writing you
 * already approved.
 */
export async function deleteSlot(slotId: string) {
  const user = await requireUser()

  await db
    .delete(slot)
    .where(and(eq(slot.id, slotId), eq(slot.userId, user.id)))

  revalidatePath("/lineup")
}

/**
 * The next time this weekday-and-time comes round, today included.
 *
 * "Which day is it" is answered in the reader's zone, not the server's. At
 * 23:30 on a Monday in Oslo the server is still on Monday in UTC by half an
 * hour — the same reading, two different weekdays, and the standing slot lands
 * a day out.
 *
 * `today included` is deliberate: this morning's slot at four in the afternoon
 * resolves to this morning, not to next week, and `resolveTarget` then refuses
 * it as passed. Silently pushing it a week out would be a move nobody asked
 * for; queuing it for a passed time would publish it at once inside the
 * sweep's catch-up window (lib/publish-run.ts).
 */
function nextOccurrence(
  weekday: number,
  time: string,
  zone: string,
  now = new Date()
) {
  const parsed = parseTimeOfDay(time)
  if (!parsed) throw new Error("Slot has no usable time")

  const today = calendarDayIn(now, zone)
  const ahead = (weekday - isoWeekdayOf(today) + 7) % 7

  return instantOf({ ...addCalendarDays(today, ahead), ...parsed }, zone)
}

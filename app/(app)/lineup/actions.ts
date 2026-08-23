"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"

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
 * Move a post to a standing slot, or to a bare day and time.
 *
 * Landing in a slot records it; landing on a time clears `slotId`, because a
 * one-off is exactly a post with a time and no standing commitment behind it.
 * The slot it *leaves* needs no update — a slot is filled by whichever post
 * points at it, so pointing elsewhere frees it by definition.
 */
export async function movePost(
  postId: string,
  target:
    | { kind: "slot"; slotId: string }
    | { kind: "day"; dayId: string; time: string }
) {
  const user = await requireUser()
  // The zone the day id and the time in `target` were chosen in. They came off
  // a screen this person was looking at, so they are that person's wall clock
  // and nothing else — turning them into an instant against the server's zone
  // is what put an 08:00 slot out at 10:00.
  const zone = resolveTimeZone(user.timezone)

  let scheduledFor: Date
  let slotId: string | null

  if (target.kind === "slot") {
    const [target_] = await db
      .select()
      .from(slot)
      .where(and(eq(slot.id, target.slotId), eq(slot.userId, user.id)))
      .limit(1)

    if (!target_) throw new Error("No such slot")

    // The slot says Monday 08:00; this week's Monday is what that means now.
    const [existing] = await db
      .select({ scheduledFor: scheduledPost.scheduledFor })
      .from(scheduledPost)
      .where(
        and(eq(scheduledPost.id, postId), eq(scheduledPost.userId, user.id))
      )
      .limit(1)

    if (!existing) throw new Error("No such post")

    scheduledFor = nextOccurrence(target_.weekday, target_.timeOfDay, zone)
    slotId = target_.id
  } else {
    // Both halves arrive from the client, so both are parsed rather than
    // trusted. `new Date(y, mo - 1, d, h, m)` accepted "2026-02-31" and rolled
    // it into March without saying so, on top of reading the server's zone.
    const date = parseDayKey(target.dayId)
    const time = parseTimeOfDay(target.time)
    if (!date || !time) throw new Error("Not a day and a time")

    scheduledFor = instantOf({ ...date, ...time }, zone)
    slotId = null
  }

  await db
    .update(scheduledPost)
    .set({ scheduledFor, slotId })
    .where(and(eq(scheduledPost.id, postId), eq(scheduledPost.userId, user.id)))

  revalidatePath("/lineup")
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
 * `today included` is deliberate and unchanged: dropping a post into this
 * morning's slot at four in the afternoon queues it for a time that has passed,
 * which reads on screen as "you missed it" rather than silently pushing it a
 * week out. Whether that is the right product answer is a separate question
 * from this one, and it is not settled by a timezone fix.
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

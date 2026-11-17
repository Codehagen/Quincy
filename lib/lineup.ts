import { and, asc, eq, gte, isNull, lt } from "drizzle-orm"

import { db } from "./db"
import {
  draft,
  draftVersion,
  scheduledPost,
  slot,
  SCHEDULED_STATES,
} from "./schema-app"
import {
  addCalendarDays,
  calendarDayIn,
  dayKeyIn,
  dayKeyOf,
  hhmmIn,
  isoWeekdayOf,
  resolveTimeZone,
  parseDayKey,
  startOfDayIn,
} from "./timezone"
import { filledOccurrences, mondayOf, occurrenceKey } from "./lineup-week"

/**
 * When approved writing goes out.
 *
 * **Not a calendar.** docs/vision.md files that under what we are deliberately
 * not building: "Nobody shows lineage; everybody shows a calendar." The two
 * rhythms that touch this surface in lib/rhythms.ts both ask in days and weeks
 * and never in months — Morning Brief reads it for "what is going out today",
 * and Week Plan writes to it to fill "next week's slots, so Monday is not a
 * blank calendar". So the read below returns days, and the window is a week.
 *
 * The shapes here were settled by app/prototypes/lineup before the tables were
 * written. A slot is a standing commitment with its own row, which is the only
 * way a Wednesday with nothing in it can read as a slot going to waste rather
 * than as a blank date; and a scheduled post hangs off a *version*, not a
 * piece, because one draft goes out on X at 08:00 and on LinkedIn at 11:00 the
 * same day.
 */

export type Entry = {
  /** The scheduled_post row. Server actions address a post by this. */
  id: string
  versionId: string
  draftId: string
  idea: string
  channel: string
  channelLabel: string
  sourceId: string
  sourceLabel: string
  /** The opening line. You are checking timing here, not re-reading the post. */
  opening: string
  /** Zero-padded 24-hour, rendered on the server so both ends agree. */
  time: string
  state: (typeof SCHEDULED_STATES)[number]
  /** The live post, once there is one. The receipt on a published row. */
  url: string | null
  /**
   * Why it did not go out, in the platform's words — or ours, when the window
   * closed before anything tried. Read on `failed`, and on `sending`, where it
   * carries the "check the account before retrying" wording.
   */
  error: string | null
}

export type Day = {
  id: string
  /** "Today", "Tomorrow", then the weekday name. Relative beats absolute. */
  label: string
  /** Weekday abbreviation for the cadence strip. */
  short: string
  /** "Mon 4 Aug" — the anchor, kept quiet beside the label. */
  date: string
  entries: Entry[]
}

export type Slot = {
  id: string
  /** Matches `Day.id`, so an empty slot lands in the right day. */
  dayId: string
  /**
   * ISO weekday, 1–7. The rendered rows do not need it — they have `dayId` —
   * but the Add-a-slot dialog lists a channel's standing slots and has to
   * compare against what you are typing, and deriving the number back out of
   * `label` would mean parsing a display string.
   */
  weekday: number
  time: string
  /** "Mon 08:00", for anywhere a slot renders outside its day. */
  label: string
  channel: string
  channelLabel: string
  /** Entry id filling it this week, or null when it is going to waste. */
  filledBy: string | null
}

const WEEKDAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const WEEKDAY_LONG = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
]
/**
 * Fixed English, matching the weekday tables above rather than the viewer's
 * locale. The labels beside them ("Today", "Monday") are English strings in the
 * source, so formatting the month through `Intl` would produce "Mon 4 août"
 * next to "Tomorrow" the moment anything sets a different locale.
 */
const MONTH = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

/**
 * A rolling week starting today, not a calendar week starting Monday.
 *
 * The question this page answers is "what is going out", and the answer starts
 * now. A Monday-anchored week would spend its first rows on days that have
 * already happened, every day except one.
 *
 * "Today" is today *where the reader is*, which is the whole point of taking a
 * zone. At 23:30 in Oslo the server is still on the previous day in UTC, and a
 * lineup that opens on yesterday is a lineup nobody trusts again.
 */
function windowOf(days: number, from: Date, zone: string): Day[] {
  const start = calendarDayIn(from, zone)

  return Array.from({ length: days }, (_, i) => {
    const date = addCalendarDays(start, i)
    const iso = isoWeekdayOf(date)

    return {
      id: dayKeyOf(date),
      label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : WEEKDAY_LONG[iso - 1],
      short: WEEKDAY[iso - 1],
      date: `${WEEKDAY[iso - 1]} ${date.day} ${MONTH[date.month - 1]}`,
      entries: [],
    }
  })
}

/**
 * The week ahead, and the standing slots inside it.
 *
 * One window, seven days. Posts outside it are not lost — they are simply not
 * this question — and a post whose time has passed stays visible for the day it
 * went out, because a queue that erases what happened gives you no way to check
 * that it did.
 */
export async function getLineup(
  user: { id: string; timezone?: string | null },
  now = new Date()
): Promise<{ days: Day[]; slots: Slot[] }> {
  // Every hour and every day boundary below is drawn in this zone. Absent or
  // unrecognised falls back to UTC — see resolveTimeZone.
  const zone = resolveTimeZone(user.timezone)

  const days = windowOf(7, now, zone)

  // The window is midnight-to-midnight *in the reader's zone*, converted to the
  // two instants that bracket it. Not `setHours(0,0,0,0)`, which would bracket
  // the server's day: on Vercel that is UTC, so an Oslo reader's window would
  // start two hours late and end two hours early, dropping anything scheduled
  // before 02:00 on the last day.
  const today = calendarDayIn(now, zone)
  const from = startOfDayIn(today, zone)
  const to = startOfDayIn(addCalendarDays(today, 7), zone)

  // One round trip of waiting, not two: the week's posts and the standing
  // slots are both keyed on the user alone. Only the `filled` map below joins
  // them, and it works on the results, not between the queries.
  const [rows, standing] = await Promise.all([
    db
      .select({
        post: scheduledPost,
        version: draftVersion,
        piece: draft,
      })
      .from(scheduledPost)
      .innerJoin(
        draftVersion,
        eq(scheduledPost.draftVersionId, draftVersion.id)
      )
      .innerJoin(draft, eq(draftVersion.draftId, draft.id))
      .where(
        and(
          eq(scheduledPost.userId, user.id),
          gte(scheduledPost.scheduledFor, from),
          lt(scheduledPost.scheduledFor, to)
        )
      )
      .orderBy(asc(scheduledPost.scheduledFor)),
    db
      .select()
      .from(slot)
      .where(eq(slot.userId, user.id))
      .orderBy(asc(slot.weekday), asc(slot.timeOfDay)),
  ])

  const byDay = new Map(days.map((d) => [d.id, d]))

  for (const row of rows) {
    const key = dayKeyIn(row.post.scheduledFor, zone)
    const day = byDay.get(key)
    if (!day) continue

    day.entries.push({
      id: row.post.id,
      versionId: row.version.id,
      draftId: row.piece.id,
      idea: row.piece.idea,
      channel: row.version.channel,
      channelLabel: row.version.label,
      sourceId: row.piece.sourceId,
      sourceLabel: row.piece.sourceLabel,
      // First line only. The whole post belongs on Drafts, where it can be
      // edited; showing it here would make this a second Drafts with worse
      // editing.
      opening: row.version.body.split("\n")[0],
      time: hhmmIn(row.post.scheduledFor, zone),
      state: row.post.state,
      url: row.post.postUrl,
      error: row.post.lastError,
    })
  }

  // Filled at the slot's own instant, as `nextFreeSlot` asks it (see
  // lib/lineup-week.ts). Not "any post pointing at the slot": a post sent
  // early still points at it and fills nothing.
  const filled = filledOccurrences(
    rows.map((r) => ({ id: r.post.id, slotId: r.post.slotId, scheduledFor: r.post.scheduledFor })),
    standing,
    Array.from({ length: 7 }, (_, i) => addCalendarDays(today, i)),
    zone
  )

  const slots: Slot[] = standing.flatMap((s) => {
    // Each weekday falls exactly once in a seven-day window, so this is a
    // lookup rather than a search.
    const day = days.find((d) => d.short === WEEKDAY[s.weekday - 1])
    if (!day) return []

    return [
      {
        id: s.id,
        dayId: day.id,
        weekday: s.weekday,
        time: s.timeOfDay,
        label: `${WEEKDAY[s.weekday - 1]} ${s.timeOfDay}`,
        channel: s.channel,
        channelLabel: CHANNEL_LABELS[s.channel] ?? s.channel,
        filledBy: filled.get(occurrenceKey(s.id, day.id)) ?? null,
      },
    ]
  })

  return { days, slots }
}

/* ── The calendar's week ─────────────────────────────────────────────────── */

/** One post in the calendar's week: an `Entry`, with what the calendar and its feed pane need beside it. */
export type WeekPost = Entry & {
  /** The day it goes out on, `YYYY-MM-DD`, in the account's zone. */
  dayId: string
  /** The whole post. The pane draws it as the feed will (read-only). */
  body: string
  /** The standing slot it points at, or null for a one-off. */
  slotId: string | null
}

/** A standing slot, as the calendar draws its occurrences. */
export type WeekSlot = {
  id: string
  channel: string
  channelLabel: string
  /** ISO weekday, 1–7. */
  weekday: number
  /** Zero-padded 24-hour. */
  time: string
}

/**
 * Approved writing with no `scheduled_post` row: "waiting on Drafts for a
 * time" (lib/schema-app.ts). `no-slot` when the channel has no slot at all;
 * `slot-came-later` when it has one now, so placement never ran for it (the
 * same reading lib/going-out.ts makes on Drafts). Whether every slot is full
 * is only known by asking `placeApprovedVersion`.
 */
export type Unplaced = {
  versionId: string
  channel: string
  channelLabel: string
  body: string
  opening: string
  reason: "no-slot" | "slot-came-later"
}

export type LineupWeek = {
  /** The Monday of the week shown, `YYYY-MM-DD`. */
  week: string
  /** The Monday of the week today falls in. */
  thisWeek: string
  posts: WeekPost[]
  slots: WeekSlot[]
  /** `slotId@dayId` → the post that fills that occurrence (lib/lineup-week.ts). */
  filled: Record<string, string>
  unplaced: Unplaced[]
}

/**
 * A Monday-to-Sunday week, for the calendar on /lineup.
 *
 * `getLineup` reads a rolling seven days from today, which is the right
 * question for a list ("what is going out") and the wrong one for a calendar
 * of the week: Monday's 08:00 that went out this morning belongs on the
 * grid. So this reads the week `week` names (any Monday; a day that is not a
 * Monday is taken as its week), or this week. A read only, of the same rows
 * `getLineup` reads, plus the approved versions that have no time, which
 * Drafts reads too.
 */
export async function getLineupWeek(
  user: { id: string; timezone?: string | null },
  { week, now = new Date() }: { week?: string | null; now?: Date } = {}
): Promise<LineupWeek> {
  const zone = resolveTimeZone(user.timezone)
  const thisWeek = mondayOf(dayKeyIn(now, zone))!
  const asked = week ? mondayOf(week) : null
  const monday = parseDayKey(asked ?? thisWeek)!
  const days = Array.from({ length: 7 }, (_, i) => addCalendarDays(monday, i))
  const from = startOfDayIn(monday, zone)
  const to = startOfDayIn(addCalendarDays(monday, 7), zone)

  const [rows, standing, waiting] = await Promise.all([
    db
      .select({ post: scheduledPost, version: draftVersion, piece: draft })
      .from(scheduledPost)
      .innerJoin(draftVersion, eq(scheduledPost.draftVersionId, draftVersion.id))
      .innerJoin(draft, eq(draftVersion.draftId, draft.id))
      .where(
        and(
          eq(scheduledPost.userId, user.id),
          gte(scheduledPost.scheduledFor, from),
          lt(scheduledPost.scheduledFor, to)
        )
      )
      .orderBy(asc(scheduledPost.scheduledFor)),
    db
      .select()
      .from(slot)
      .where(eq(slot.userId, user.id))
      .orderBy(asc(slot.weekday), asc(slot.timeOfDay)),
    // Owned through `draft.user_id`: `draft_version` has no owner of its own.
    db
      .select({ version: draftVersion })
      .from(draftVersion)
      .innerJoin(draft, eq(draftVersion.draftId, draft.id))
      .leftJoin(scheduledPost, eq(scheduledPost.draftVersionId, draftVersion.id))
      .where(
        and(
          eq(draft.userId, user.id),
          eq(draftVersion.state, "approved"),
          isNull(scheduledPost.id)
        )
      )
      .orderBy(asc(draftVersion.approvedAt)),
  ])

  const posts: WeekPost[] = rows.map((row) => ({
    id: row.post.id,
    versionId: row.version.id,
    draftId: row.piece.id,
    idea: row.piece.idea,
    channel: row.version.channel,
    channelLabel: row.version.label,
    sourceId: row.piece.sourceId,
    sourceLabel: row.piece.sourceLabel,
    opening: row.version.body.split("\n")[0],
    time: hhmmIn(row.post.scheduledFor, zone),
    state: row.post.state,
    url: row.post.postUrl,
    error: row.post.lastError,
    dayId: dayKeyIn(row.post.scheduledFor, zone),
    body: row.version.body,
    slotId: row.post.slotId,
  }))

  const filled = filledOccurrences(
    rows.map((r) => ({ id: r.post.id, slotId: r.post.slotId, scheduledFor: r.post.scheduledFor })),
    standing,
    days,
    zone
  )

  const withSlots = new Set(standing.map((s) => s.channel))

  return {
    week: dayKeyOf(monday),
    thisWeek,
    posts,
    slots: standing.map((s) => ({
      id: s.id,
      channel: s.channel,
      channelLabel: CHANNEL_LABELS[s.channel] ?? s.channel,
      weekday: s.weekday,
      time: s.timeOfDay,
    })),
    filled: Object.fromEntries(filled),
    unplaced: waiting.map(({ version: v }) => ({
      versionId: v.id,
      channel: v.channel,
      channelLabel: v.label,
      body: v.body,
      opening: v.body.split("\n")[0],
      reason: withSlots.has(v.channel) ? "slot-came-later" : "no-slot",
    })),
  }
}

/**
 * Display names for a slot's channel.
 *
 * A slot has no version to borrow a label from — it is a commitment that exists
 * before anything fills it — so the name has to come from somewhere. One table,
 * mirroring the one on /channels.
 */
const CHANNEL_LABELS: Record<string, string> = {
  x: "X",
  linkedin: "LinkedIn",
  threads: "Threads",
  bluesky: "Bluesky",
  instagram: "Instagram",
  youtube: "YouTube",
  substack: "Substack",
  kit: "Kit",
  tiktok: "TikTok",
  mastodon: "Mastodon",
}

/**
 * A day's rows, in time order: what is scheduled, plus slots standing empty.
 *
 * Only a model that knows a slot exists before anything fills it can say you
 * have a Wednesday slot going to waste. That is an absence measured against a
 * commitment, and it is the one sentence here with an obvious next step.
 */
export function rowsForDay(day: Day, slots: Slot[]) {
  const empty = slots
    .filter((s) => s.dayId === day.id && !s.filledBy)
    .map((s) => ({ kind: "slot" as const, time: s.time, slot: s }))

  const scheduled = day.entries.map((entry) => ({
    kind: "entry" as const,
    time: entry.time,
    entry,
  }))

  // Times are zero-padded 24-hour, so plain string order is chronological.
  return [...scheduled, ...empty].sort((a, b) => (a.time < b.time ? -1 : 1))
}

/**
 * What is still yours to change, which is not the same as what is on the page.
 *
 * The rule `countWaiting` follows on Drafts: a published post is history, and
 * counting it would make the number a measure of the past rather than of what
 * you can still act on.
 *
 * `queued` alone, and the three exclusions are each deliberate. `published` is
 * history. `sending` is a post whose outcome nobody knows, so it is not yours
 * to change either — moving it would be moving something that may already be
 * out. `failed` is genuinely yours to act on, but it is not *waiting*, and
 * folding it in would make one number answer two questions: this one counts
 * what is still going to happen, and the failures announce themselves on the
 * rows.
 */
export function countQueued(days: Day[]) {
  const entries = days.reduce(
    (n, d) => n + d.entries.filter((e) => e.state === "queued").length,
    0
  )
  const open = days.filter((d) =>
    d.entries.some((e) => e.state === "queued")
  ).length

  return { entries, days: open }
}

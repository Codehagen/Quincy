/**
 * Prototype fixtures for /lineup — when approved writing actually goes out.
 *
 * **Not a calendar.** docs/vision.md files that under what we are deliberately
 * not building: "Nobody shows lineage; everybody shows a calendar." The two
 * rhythms that touch this surface in lib/rhythms.ts both ask in days and weeks
 * and never in months — Morning Brief reads it for "what is going out today",
 * and Week Plan writes to it to "fill next week's slots, so Monday is not a
 * blank calendar". A month grid answers a reporting question at a volume of a
 * few posts a week, which is thirty mostly-empty cells.
 *
 * The word **slot** comes from Week Plan and is load-bearing: a slot is a
 * recurring shape ("Monday 08:00, X"), not a date. What a piece needs is a
 * time; what a week needs is a rhythm. Whether those are one model or two is
 * the question this prototype exists to answer, and it is the reason Lineup is
 * being designed before the drafts table is written — `scheduledAt` per version
 * or per piece, slot as a row or a rule, is a schema decision that only the
 * layout can settle.
 *
 * Days are fixed labels rather than anything derived from `now`, so the server
 * and the client render the same string. The pieces continue the Drafts
 * fixtures on purpose — pricing, url-state and taxonomy all appear there — so
 * the chain Sources → Riffs → Drafts → Lineup is legible end to end rather than
 * as four disconnected screens.
 */

export type Entry = {
  id: string
  /** The piece this version belongs to, so Lineup can name its provenance. */
  draftId: string
  idea: string
  channel: string
  channelLabel: string
  /** Where the material originally came in, continuing the chain. */
  sourceId: string
  sourceLabel: string
  /** The opening line. You are checking timing here, not re-reading the post. */
  opening: string
  /** 24-hour local. Tabular everywhere it renders — these stack in a column. */
  time: string
  /**
   * `queued` is the only state you can still change. `published` is history and
   * belongs on the page for the same reason an approved version stays on a
   * draft card: a queue whose items vanish gives you no way to see what you
   * already decided.
   *
   * `unscheduled` is a receipt, not a state the post keeps. The post has gone
   * back to Drafts still approved; what stays here is a row saying so, until
   * the page is reloaded and the server has actually moved it.
   */
  state: "queued" | "published" | "unscheduled"
}

export type Day = {
  id: string
  /** "Today", "Tomorrow", then the weekday name. Relative beats absolute here. */
  label: string
  /**
   * Weekday abbreviation for the cadence strip.
   *
   * Carried rather than sliced off `label`, which produced "Tod" and "Tom" —
   * not words. The strip's job is the shape of the week, so it wants weekday
   * names even on the two days the list calls Today and Tomorrow.
   */
  short: string
  /** "4 Aug" — the anchor, kept quiet beside the label. */
  date: string
  entries: Entry[]
}

/**
 * A recurring shape, not a date.
 *
 * This is the model Week Plan already assumes. Whether it survives into the
 * schema is exactly what the Slots variant is testing: it is either the real
 * primitive with entries hanging off it, or it is a view over entries that
 * happen to repeat.
 */
export type Slot = {
  id: string
  /** Matches `Day.id`, so Agenda can drop an empty slot into the right day. */
  dayId: string
  /** "12:00" — sorted against entry times so an empty slot sits in order. */
  time: string
  /** "Mon 08:00", for the layouts that show slots outside a day. */
  label: string
  channel: string
  channelLabel: string
  /** Entry id filling it this week, or null when the slot is going to waste. */
  filledBy: string | null
}

export const DAYS: Day[] = [
  {
    id: "mon",
    label: "Today",
    short: "Mon",
    date: "Mon 4 Aug",
    entries: [
      {
        id: "e1",
        draftId: "url-state",
        idea: "The URL as state management",
        channel: "x",
        channelLabel: "X",
        sourceId: "github",
        sourceLabel: "GitHub",
        opening: "URL-en er den beste state-managementen du ikke bruker.",
        time: "08:00",
        state: "published",
      },
      {
        id: "e2",
        draftId: "taxonomy",
        idea: "Filing by platform is a taxonomy mistake",
        channel: "linkedin",
        channelLabel: "LinkedIn",
        sourceId: "slack",
        sourceLabel: "Slack",
        opening:
          "De fleste integrasjonssider filer etter plattform. Da havner 14 ting under X og 1 under Instagram.",
        time: "12:30",
        state: "queued",
      },
    ],
  },
  {
    id: "tue",
    label: "Tomorrow",
    short: "Tue",
    date: "Tue 5 Aug",
    entries: [
      {
        id: "e3",
        draftId: "pricing",
        idea: "Why we dropped per-seat pricing",
        channel: "x",
        channelLabel: "X",
        sourceId: "voice",
        sourceLabel: "Voice notes",
        opening: "Vi droppet per-seat prising i går.",
        time: "08:00",
        state: "queued",
      },
      {
        id: "e4",
        draftId: "pricing",
        idea: "Why we dropped per-seat pricing",
        channel: "linkedin",
        channelLabel: "LinkedIn",
        sourceId: "voice",
        sourceLabel: "Voice notes",
        opening:
          "Vi brukte tre uker på prisingen og landet et sted vi ikke hadde planlagt.",
        time: "11:00",
        state: "queued",
      },
      {
        id: "e5",
        draftId: "taxonomy",
        idea: "Filing by platform is a taxonomy mistake",
        channel: "x",
        channelLabel: "X",
        sourceId: "slack",
        sourceLabel: "Slack",
        opening:
          "De fleste integrasjonssider filer etter plattform. Da havner 14 ting under X og 1 under Instagram, og du finner ingenting.",
        time: "16:45",
        state: "queued",
      },
    ],
  },
  // Two empty days in the middle, deliberately. A layout that only looks right
  // when every day is full is a layout that has not been tested against the
  // actual shape of a publishing week.
  {
    id: "wed",
    label: "Wednesday",
    short: "Wed",
    date: "Wed 6 Aug",
    entries: [],
  },
  {
    id: "thu",
    label: "Thursday",
    short: "Thu",
    date: "Thu 7 Aug",
    entries: [
      {
        id: "e6",
        draftId: "pricing",
        idea: "Why we dropped per-seat pricing",
        channel: "substack",
        channelLabel: "Substack",
        sourceId: "voice",
        sourceLabel: "Voice notes",
        opening: "Prising er et produktvalg, ikke et regnearkvalg.",
        time: "09:00",
        state: "queued",
      },
    ],
  },
  { id: "fri", label: "Friday", short: "Fri", date: "Fri 8 Aug", entries: [] },
  {
    id: "sat",
    label: "Saturday",
    short: "Sat",
    date: "Sat 9 Aug",
    entries: [],
  },
  { id: "sun", label: "Sunday", short: "Sun", date: "Sun 10 Aug", entries: [] },
]

/**
 * The recurring week, as Week Plan would fill it.
 *
 * Three of six are empty on purpose. An empty slot is the one thing this model
 * can say that a list of scheduled posts cannot: not "nothing goes out
 * Wednesday" but "you have a Wednesday slot and nothing is in it", which is a
 * different sentence with a different next step.
 */
export const SLOTS: Slot[] = [
  {
    id: "s1",
    dayId: "mon",
    time: "08:00",
    label: "Mon 08:00",
    channel: "x",
    channelLabel: "X",
    filledBy: "e1",
  },
  {
    id: "s2",
    dayId: "mon",
    time: "12:30",
    label: "Mon 12:30",
    channel: "linkedin",
    channelLabel: "LinkedIn",
    filledBy: "e2",
  },
  {
    id: "s3",
    dayId: "tue",
    time: "08:00",
    label: "Tue 08:00",
    channel: "x",
    channelLabel: "X",
    filledBy: "e3",
  },
  {
    id: "s4",
    dayId: "wed",
    time: "12:00",
    label: "Wed 12:00",
    channel: "linkedin",
    channelLabel: "LinkedIn",
    filledBy: null,
  },
  {
    id: "s5",
    dayId: "thu",
    time: "09:00",
    label: "Thu 09:00",
    channel: "substack",
    channelLabel: "Substack",
    filledBy: "e6",
  },
  {
    id: "s6",
    dayId: "fri",
    time: "08:00",
    label: "Fri 08:00",
    channel: "x",
    channelLabel: "X",
    filledBy: null,
  },
]

/**
 * A day's rows, in time order: what is scheduled, plus the slots standing empty.
 *
 * This is the merge the prototype exists to test. Agenda and Week can both say
 * nothing goes out on Wednesday; only a model that knows a slot exists before
 * anything fills it can say you *have* a Wednesday slot and it is going to
 * waste. That is an absence measured against a commitment, and it is the one
 * sentence with an obvious next step.
 *
 * Empty slots sort in among the entries rather than collecting at the end,
 * because a gap at 12:00 between posts at 08:00 and 16:45 is a different fact
 * from a gap after both, and the reason you would fill it is different too.
 */
export function rowsForDay(day: Day, slots: Slot[]) {
  // A slot whose post was just unscheduled is genuinely free, but its receipt
  // is already standing at that time saying so. Rendering both would put a
  // notice and an empty slot on the same day at the same minute.
  const vacated = new Set(
    day.entries.filter((e) => e.state === "unscheduled").map((e) => e.time)
  )

  const empty = slots
    .filter((s) => s.dayId === day.id && !s.filledBy && !vacated.has(s.time))
    .map((slot) => ({ kind: "slot" as const, time: slot.time, slot }))

  const scheduled = day.entries.map((entry) => ({
    kind: "entry" as const,
    time: entry.time,
    entry,
  }))

  // Times are zero-padded 24-hour, so plain string order is chronological.
  return [...scheduled, ...empty].sort((a, b) => (a.time < b.time ? -1 : 1))
}

/** Flat view of every entry, for the variants that do not group by day. */
export const ENTRIES: Entry[] = DAYS.flatMap((d) => d.entries)

/**
 * What is still yours to change, which is not the same as what is on the page.
 *
 * The same rule `countWaiting` follows on Drafts: a published post is history,
 * and counting it would make the number a measure of the past rather than of
 * what you can still act on.
 */
export function countQueued(days: Day[]) {
  const entries = days.reduce(
    (n, d) => n + d.entries.filter((e) => e.state === "queued").length,
    0
  )
  const days_ = days.filter((d) =>
    d.entries.some((e) => e.state === "queued")
  ).length

  return { entries, days: days_ }
}

/** Where a move can land. A slot, or a bare day-and-time. */
export type MoveTarget =
  | { kind: "slot"; slotId: string }
  | { kind: "day"; dayId: string; time: string }

/**
 * Move one post, and keep the slots honest about it.
 *
 * This is the operation the whole surface exists for, and writing it is what
 * proves the schema decision the prototype was built to make. Three facts fall
 * out of it, and all three are the reason Lineup was designed before the drafts
 * table was written:
 *
 * - **A slot has to be a row.** Freeing the slot a post is leaving requires
 *   looking it up by `filledBy`. A slot that were only a saved view over posts
 *   could not be emptied, because there would be nothing to empty.
 * - **Time lives on the post, not the piece.** The same draft appears twice on
 *   Tuesday at two times on two channels. Moving one must not move the other.
 * - **`slot_id` is nullable and must be.** Moving to a bare day-and-time leaves
 *   a post with a time and no slot, which is the one-off case, and it has to be
 *   representable or "move it to Thursday at 14:00" has nowhere to go.
 */
export function moveEntry(
  days: Day[],
  slots: Slot[],
  entryId: string,
  target: MoveTarget
): { days: Day[]; slots: Slot[] } {
  const entry = days.flatMap((d) => d.entries).find((e) => e.id === entryId)
  if (!entry) return { days, slots }

  const dest =
    target.kind === "slot"
      ? slots.find((s) => s.id === target.slotId)
      : { dayId: target.dayId, time: target.time }
  if (!dest) return { days, slots }

  const moved = { ...entry, time: dest.time }

  const nextDays = days.map((day) => {
    const without = day.entries.filter((e) => e.id !== entryId)
    if (day.id !== dest.dayId) return { ...day, entries: without }
    // Re-sorted on insert. A post dropped into the middle of a day belongs
    // between its neighbours, not at the end of the array it happened to land in.
    return {
      ...day,
      entries: [...without, moved].sort((a, b) => (a.time < b.time ? -1 : 1)),
    }
  })

  const nextSlots = slots.map((slot) => {
    // The slot it is leaving goes back to standing empty.
    if (slot.filledBy === entryId) return { ...slot, filledBy: null }
    // The slot it is landing in, if it landed in one.
    if (target.kind === "slot" && slot.id === target.slotId) {
      return { ...slot, filledBy: entryId }
    }
    return slot
  })

  return { days: nextDays, slots: nextSlots }
}

/**
 * What this post could move to, in the order a person would want them.
 *
 * Empty slots on the post's own channel first, because that is the one-click
 * case the page is already showing you — a standing Wednesday LinkedIn slot
 * with nothing in it, two rows below a LinkedIn post you want to move. Slots on
 * other channels are deliberately absent: a LinkedIn post does not belong in an
 * X slot, and offering it would make the useful list longer and worse.
 */
export function moveOptions(days: Day[], slots: Slot[], entry: Entry) {
  const openSlots = slots.filter(
    (s) => !s.filledBy && s.channel === entry.channel
  )

  const currentDayIndex = days.findIndex((d) =>
    d.entries.some((e) => e.id === entry.id)
  )
  const nextDay = days[currentDayIndex + 1]

  return { openSlots, nextDay }
}

/**
 * Send a post back to Drafts.
 *
 * **No confirmation, deliberately.** Nothing is destroyed: the writing and the
 * approval both survive, and the post is waiting on Drafts for a new time. That
 * is the line forms-and-inputs draws around rule 12 — Discard on a draft
 * deletes text and cannot be undone, so it gets a dialog; this loses a
 * timestamp and can be undone from the row it leaves behind, so a dialog would
 * only tax the common path and blunt the one confirmation that matters.
 *
 * The slot is freed here rather than on some later commit, because it is true
 * immediately: nothing is going out at that time any more. `rowsForDay`
 * suppresses the dashed empty-slot row while the receipt is showing, so one
 * click produces one row rather than a notice and an empty slot sitting at the
 * same time on the same day.
 */
export function unscheduleEntry(days: Day[], slots: Slot[], entryId: string) {
  return {
    days: days.map((day) => ({
      ...day,
      entries: day.entries.map((e) =>
        e.id === entryId ? { ...e, state: "unscheduled" as const } : e
      ),
    })),
    slots: slots.map((s) =>
      s.filledBy === entryId ? { ...s, filledBy: null } : s
    ),
  }
}

/** Put it back where it was, and back in its slot if that is still free. */
export function rescheduleEntry(days: Day[], slots: Slot[], entryId: string) {
  const entry = days.flatMap((d) => d.entries).find((e) => e.id === entryId)
  const day = days.find((d) => d.entries.some((e) => e.id === entryId))

  const slot = slots.find(
    (s) => !s.filledBy && s.dayId === day?.id && s.time === entry?.time
  )

  return {
    days: days.map((d) => ({
      ...d,
      entries: d.entries.map((e) =>
        e.id === entryId ? { ...e, state: "queued" as const } : e
      ),
    })),
    slots: slots.map((s) =>
      s.id === slot?.id ? { ...s, filledBy: entryId } : s
    ),
  }
}

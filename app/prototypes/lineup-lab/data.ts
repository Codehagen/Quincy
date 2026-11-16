/**
 * The Lineup lab's fixtures: fictional writing in the real shapes of
 * lib/lineup.ts (`Day`, `Entry`, `Slot`) and lib/schema-app.ts
 * (`scheduled_post`, `slot`). No real post text is copied here.
 *
 * The clock is fixed, so the server and the client draw the same week:
 * Monday 16 November 2026, 14:20 in Europe/Oslo (the live account's zone).
 * The window is a rolling seven days from today, as `getLineup` draws it.
 */

export type Channel = "x" | "linkedin"

export const CHANNEL_LABEL: Record<Channel, string> = { x: "X", linkedin: "LinkedIn" }

/** A standing commitment: "Monday 08:00, X" (the `slot` row). */
export type LabSlot = { id: string; channel: Channel; weekday: number; time: string }

/** `SCHEDULED_STATES` in lib/schema-app.ts. */
export type PostState = "queued" | "sending" | "published" | "failed"

/** One approved version with a time (the `scheduled_post` row, joined as `Entry` is). */
export type LabPost = {
  id: string
  versionId: string
  idea: string
  channel: Channel
  /** The whole post. Lineup today shows the opening line only; the feed renderings show it all. */
  body: string
  dayId: string
  /** Zero-padded 24-hour, in the account's zone. */
  time: string
  /** The slot it fills, or null for a one-off. */
  slotId: string | null
  state: PostState
  url: string | null
  /** The platform's words on `failed`; the caution on `sending`. */
  error: string | null
}

/**
 * Approved, with no `scheduled_post` row: "waiting on Drafts for a time"
 * (lib/going-out.ts). Today these show on Drafts only.
 */
export type Stranded = {
  versionId: string
  idea: string
  channel: Channel
  body: string
  reason: "no-slot" | "slots-full" | "slot-came-later" | "sent-back"
}

export type Day = { id: string; label: string; short: string; date: string; weekday: number }

/** The fixed clock. */
export const NOW = { dayId: "2026-11-16", time: "14:20" }

const WEEKDAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

/** Today and the six days after it (16 to 22 November 2026; the 16th is a Monday). */
export const DAYS: Day[] = Array.from({ length: 7 }, (_, i) => {
  const day = 16 + i
  return {
    id: `2026-11-${day}`,
    label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : LONG[i]!,
    short: WEEKDAY[i]!,
    date: `${WEEKDAY[i]} ${day} Nov`,
    weekday: i + 1,
  }
})

export const dayOf = (id: string) => DAYS.find((d) => d.id === id)

/**
 * The person's own baseline, from the live account's posts on X (read-only
 * aggregate, 2026-11-16): 99 posts since November 2025, in 21 of 43 weeks;
 * the median of the weeks with a post is 3. Every number on the page is
 * said against this, never against a follower count.
 */
export const BASELINE = { perWeek: 3, since: "November 2025" }

export const ACCOUNT = { name: "Christer Hagen", handle: "christer", initials: "CH", headline: "Founder at Fernwood Software" }

/* ── The writing (fictional) ─────────────────────────────────────────── */

const W = {
  backup: {
    idea: "The backup nobody had tested",
    body: "We restored a customer database from backup on Thursday. First time anyone had tried.\n\nIt took 41 minutes. The runbook said 5.\n\n41\n\nA backup you have never restored is a hope, not a plan. We now restore one every Friday.",
  },
  pricing: {
    idea: "Pricing page rewrite",
    body: "I rewrote our pricing page in plain words last week.\n\nSign-ups from it went from 9 to 14 in five days.\n\n14\n\nNobody wanted a cleverer page. They wanted to know what they would pay.",
  },
  hiring: {
    idea: "Hiring without a take-home test",
    body: "We stopped sending take-home tests to candidates this autumn. Instead we pair for an hour on a real bug from our own tracker, with the candidate driving and one of us navigating.\n\nThree hires later, all three are still here and two of them now run the interviews themselves.\n\n3\n\nWhat we learned: an hour of real work tells you more than a weekend of fake work, and the candidate learns whether they want the job. I'd do it this way again, and I'd start sooner.",
  },
  standup: {
    idea: "Killing the daily stand-up",
    body: "We cancelled the daily stand-up in October.\n\nShipped changes per week went from 11 to 16.\n\n16\n\nThe meeting was not the work. Writing it down was.",
  },
  invoice: {
    idea: "The invoice bug a customer found",
    body: "A customer found a rounding bug in our invoices on Sunday night.\n\nWe fixed it, refunded 212 accounts and wrote to each one by Monday noon.\n\n212\n\nThe fix took an hour. The letters took the morning, and they are what people replied to.",
  },
  docs: {
    idea: "Docs as the first support agent",
    body: "Every support ticket now starts with: which page of the docs did you read?\n\nTickets per week went from 30 to 19.\n\n19\n\nThe docs were never the problem. Nobody could find them.",
  },
  onboarding: {
    idea: "Onboarding call cut to 15 minutes",
    body: "Our onboarding call was 45 minutes. I cut it to 15 and sent the rest as a short video.\n\nActivation in week one went up, not down: 62% to 71%.\n\n71%\n\nPeople wanted to start, not to be shown.",
  },
  release: {
    idea: "Friday releases",
    body: "We used to ban releases on Fridays.\n\nNow we ship on Fridays on purpose, small, before lunch.\n\nThe team leaves knowing it works.",
  },
} as const

/* ── Scenarios ───────────────────────────────────────────────────────── */

export type Scenario = "fixtures" | "real" | "full" | "first-run"

export type LabWeek = {
  slots: LabSlot[]
  posts: LabPost[]
  stranded: Stranded[]
  /** Every slot next week is taken too (the "full" scenario): placement past this week fails. */
  nextWeekFull: boolean
}

const SLOTS: LabSlot[] = [
  { id: "s-mon-x", channel: "x", weekday: 1, time: "08:00" },
  { id: "s-tue-x", channel: "x", weekday: 2, time: "08:00" },
  { id: "s-tue-li", channel: "linkedin", weekday: 2, time: "11:00" },
  { id: "s-thu-x", channel: "x", weekday: 4, time: "08:00" },
  { id: "s-thu-li", channel: "linkedin", weekday: 4, time: "11:00" },
  { id: "s-sat-x", channel: "x", weekday: 6, time: "09:30" },
]

function post(id: string, w: { idea: string; body: string }, channel: Channel, dayId: string, time: string, slotId: string | null, state: PostState = "queued", extra: Partial<LabPost> = {}): LabPost {
  return { id, versionId: `v-${id}`, idea: w.idea, channel, body: w.body, dayId, time, slotId, state, url: null, error: null, ...extra }
}

/**
 * The default week. Every state the page has to draw, once:
 * a slot that passed empty this morning (Mon 08:00, X), a post sent at
 * 09:10 with its receipt, one the platform refused at 12:30, one claimed
 * at 14:15 that nobody can say went, queued posts on both channels, an
 * open slot ahead (Thu 11:00 LinkedIn, Sat 09:30 X), a quiet Wednesday,
 * Friday and Sunday, two X posts three hours apart on Friday, and one
 * approved post with no time.
 */
function fixtures(): LabWeek {
  return {
    slots: SLOTS,
    posts: [
      post("p-sent", W.docs, "x", "2026-11-16", "09:10", null, "published", { url: "https://x.com/christer/status/1" }),
      post("p-failed", W.invoice, "x", "2026-11-16", "12:30", null, "failed", {
        error: "You are not allowed to create a Tweet with duplicate content.",
      }),
      post("p-sending", W.release, "x", "2026-11-16", "14:15", null, "sending", {
        error: "Quincy started sending this at 14:15 and has not heard back. Check the account before anyone tries again.",
      }),
      post("p-tue-x", W.backup, "x", "2026-11-17", "08:00", "s-tue-x"),
      post("p-tue-li", W.hiring, "linkedin", "2026-11-17", "11:00", "s-tue-li"),
      post("p-thu-x", W.pricing, "x", "2026-11-19", "08:00", "s-thu-x"),
      post("p-fri-a", W.standup, "x", "2026-11-20", "09:00", null),
      post("p-fri-b", W.onboarding, "x", "2026-11-20", "12:00", null),
    ],
    stranded: [{ versionId: "v-strand-1", idea: W.release.idea + ", again", channel: "x", body: W.release.body, reason: "slot-came-later" }],
    nextWeekFull: false,
  }
}

/**
 * The live account today, in shape (2026-11-16): two X slots (Mon 08:00,
 * Sat 09:30), nothing scheduled in any state, and one approved X version
 * with no time. Today is a Monday, so the 08:00 slot has passed empty.
 */
function real(): LabWeek {
  return {
    slots: [
      { id: "r-mon-x", channel: "x", weekday: 1, time: "08:00" },
      { id: "r-sat-x", channel: "x", weekday: 6, time: "09:30" },
    ],
    posts: [],
    stranded: [{ versionId: "v-real-1", idea: W.backup.idea, channel: "x", body: W.backup.body, reason: "slot-came-later" }],
    nextWeekFull: false,
  }
}

/** Every slot this week and next is taken, and two approved X posts wait with nowhere to go. */
function full(): LabWeek {
  return {
    slots: SLOTS,
    posts: [
      post("f-mon-x", W.docs, "x", "2026-11-16", "08:00", "s-mon-x", "published", { url: "https://x.com/christer/status/2" }),
      post("f-tue-x", W.backup, "x", "2026-11-17", "08:00", "s-tue-x"),
      post("f-tue-li", W.hiring, "linkedin", "2026-11-17", "11:00", "s-tue-li"),
      post("f-thu-x", W.pricing, "x", "2026-11-19", "08:00", "s-thu-x"),
      post("f-thu-li", W.onboarding, "linkedin", "2026-11-19", "11:00", "s-thu-li"),
      post("f-sat-x", W.standup, "x", "2026-11-21", "09:30", "s-sat-x"),
    ],
    stranded: [
      { versionId: "v-full-1", idea: W.invoice.idea, channel: "x", body: W.invoice.body, reason: "slots-full" },
      { versionId: "v-full-2", idea: W.release.idea, channel: "x", body: W.release.body, reason: "slots-full" },
    ],
    nextWeekFull: true,
  }
}

function firstRun(): LabWeek {
  return { slots: [], posts: [], stranded: [], nextWeekFull: false }
}

export function weekFor(s: Scenario): LabWeek {
  if (s === "real") return real()
  if (s === "full") return full()
  if (s === "first-run") return firstRun()
  return fixtures()
}

/** The connected channels (the live account: X only; the fixtures add LinkedIn). */
export function connectedFor(s: Scenario): Channel[] {
  return s === "real" || s === "first-run" ? ["x"] : ["x", "linkedin"]
}

/** The rhythm a new account starts with (lib/slots.ts `STARTER_RHYTHM`). */
export const STARTER = [
  { weekday: 2, time: "08:00" },
  { weekday: 4, time: "08:00" },
] as const

export const WEEKDAY_SHORT = WEEKDAY
export const WEEKDAY_LONG = LONG

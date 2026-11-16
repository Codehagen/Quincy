/**
 * The content every direction shows, so the shell is the only thing that
 * changes between them. One week of one person's account, told from the
 * same pull request the landing tells (#212, 41% to 68%), so a direction is
 * read against its reference picture word for word.
 *
 * Fixtures: nothing here is read from the database.
 */

export const USER = { name: "Christer Hagen", email: "christer@quincy.test", initials: "CH" }

export const POST = {
  did: "We cut our onboarding from nine screens to three.",
  happened: "People who finished signup, the week before and since:",
  figure: "41% → 68%",
  meant: "Every screen we removed was a question we never needed to ask.",
} as const

export const RECEIPT = [
  ["Read #212", "6 screens removed"],
  ["Found the number", "41% to 68%"],
  ["Drafted", "2 posts, held for your read"],
] as const

export const CONVERSATIONS = [
  { id: "c1", title: "The onboarding PR", at: "Tue" },
  { id: "c2", title: "Hiring post from the walk", at: "Sun" },
  { id: "c3", title: "Why Thursdays are slow", at: "Fri" },
] as const

export type Idea = { title: string; line: string }

export const IDEA_GROUPS: { source: string; at: string; ideas: Idea[] }[] = [
  {
    source: "3 ideas from yesterday’s merged PR",
    at: "GitHub · #212 · Mon 16:40",
    ideas: [
      { title: "Nine screens to three", line: "The number: finished signup went from 41% to 68% in a week." },
      { title: "The question we never needed", line: "‘How did you hear about us’ cost a fifth of signups." },
      { title: "Shipping a deletion", line: "The PR removed more lines than it added, and nobody missed them." },
    ],
  },
  {
    source: "2 ideas from your voice note",
    at: "Voice note · Sun walk · 4 min",
    ideas: [
      { title: "Hire for the second year", line: "What you said about the first hire who stayed." },
      { title: "The interview we dropped", line: "Take-home tasks out, a paid day in." },
    ],
  },
]

export type Slot = { day: string; date: string; items: { time: string; channel: string; title: string; state: string }[] }

export const WEEK: Slot[] = [
  { day: "Mon", date: "16", items: [{ time: "08:30", channel: "LinkedIn", title: "What a paid trial day taught us", state: "Posted · 1.6× your median" }] },
  { day: "Tue", date: "17", items: [] },
  { day: "Wed", date: "18", items: [{ time: "08:30", channel: "LinkedIn", title: "41% → 68% in a week", state: "Held for your read" }] },
  { day: "Thu", date: "19", items: [{ time: "09:00", channel: "X", title: "Nine screens to three", state: "Held for your read" }] },
  { day: "Fri", date: "20", items: [{ time: "12:00", channel: "LinkedIn", title: "Hire for the second year", state: "Approved" }] },
  { day: "Sat", date: "21", items: [] },
  { day: "Sun", date: "22", items: [] },
]

export const RESULTS = [
  { title: "What a paid trial day taught us", channel: "LinkedIn", at: "Mon 08:30", times: "1.6×", reads: "3,420 reads" },
  { title: "We stopped doing standups", channel: "X", at: "Thu 09:00", times: "0.8×", reads: "910 reads" },
  { title: "The bug a customer found first", channel: "LinkedIn", at: "Tue 08:30", times: "1.1×", reads: "2,350 reads" },
] as const

export const SOURCES = [
  { name: "GitHub", state: "live", line: "Read #212 · Mon 16:40" },
  { name: "Voice notes", state: "live", line: "Sun walk · 4 min" },
  { name: "Circleback", state: "off", line: "Not connected" },
] as const

/** What a setup or account page says, so every route has something honest on it. */
export const QUIET_PAGES: Record<string, { title: string; summary: string; rows: [string, string][] }> = {
  "/brain": {
    title: "Brain",
    summary: "What Quincy knows about how you write.",
    rows: [
      ["Voice", "Short sentences. A number on its own line."],
      ["Never", "‘Excited to announce’, emoji, hashtags."],
      ["Audience", "Founders and product people, early stage."],
    ],
  },
  "/channels": {
    title: "Channels",
    summary: "Where your posts go out.",
    rows: [
      ["LinkedIn", "Connected · Christer Hagen"],
      ["X", "Connected · @christer"],
    ],
  },
  "/rhythm": {
    title: "Rhythm",
    summary: "How often Quincy brings you something.",
    rows: [
      ["LinkedIn", "Wed and Fri, 08:30"],
      ["X", "Thu, 09:00"],
    ],
  },
  "/credits": { title: "Credits", summary: "What this month has cost.", rows: [["November", "$11.40 of $49"]] },
  "/settings/billing": { title: "Billing", summary: "Your plan.", rows: [["Plan", "$49 a month · renews 1 Dec"]] },
  "/settings": {
    title: "Settings",
    summary: "Your account.",
    rows: [
      ["Name", "Christer Hagen"],
      ["Time zone", "Europe/Oslo"],
    ],
  },
}

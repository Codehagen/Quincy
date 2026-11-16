import type { Draft, Version } from "@/lib/drafts"

/**
 * Fixtures for the Drafts lab. Fictional words, real shapes.
 *
 * Shaped on the live tables (read-only aggregates, 2026-11-16; DECISION.md,
 * "What the data says"): 110 drafts on one account, 109 waiting, every one
 * for X and one version each, 98 adapted from a saved post (90 handles), a
 * body of 168 / 203 / 232 characters at p10 / p50 / p90 in 3 or 4
 * paragraphs, no scheduled post at all, two X slots, and not one body that
 * `readBeats` can bracket. So most fixtures are X-only adaptations with no
 * number on its own line, and a few carry the rest of the states the page
 * must show (a LinkedIn twin, a three-beat story, every GoingOut kind).
 *
 * `quote` is **proposed**: the sentence of the saved post the draft leans
 * on. Nothing stores it today (a draft keeps `adapted_from_url` and
 * `_handle`, not the text, and no `source_item` id). Fixtures without it
 * render the way every real draft would.
 */

/**
 * Proposed: an X thread, as posts split on a line that is only "---". Nothing
 * in lib/ has a thread shape today (a version is one body); the lab needs
 * one to draw stacked posts. Round 2's post editor reads it; round 1 shows
 * the separators as text.
 */
export const THREAD_BREAK = /\n[ \t]*---[ \t]*\n/

export function threadPosts(text: string): string[] {
  return text.split(THREAD_BREAK).map((p) => p.trim())
}

export type LabVersion = Version & {
  /** Lab only: Post now fails for this one, with this sentence from the platform. */
  failsWith?: string
}

export type LabDraft = Omit<Draft, "versions"> & {
  kind: string
  /** Days old, for order and for the day groups. */
  age: number
  /** Proposed: the sentence of the saved post it leans on (see above). */
  quote?: { before?: string; line: string; after?: string }
  versions: LabVersion[]
}

let n = 0
const vid = () => `v_${(++n).toString(36)}`

function x(text: string, extra: Partial<LabVersion> = {}): LabVersion {
  return { id: vid(), channel: "x", label: "X", text, state: "writing", goingOut: null, hasSlot: true, sent: null, ...extra }
}
function li(text: string, extra: Partial<LabVersion> = {}): LabVersion {
  return { id: vid(), channel: "linkedin", label: "LinkedIn", text, state: "writing", goingOut: null, hasSlot: false, sent: null, ...extra }
}

function saved(handle: string, at: string, age: number): Pick<LabDraft, "from" | "age"> {
  return {
    age,
    from: { riffHook: "", sourceId: "x", sourceLabel: "Saved post", at, adaptedFrom: { url: `https://x.com/${handle}/status/1`, handle } },
  }
}
function own(sourceId: string, sourceLabel: string, hook: string, at: string, age: number): Pick<LabDraft, "from" | "age"> {
  return { age, from: { riffHook: hook, sourceId, sourceLabel, at, adaptedFrom: null } }
}

export const LAB_DRAFTS: LabDraft[] = [
  {
    id: "d01",
    idea: "Shipping the importer a week late was the right call, because the first version lost rows quietly.",
    kind: "Story",
    ...own("github", "GitHub", "The importer slipped a week and that saved us.", "Today", 0),
    versions: [
      x("I held the importer back a week. Everyone wanted it out on Friday.\n\nRows it would have dropped without a word on real files:\n412 → 0\n\nA late feature costs a week. A quiet one costs trust you never see leave."),
      li("I held our CSV importer back a week, and the team was not happy about it.\n\nOn real customer files, the Friday build dropped rows without saying so. After a week of fixing the edge cases:\n412 → 0\n\nA late feature costs you a week. A quiet failure costs trust, and you never see it leave."),
    ],
  },
  {
    id: "d02",
    idea: "Most onboarding checklists are written for the team that built them, not the person using them.",
    kind: "Opinion",
    ...saved("mara_ships", "Today", 0),
    quote: {
      before: "We rewrote our onboarding twice this year. ",
      line: "The checklist was a map of our org chart, not of the user's first hour.",
      after: " Third time we started from the support inbox.",
    },
    versions: [
      x("Our first checklist had nine steps. Every one of them was a team asking for a moment of attention.\n\nThe person signing up wanted one thing: to see their own data in the app.\n\nWrite the list from their first hour, not your org chart."),
    ],
  },
  {
    id: "d03",
    idea: "Writing the changelog first makes the feature smaller and clearer.",
    kind: "Behind the scenes",
    ...saved("devon.writes", "Today", 0),
    versions: [
      x("I've started writing the changelog entry before the code.\n\nIf I can't say it in two lines, the feature is two features. It keeps the scope honest.\n\nIt also means the release note is done on the day, not three weeks later."),
    ],
  },
  {
    id: "d04",
    idea: "Answering every reply for a month changed who shows up.",
    kind: "Story",
    ...own("notes", "Notes", "I answered every single reply for thirty days.", "Yesterday", 1),
    versions: [
      x("For thirty days I answered every reply, even the one-word ones.\n\nPeople who replied twice or more:\n6 → 23\n\nThe audience is not the number at the top. It's the names you start to recognise."),
    ],
  },
  {
    id: "d05",
    idea: "Pricing pages hide the one question buyers ask first.",
    kind: "Opinion",
    ...saved("pricingnerd", "Yesterday", 1),
    quote: { line: "Nobody reads the feature grid. They scroll straight to 'what happens when I go over'.", after: " Put that first." },
    versions: [
      x("Every pricing page I've read this week answers the question nobody asked first.\n\nWhat buyers want to know is what happens when they go over the limit.\n\nAnswer that at the top and the grid can stay where it is.\n\n#pricing #saas"),
    ],
  },
  {
    id: "d06",
    idea: "Small teams win by shipping smaller things more often.",
    kind: "Opinion",
    ...saved("hollis_k", "Yesterday", 1),
    // The same text twice: the twin notice (lib/drafts.ts `duplicates`).
    versions: [
      x("A small team doesn't win by doing what a big team does, slower.\n\nIt wins by shipping a smaller thing on Tuesday and fixing it on Wednesday, while the big team is still in review.\n\nSpeed is the only advantage you get for free."),
      li("A small team doesn't win by doing what a big team does, slower.\n\nIt wins by shipping a smaller thing on Tuesday and fixing it on Wednesday, while the big team is still in review.\n\nSpeed is the only advantage you get for free."),
    ],
  },
  {
    id: "d07",
    idea: "Demo days reward the demo, not the product.",
    kind: "Opinion",
    ...saved("ana.builds", "Sat", 2),
    versions: [
      x("I've judged four demo days this year. The best demos were rarely the best products.\n\nA demo rewards a clean path. A product lives on the messy ones.\n\nAsk to see the error state. That's where the real work is."),
    ],
  },
  {
    id: "d08",
    idea: "Removing a feature got more thank-yous than launching one.",
    kind: "Behind the scenes",
    ...own("github", "GitHub", "We deleted the dashboard tab and people thanked us.", "Sat", 2),
    versions: [
      x("We deleted the dashboard tab last week. Nobody had opened it in a month and it slowed every page.\n\nI expected complaints. We got eleven thank-you notes and zero tickets.\n\nSometimes the feature is the thing in the way."),
    ],
  },
  {
    id: "d09",
    idea: "The best interview question is about a decision you got wrong.",
    kind: "Opinion",
    ...saved("rubyhires", "Fri", 3),
    versions: [
      x("My favourite interview question: tell me about a call you made that turned out wrong, and what you did on the day you knew.\n\nThe answer tells me more than any take-home.\n\nPeople who can say 'I was wrong' early save you months."),
    ],
  },
  {
    id: "d10",
    idea: "A weekly note to customers beats a quarterly newsletter.",
    kind: "Behind the scenes",
    ...saved("sam_in_ops", "Fri", 3),
    versions: [
      x("We stopped the quarterly newsletter and started a five-line note every Friday.\n\nWhat shipped, what broke, what's next. No design, no images.\n\nReplies went from zero to a handful every week, and those handfuls became our roadmap. It turns out customers like being told things while they are still true, not three months later in a polished PDF nobody opens."),
    ],
  },
  {
    id: "d11",
    idea: "Docs are a product, and they decay like one.",
    kind: "Opinion",
    ...saved("tess.docs", "Thu", 4),
    versions: [
      x("Docs decay like code, just quieter. Nobody files a bug against a paragraph.\n\nWe now put a 'last checked' date on every page and review the oldest five each week.\n\nIt's boring. It's also why support tickets stopped quoting our own docs back at us."),
    ],
  },
  {
    id: "d12",
    idea: "I recorded a walk about why our app has no settings page.",
    kind: "Behind the scenes",
    ...own("voice", "Voice note", "Why our app has no settings page.", "Thu", 4),
    versions: [x("Why our app has no settings page.")],
  },
  {
    id: "d13",
    idea: "Status pages should say what you're doing, not just that something is wrong.",
    kind: "Opinion",
    ...saved("oncall_otto", "Wed", 5),
    versions: [
      x("A red dot on a status page tells me something is wrong. I already knew that.\n\nTell me what you're trying, and when you'll say more.\n\nThe update matters more than the fix time."),
    ],
  },
  {
    id: "d14",
    idea: "We moved standup to writing and got the morning back.",
    kind: "Story",
    ...own("notes", "Notes", "Written standup gave us our mornings back.", "Wed", 5),
    versions: [
      x("We swapped the 9:30 call for three written lines in a channel.\n\nHours of meetings a week, for the team of six:\n7.5 → 1\n\nThe call was never where the work got decided. It was where it got described."),
    ],
  },
  {
    id: "d15",
    idea: "Good defaults are the most underrated design decision.",
    kind: "Opinion",
    ...saved("lin_design", "Tue", 6),
    versions: [
      x("Most people never change a default. That makes the default the real product.\n\nWe spent a week on the first screen's defaults and it moved activation more than the redesign did.\n\nDesign the thing people won't touch."),
    ],
  },
  {
    id: "d16",
    idea: "You don't need a launch. You need a reason to tell people.",
    kind: "Opinion",
    ...saved("jordan.gtm", "Tue", 6),
    versions: [
      x("We never did a launch. We did forty small posts, each about one thing that changed.\n\nEach one was a reason to tell someone.\n\nA launch is one reason. You need a steady supply."),
    ],
  },
  {
    id: "d17",
    idea: "The fastest way to learn a codebase is to fix its smallest bug.",
    kind: "Behind the scenes",
    ...saved("priya_codes", "13 Nov", 8),
    versions: [
      x("New people on the team fix one tiny bug on their first day.\n\nNot because we need it fixed. Because it walks them through the build, the review and the deploy before they have time to be scared of any of it."),
    ],
  },
  {
    id: "d18",
    idea: "A roadmap is a list of bets, so write the odds next to it.",
    kind: "Opinion",
    ...saved("felix_pm", "12 Nov", 9),
    versions: [
      x("Every line on a roadmap is a bet. We started writing how sure we are next to each one.\n\nIt changed the meetings. People argue about the odds instead of the dates.\n\nAnd nobody is surprised when a long shot slips."),
    ],
  },
  {
    id: "d19",
    idea: "Support tickets are the best user research you already paid for.",
    kind: "Opinion",
    ...saved("helpdesk_hana", "10 Nov", 11),
    versions: [
      x("Before you book user interviews, read last month's support tickets. All of them.\n\nYou already paid for that research. People wrote it down, in their own words, while it hurt.\n\nInterviews tell you what people say. Tickets tell you where they got stuck."),
    ],
  },
  {
    id: "d20",
    idea: "A slow week is when the real work gets done.",
    kind: "Behind the scenes",
    ...saved("quiet.ceo", "6 Nov", 15),
    versions: [
      x("Weeks with nothing to announce used to make me nervous.\n\nNow I know they're the weeks where the hard part happens.\n\nThe launch is just the day you notice."),
    ],
  },
  {
    id: "d21",
    idea: "Pick one metric your customer would recognise.",
    kind: "Opinion",
    ...saved("metric_mo", "2 Nov", 19),
    versions: [
      x("If your customer wouldn't recognise the number, it's your number, not theirs.\n\nWe swapped 'weekly active' for 'invoices sent'. Same data, a sentence a customer could say back to us.\n\nPick the metric they'd brag about."),
    ],
  },

  {
    id: "d22",
    idea: "A one-question onboarding email, told as a thread: one beat per post.",
    kind: "Story",
    ...own("notes", "Notes", "The one-question email, as a thread.", "Today", 0),
    // A three-post thread (proposed shape): did, happened, meant, one per post.
    versions: [
      x("I deleted our nine-paragraph welcome email and sent one line instead: what are you hoping this fixes for you?\n---\nReplies in the first week:\n4 → 31\n---\nPeople answer a question. They skip a brochure. The replies are now the first page of our roadmap."),
    ],
  },

  /* ── Decided: one of each thing that can happen after Approve ───────── */
  {
    id: "d30",
    idea: "The first support hire should be an engineer.",
    kind: "Opinion",
    ...saved("kai_support", "Fri", 3),
    versions: [
      x("Our first support hire was an engineer. Best call we made that year.\n\nThey fixed the cause instead of answering the symptom, forty times.\n\nSupport is where the product tells you what's wrong.", { state: "approved", goingOut: "Tue 08:00" }),
    ],
  },
  {
    id: "d31",
    idea: "We stopped estimating in days.",
    kind: "Behind the scenes",
    ...own("notes", "Notes", "No more day estimates.", "Wed", 5),
    versions: [
      x("We stopped estimating in days. Now it's 'this week' or 'not this week'.\n\nThe plans got shorter and we hit more of them.\n\nPrecision you don't have is just a guess with decimals.", { state: "approved", sent: { state: "published", url: "https://x.com/you/status/2", at: "Fri 08:00" } }),
    ],
  },
  {
    id: "d32",
    idea: "Every team needs one person who reads the logs for fun.",
    kind: "Opinion",
    ...saved("logs_lou", "Thu", 4),
    versions: [
      x("Every team needs one person who reads the logs for fun.\n\nThey find the bug before the customer does, and they never call it a fire.\n\nHire for curiosity. It's cheaper than incidents.", {
        state: "approved",
        sent: { state: "failed", error: "X said: You are not allowed to create a post with duplicate content." },
      }),
    ],
  },
  {
    id: "d33",
    idea: "Write the error message before you write the feature.",
    kind: "Opinion",
    ...own("github", "GitHub", "Error message first.", "Thu", 4),
    versions: [
      li("Before we build a feature now, we write its error messages first.\n\nIf we can't explain what went wrong in one sentence, we don't understand the feature yet.\n\nIt has saved us from building three things this quarter.", { state: "approved", hasSlot: false, failsWith: "LinkedIn isn't connected, so nothing went out. Connect it on Channels and try again." }),
    ],
  },
  {
    id: "d34",
    idea: "A shorter onboarding email got more replies.",
    kind: "Story",
    ...own("notes", "Notes", "One question instead of a brochure.", "Tue", 6),
    versions: [
      x("I cut our onboarding email down to one question.\n\nReplies in the first week:\n31\n\nPeople answer a question. They skip a brochure.", { state: "approved", sent: { state: "sending" } }),
    ],
  },
  {
    id: "d35",
    idea: "Free trials should end with a conversation, not a paywall.",
    kind: "Opinion",
    ...saved("trial_tara", "12 Nov", 9),
    versions: [
      x("Our trial used to end with a paywall. Now it ends with a two-line note from me asking how it went.\n\nHalf of them answer. Most of the answers are the roadmap.", { state: "approved", hasSlot: true }),
    ],
  },
]

/** Whose feed the preview draws: the shell's stand-in account (app/prototypes/shell.tsx). */
export const LAB_ACCOUNT = { name: "Christer Hagen", handle: "christer", initials: "CH" }

/** The real queue is 110 deep. This many waiting rows, older ones repeated, for the density check. */
export const REAL_DEPTH = 110

/** The lab's X slots, in order (live: two X slots, Tuesday and Thursday mornings). */
export const X_SLOTS = ["Tue 08:00", "Thu 08:00", "Tue 25 Nov, 08:00", "Thu 27 Nov, 08:00", "Tue 2 Dec, 08:00"]

/** Deepen the queue to the real depth: older copies of the waiting fixtures, new ids, ages past three weeks. */
export function deepen(drafts: LabDraft[], depth: number): LabDraft[] {
  if (drafts.length >= depth) return drafts
  // Waiting, one version, and a real body (not the hook-only fallback).
  const waiting = drafts.filter((d) => d.versions.length === 1 && d.versions[0]!.state === "writing" && d.versions[0]!.text.includes("\n\n"))
  const out = [...drafts]
  let i = 0
  const months = ["Oct", "Sep", "Aug"]
  while (out.length < depth && waiting.length > 0) {
    const src = waiting[i % waiting.length]!
    const age = 22 + i
    const month = months[Math.min(2, Math.floor(age / 30))]!
    out.push({
      ...src,
      id: `${src.id}_${i}`,
      age,
      from: { ...src.from, at: `${(28 - (i % 27)).toString()} ${month}` },
      versions: src.versions.map((v) => ({ ...v, id: `${v.id}_${i}` })),
    })
    i++
  }
  return out
}

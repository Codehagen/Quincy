/**
 * Seeds a starter brain so the read path has something to read.
 * Run with: npx tsx --env-file=.env.local scripts/seed-brain.ts <email>
 *
 * Re-runnable: putPage upserts on (user_id, slug) and snapshots what it
 * replaces, so running this twice leaves one brain and a version history.
 */
import { eq } from "drizzle-orm"

import { putPage, type PolicyData } from "../lib/brain"
import { db } from "../lib/db"
import { user } from "../lib/schema"

const X_STRATEGY: PolicyData = {
  platform: "x",
  goal: "Grow to 15,000 followers",
  positioning:
    "The person you follow to see what building and scaling in public actually looks like, with the tradeoffs and the receipts.",
  audience: {
    primary:
      "Founders and operators building real businesses who want practical judgment from someone actively building.",
    secondary:
      "Product-minded builders who care about shipping, customer insight and product taste.",
  },
  pillars: [
    {
      name: "Product and building",
      weight: 65,
      note: "Lessons from my own work: customer learning, shipping decisions, tradeoffs.",
    },
    {
      name: "Opinion and lessons",
      weight: 35,
      note: "Short principles and contrarian reframes that still sound earned.",
    },
  ],
  cadence: { postsPerDay: 1, postsPerWeek: 10 },
  windows: ["07:00", "11:00", "12:00"],
  leanInto: [
    "Story-first structure: open with a moment or a receipt before the lesson",
    "Concrete proof: revenue, customer outcomes, product decisions",
    "Direct, specific, low-fluff language",
  ],
  avoid: [
    "Inventing personal stories, private details, numbers, client names or results",
    "Generic advice that could come from anyone",
    "Thought-leader posturing and polished hindsight that erases the messy middle",
  ],
}

/**
 * A second and third channel, so the read path exercises a *list* rather than
 * a single row. One channel made /channels look correct while hiding every
 * question a list asks: ordering, differing cadences, differing pillar counts.
 *
 * Each split still sums to 100 — putPage enforces it, and a seed that could not
 * survive its own invariant would be a bad thing to copy from.
 */
const LINKEDIN_STRATEGY: PolicyData = {
  platform: "linkedin",
  goal: "Become the default read for Nordic founders hiring their first team",
  positioning:
    "The founder who writes down what hiring, pricing and shipping actually cost, while it is still happening.",
  audience: {
    primary:
      "Founders and early operators in the Nordics who are about to make a decision they cannot undo cheaply.",
    secondary: "Engineers deciding whether to join a small company at all.",
  },
  pillars: [
    {
      name: "Founder lessons",
      weight: 45,
      note: "What a decision cost, told with the number attached.",
    },
    {
      name: "Hiring",
      weight: 30,
      note: "How roles were scoped, what the first hire changed, what went wrong.",
    },
    {
      name: "Product",
      weight: 25,
      note: "Why something shipped in the shape it did.",
    },
  ],
  cadence: { postsPerDay: 1, postsPerWeek: 3 },
  windows: ["08:00"],
  leanInto: [
    "One decision per post, with the tradeoff named",
    "Plain Norwegian-English: short sentences, no consultant register",
    "Numbers that are actually mine",
  ],
  avoid: [
    "Engagement-bait openers and one-line-per-paragraph formatting",
    "Congratulating myself in public",
    "Reposting other people's frameworks as if they were earned here",
  ],
}

const THREADS_STRATEGY: PolicyData = {
  platform: "threads",
  goal: "Keep a daily, lower-stakes presence that feeds the longer writing",
  positioning:
    "The same person as on X, thinking out loud earlier and with less polish.",
  audience: {
    primary: "Builders who follow the process, not just the conclusions.",
  },
  pillars: [
    {
      name: "Building in public",
      weight: 60,
      note: "What I touched today and what surprised me.",
    },
    {
      name: "Personal",
      weight: 40,
      note: "Life outside the product, without turning it into a lesson.",
    },
  ],
  cadence: { postsPerDay: 1, postsPerWeek: 7 },
  windows: ["17:00"],
  leanInto: [
    "Unfinished thoughts, posted before they resolve",
    "Replies over broadcasts",
  ],
  avoid: [
    "Cross-posting the X version verbatim",
    "Threads of more than three posts — that belongs somewhere else",
  ],
}

async function main() {
  const email = process.argv[2]
  if (!email) throw new Error("Usage: seed-brain.ts <email>")

  const [owner] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1)

  if (!owner) throw new Error(`No user with email ${email}`)

  await putPage({
    userId: owner.id,
    slug: "human",
    kind: "identity",
    title: "Backstory",
    // Joined on a blank line, not a single newline. This page is rendered as
    // markdown now, and markdown folds a single newline into the paragraph
    // above it — the old four-lines-on-four-lines version came out as one
    // run-on sentence the moment it stopped being a raw textarea.
    //
    // Paragraphs rather than bullets on purpose. Memory pages are the compiled,
    // bulleted ones because a machine wrote them; this is the one page a person
    // writes about themselves, and a bullet list of facts is the thing a brain
    // can already infer. Prose is where the texture lives.
    body: [
      "Christer Hagen. Builds in public and ships fast.",
      "Sold two SaaS companies in one year. Docdir was acquired by Broker AS in April 2026. Runs a small VC fund with eight pre-seed companies and one exit.",
      "Commercial real estate broker in Northern Norway alongside the building.",
    ].join("\n\n"),
  })

  await putPage({
    userId: owner.id,
    slug: "voice",
    kind: "voice",
    title: "Voice",
    data: {
      rules: [
        "Write in Norwegian unless the user asks for another language.",
        "The voice is his own. Never imitate another writer.",
        "Never use the framing 'we have been building it for a while'.",
        "No em dashes.",
      ],
    },
  })

  await putPage({
    userId: owner.id,
    slug: "instructions",
    kind: "instruction",
    title: "Rules",
    data: {
      rules: [
        "Never invent numbers, client names, dates or outcomes. If a fact is not in the brain, ask for it.",
      ],
    },
  })

  await putPage({
    userId: owner.id,
    slug: "strategy/x",
    kind: "policy",
    title: "X",
    data: X_STRATEGY,
  })

  await putPage({
    userId: owner.id,
    slug: "strategy/linkedin",
    kind: "policy",
    title: "LinkedIn",
    data: LINKEDIN_STRATEGY,
  })

  await putPage({
    userId: owner.id,
    slug: "strategy/threads",
    kind: "policy",
    title: "Threads",
    data: THREADS_STRATEGY,
  })

  console.log(`seeded 6 brain pages for ${email}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

/**
 * Seeds five stories and five notes so the brain's two collections have
 * something in them to look at.
 *
 * Run with:   npx tsx --env-file=.env.local scripts/seed-stories.ts <email>
 * Remove with: npx tsx --env-file=.env.local scripts/seed-stories.ts <email> --remove
 *
 * Every fact below already exists in the starter brain or was said out loud —
 * the Docdir exit, the two SaaS sales, the eight-company fund, the broker work
 * in Northern Norway. Nothing here is invented, and that is deliberate: this
 * content sits in a brain a model reads before it drafts, and the Instructions
 * page says in as many words that Quincy may never invent numbers, client
 * names, dates or outcomes. Mock stories carrying mock receipts is exactly the
 * failure that rule exists to prevent.
 *
 * Provenance is mixed on purpose, because it is what the tree renders:
 * `inferred` is Quincy's unconfirmed read and may not carry proof, `confirmed`
 * has been checked and may, and `user` is a page you have corrected — those are
 * the ones that show the mark and that Heartbeat stops rewriting.
 */
import { eq, inArray, like, and } from "drizzle-orm"

import { proposePage, putPage, type StoryData } from "../lib/brain"
import { db } from "../lib/db"
import { user } from "../lib/schema"
import { brainPage } from "../lib/schema-app"

type Seed = {
  slug: string
  title: string
  body: string
  provenance: "inferred" | "confirmed" | "user"
  data?: Omit<StoryData, "narrative">
}

const STORIES: Seed[] = [
  {
    slug: "stories/docdir-exit",
    title: "Built Docdir and exited to Broker AS",
    provenance: "confirmed",
    body: [
      "## How it started",
      "",
      "Docdir was built on evenings and weekends. It was never a full-time company, and for most of its life it was not obviously going to become one.",
      "",
      "The part worth telling is the boring part: the product got made because there were users to answer to, not because there was a plan to raise.",
      "",
      "Broker AS acquired it in April 2026.",
    ].join("\n"),
    data: {
      point: "A side project can become a real exit if you talk to users first.",
      hook: "Docdir was never a full-time company.",
      quotes: ["Vi jobbet aldri fulltid"],
      proof: ["Broker AS acquired Docdir in April 2026"],
      useFor: ["side projects", "exits without VC"],
      theme: "Startup exits",
    },
  },
  {
    slug: "stories/two-exits-one-year",
    title: "Two SaaS companies sold in one year",
    provenance: "confirmed",
    body: [
      "## The year two things sold",
      "",
      "Selling one company is a story. Selling two in the same year is mostly a lesson about what you were doing the four years before that.",
      "",
      "Neither sale was the plan. Both were the result of building something a specific buyer eventually needed more than we did.",
    ].join("\n"),
    data: {
      point: "Back-to-back exits are the visible end of work that was invisible for years.",
      hook: "Two companies sold in one year. Neither was the plan.",
      quotes: [],
      proof: ["Two SaaS companies sold within one year"],
      useFor: ["founder story", "the long middle"],
      theme: "Startup exits",
    },
  },
  {
    slug: "stories/hodget-in-the-open",
    title: "Why Hodget is open source",
    provenance: "inferred",
    body: [
      "## Building the hedge fund in public",
      "",
      "Hodget is an AI hedge fund project, and it is open source on purpose.",
      "",
      "- Built on Next.js and Neon",
      "- Started as a side project and is being taken seriously",
      "- Focused on the Norwegian market",
      "",
      "Building it in the open means the decisions are on record — including the ones that turn out wrong.",
    ].join("\n"),
    data: {
      point: "Working in the open makes the wrong turns part of the record, not something to explain away later.",
      hook: "The hedge fund is open source.",
      quotes: [],
      proof: [],
      useFor: ["building in public", "open source"],
      theme: "Building in public",
    },
  },
  {
    slug: "stories/broker-and-builder",
    title: "Broker by day, builder by night",
    provenance: "inferred",
    body: [
      "## Two jobs that feed each other",
      "",
      "Commercial real estate in Northern Norway is the day job. The building happens alongside it, not instead of it.",
      "",
      "The useful part is that one keeps the other honest: a broker has to describe things people will pay for, and so does a product.",
    ].join("\n"),
    data: {
      point: "A day job in sales is training for describing a product people will pay for.",
      hook: "Commercial real estate is the day job.",
      quotes: [],
      proof: [],
      useFor: ["operator judgment", "the non-obvious background"],
      theme: "Operator lessons",
    },
  },
  {
    slug: "stories/eight-and-one",
    title: "A small fund, eight companies, one exit",
    provenance: "user",
    body: [
      "## What a small fund actually looks like",
      "",
      "Eight pre-seed companies. One exit so far.",
      "",
      "That ratio is the whole story, and it is the number most fund updates find a way not to say plainly.",
    ].join("\n"),
    data: {
      point: "Saying the real ratio out loud is rarer than having a good one.",
      hook: "Eight companies. One exit. That is the whole update.",
      quotes: [],
      proof: ["Small VC fund with eight pre-seed companies and one exit"],
      useFor: ["investing", "saying the quiet number"],
      theme: "Investing",
    },
  },
]

const NOTES: Seed[] = [
  {
    slug: "memory/how-you-work",
    title: "How you work",
    provenance: "inferred",
    body: [
      "## Shipping",
      "",
      "- Builds in public and ships fast",
      "- Wants one decisive recommendation with the reasoning, not a menu of options",
      "- Reads the diff before it lands rather than after",
    ].join("\n"),
  },
  {
    slug: "memory/what-you-are-building",
    title: "What you are building",
    provenance: "inferred",
    body: [
      "## In flight",
      "",
      "- **Quincy** — the writing agent this brain belongs to",
      "- **Hodget** — an open source AI hedge fund on Next.js and Neon",
      "- **Advanti Estate** — commercial real estate in Northern Norway",
      "",
      "They run in parallel rather than in sequence.",
    ].join("\n"),
  },
  {
    slug: "memory/who-you-write-for",
    title: "Who you write for",
    provenance: "inferred",
    body: [
      "## The reader",
      "",
      "Founders and operators building real businesses, who want practical judgment from someone actively building rather than someone recapping.",
      "",
      "Secondary: product-minded builders who care about shipping and taste.",
    ].join("\n"),
  },
  {
    slug: "memory/language-and-voice",
    title: "Language and voice",
    provenance: "inferred",
    body: [
      "## How it should sound",
      "",
      "- Norwegian unless the language is specified otherwise",
      "- The voice is his own — no imitation of another writer",
      "- No em dashes",
      "- Never the framing *we have been building it for a while*",
    ].join("\n"),
  },
  {
    slug: "memory/where-to-find-you",
    title: "Where to find you",
    provenance: "user",
    body: [
      "## Handles",
      "",
      "- GitHub: `Codehagen`",
      "- X: `@CodeHagen`",
    ].join("\n"),
  },
]

async function main() {
  const email = process.argv[2]
  const remove = process.argv.includes("--remove")

  if (!email) {
    throw new Error(
      "Usage: seed-stories.ts <email> [--remove]"
    )
  }

  const [owner] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1)

  if (!owner) throw new Error(`No user with email ${email}`)

  const all = [...STORIES, ...NOTES]

  if (remove) {
    await db
      .delete(brainPage)
      .where(
        and(
          eq(brainPage.userId, owner.id),
          inArray(
            brainPage.slug,
            all.map((s) => s.slug)
          )
        )
      )
    const left = await db
      .select({ slug: brainPage.slug })
      .from(brainPage)
      .where(
        and(eq(brainPage.userId, owner.id), like(brainPage.slug, "stories/%"))
      )
    console.log(
      `removed ${all.length} seeded pages from ${email} (${left.length} stories left)`
    )
    return
  }

  for (const seed of all) {
    const kind = seed.slug.startsWith("stories/") ? "story" : "memory"

    // `inferred` is what Quincy has extracted but you have not seen, so it goes
    // in through proposePage — the path that refuses to let it carry proof.
    // Anything already confirmed or corrected is written directly.
    if (seed.provenance === "inferred") {
      await proposePage({
        userId: owner.id,
        slug: seed.slug,
        kind,
        title: seed.title,
        body: seed.body,
        data: seed.data ?? {},
        source: "conversation:seed",
      })
      continue
    }

    await putPage({
      userId: owner.id,
      slug: seed.slug,
      kind,
      title: seed.title,
      body: seed.body,
      data: seed.data ?? {},
      provenance: seed.provenance,
    })
  }

  console.log(
    `seeded ${STORIES.length} stories and ${NOTES.length} notes for ${email}`
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

/**
 * Seeds five stories and five notes so the brain's two collections have
 * something in them to look at.
 *
 * Run with:   npx tsx --env-file=.env.local scripts/seed-stories.ts <email>
 * Remove with: npx tsx --env-file=.env.local scripts/seed-stories.ts <email> --remove
 *
 * The person is a fictional persona — Christer, who builds Tidewell, a booking
 * tool for small harbours (the same product the setup prototypes use). Every
 * fact below already exists in the starter brain from seed-brain.ts — the
 * Logline sale, the nine harbours, the summers at the Saltvik guest harbour.
 * Nothing here goes beyond that page, and that is deliberate: this
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
import { requireTestTarget } from "./target-guard"

type Seed = {
  slug: string
  title: string
  body: string
  provenance: "inferred" | "confirmed" | "user"
  data?: Omit<StoryData, "narrative">
}

const STORIES: Seed[] = [
  {
    slug: "stories/logline-exit",
    title: "Built Logline and sold it to Northwind Marine",
    provenance: "confirmed",
    body: [
      "## How it started",
      "",
      "Logline was built on evenings and weekends. It was never a full-time company, and for most of its life it was not obviously going to become one.",
      "",
      "The part worth telling is the boring part: the product got made because there were users to answer to, not because there was a plan to raise.",
      "",
      "Northwind Marine acquired it in April 2026.",
    ].join("\n"),
    data: {
      point: "A side project can become a real exit if you talk to users first.",
      hook: "Logline was never a full-time company.",
      quotes: ["Vi jobbet aldri fulltid"],
      proof: ["Northwind Marine acquired Logline in April 2026"],
      useFor: ["side projects", "exits without VC"],
      theme: "Startup exits",
    },
  },
  {
    slug: "stories/nine-harbours",
    title: "Nine harbours before the first hire",
    provenance: "confirmed",
    body: [
      "## The long middle",
      "",
      "Nine harbours use Tidewell now. Each one was signed in person, on a dock, by the one person who builds it.",
      "",
      "None of them came from a launch. All of them came from showing a harbour master the berth map and waiting for the question.",
    ].join("\n"),
    data: {
      point: "Early customers are the visible end of work that was invisible for months.",
      hook: "Nine harbours. No launch.",
      quotes: [],
      proof: ["Tidewell is used by nine harbours"],
      useFor: ["founder story", "the long middle"],
      theme: "Building Tidewell",
    },
  },
  {
    slug: "stories/tidewell-in-the-open",
    title: "Why Tidewell's berth map is open source",
    provenance: "inferred",
    body: [
      "## Building the berth map in public",
      "",
      "The berth map is the part of Tidewell every harbour sees, and it is open source on purpose.",
      "",
      "- Built on Next.js and Neon",
      "- Started as a weekend sketch and is being taken seriously",
      "- Made for small harbours, not marinas with a front desk",
      "",
      "Building it in the open means the decisions are on record — including the ones that turn out wrong.",
    ].join("\n"),
    data: {
      point: "Working in the open makes the wrong turns part of the record, not something to explain away later.",
      hook: "The berth map is open source.",
      quotes: [],
      proof: [],
      useFor: ["building in public", "open source"],
      theme: "Building in public",
    },
  },
  {
    slug: "stories/harbour-and-builder",
    title: "Harbour master by summer, builder all year",
    provenance: "inferred",
    body: [
      "## Two jobs that feed each other",
      "",
      "Every summer is spent running the guest harbour in Saltvik. The building happens alongside it, not instead of it.",
      "",
      "The useful part is that one keeps the other honest: the harbour is where the product's users are, and every phone call at 11pm is a feature request.",
    ].join("\n"),
    data: {
      point: "Doing your users' job is the fastest way to find out what to build.",
      hook: "Every summer I run a guest harbour.",
      quotes: [],
      proof: [],
      useFor: ["operator judgment", "the non-obvious background"],
      theme: "Operator lessons",
    },
  },
  {
    slug: "stories/one-product-sold",
    title: "One side project sold, one still building",
    provenance: "user",
    body: [
      "## What a small exit actually looks like",
      "",
      "One logbook app sold. One booking tool still being built.",
      "",
      "That is the whole story, and it is the part most founder updates find a way not to say plainly.",
    ].join("\n"),
    data: {
      point: "Saying the real size of a win out loud is rarer than having a big one.",
      hook: "One small exit. That is the whole update.",
      quotes: [],
      proof: ["Northwind Marine acquired Logline in April 2026"],
      useFor: ["small exits", "saying the quiet number"],
      theme: "Startup exits",
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
      "- **Tidewell** — a booking tool for small harbours, on Next.js and Neon",
      "- **Saltvik guest harbour** — run every summer",
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
      "- GitHub: `christer-example`",
      "- X: `@christer_example`",
    ].join("\n"),
  },
]

async function main() {
  const email = requireTestTarget(process.argv[2], "seed-stories.ts")
  const remove = process.argv.includes("--remove")

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

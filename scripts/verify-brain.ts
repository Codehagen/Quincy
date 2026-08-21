/**
 * Exercises the whole brain layer against Neon without a model in the loop.
 * Run with: npx tsx --env-file=.env.local scripts/verify-brain.ts
 *
 * Covers the invariants, because they are the point: the write contract is
 * only worth having if a bad write actually fails. Run it whenever lib/brain.ts
 * is touched.
 */
import { eq } from "drizzle-orm"

import {
  appendEvent,
  applyCorrection,
  BrainInvariantError,
  confirmPage,
  getBrain,
  getEvents,
  getPage,
  proposePage,
  putPage,
  renderBrain,
  RULE_CAP,
  type PolicyData,
  type StoryData,
} from "../lib/brain"
import { db } from "../lib/db"
import { brainPage, brainPageVersion } from "../lib/schema-app"
import { user } from "../lib/schema"

function check(label: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`)
  if (!ok) process.exitCode = 1
}

async function rejects(label: string, fn: () => Promise<unknown>, needle: string) {
  try {
    await fn()
    check(label, false, "no error thrown")
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    check(
      label,
      error instanceof BrainInvariantError && message.includes(needle),
      message
    )
  }
}

const POLICY: PolicyData = {
  platform: "x",
  goal: "Grow to 15,000 followers",
  positioning: "Building in public, with receipts",
  audience: { primary: "Founders and operators" },
  pillars: [
    { name: "Product and building", weight: 65 },
    { name: "Opinion and lessons", weight: 35 },
  ],
  cadence: { postsPerDay: 1, postsPerWeek: 10 },
  windows: ["07:00", "11:00", "12:00"],
  leanInto: ["Story-first structure"],
  avoid: ["Inventing numbers"],
}

/** The narrative moved to the page body. This is the selection metadata. */
const STORY_NARRATIVE =
  "Built Docdir on evenings and weekends, then Broker AS acquired it."

const STORY: StoryData = {
  point: "A side project can become a real exit if you talk to users first.",
  hook: "Det er ikke mange som har hørt om Docdir",
  quotes: ["Vi jobbet aldri fulltid"],
  proof: ["Broker AS acquired Docdir in April 2026"],
  useFor: ["side projects", "exits without VC"],
  theme: "Startup exits",
}

async function main() {
  const email = process.argv[2] ?? "christer@quincy.test"
  const [owner] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1)

  if (!owner) throw new Error(`No user with email ${email}`)

  // Explicit teardown first, so a failed previous run cannot pass this one.
  await db.delete(brainPage).where(eq(brainPage.userId, owner.id))

  console.log("\n=== write and read back ===")
  await putPage({
    userId: owner.id,
    slug: "human",
    kind: "identity",
    title: "My Human",
    body: "Christer Hagen. Builds in public. Writes in Norwegian unless asked.",
  })
  await putPage({
    userId: owner.id,
    slug: "voice",
    kind: "voice",
    title: "Voice",
    data: { rules: ["Never imitate anyone else", "No thought-leader posturing"] },
  })
  await putPage({
    userId: owner.id,
    slug: "strategy/x",
    kind: "policy",
    title: "X Strategy",
    data: POLICY,
  })

  const pages = await getBrain(owner.id)
  check("three pages stored", pages.length === 3, `got ${pages.length}`)
  check(
    "ordering is stable",
    pages.map((p) => p.kind).join(",") === "identity,policy,voice",
    pages.map((p) => p.kind).join(",")
  )

  console.log("\n=== invariants ===")
  await rejects(
    "rule cap is enforced",
    () =>
      putPage({
        userId: owner.id,
        slug: "voice",
        kind: "voice",
        title: "Voice",
        data: { rules: Array.from({ length: RULE_CAP + 1 }, (_, i) => `rule ${i}`) },
      }),
    `over the ${RULE_CAP} cap`
  )

  await rejects(
    "pillar weights must sum to 100",
    () =>
      putPage({
        userId: owner.id,
        slug: "strategy/bad",
        kind: "policy",
        title: "Bad",
        data: { ...POLICY, pillars: [{ name: "One", weight: 60 }] },
      }),
    "sum to 60"
  )

  await rejects(
    "a story needs a point",
    () =>
      putPage({
        userId: owner.id,
        slug: "stories/pointless",
        kind: "story",
        title: "Pointless",
        data: { ...STORY, point: "" },
      }),
    "without a point is a note"
  )

  await rejects(
    "unreviewed extraction may not carry proof",
    () =>
      proposePage({
        userId: owner.id,
        slug: "stories/docdir",
        kind: "story",
        title: "Docdir",
        data: STORY,
        source: "conversation:test",
      }),
    "may not supply proof",
  )

  console.log("\n=== provenance ===")
  await proposePage({
    userId: owner.id,
    slug: "stories/docdir",
    kind: "story",
    title: "Built Docdir and exited to Broker AS",
    body: STORY_NARRATIVE,
    data: { ...STORY, proof: [] },
    source: "conversation:test",
  })
  const proposed = await getPage(owner.id, "stories/docdir")
  check("proposal lands as inferred", proposed?.provenance === "inferred")

  await confirmPage(owner.id, "stories/docdir")
  const confirmed = await getPage(owner.id, "stories/docdir")
  check("confirm promotes to confirmed", confirmed?.provenance === "confirmed")

  await putPage({
    userId: owner.id,
    slug: "stories/docdir",
    kind: "story",
    title: "Built Docdir and exited to Broker AS",
    body: STORY_NARRATIVE,
    data: STORY,
    provenance: "confirmed",
  })
  const withProof = await getPage(owner.id, "stories/docdir")
  check(
    "confirmed story may carry proof",
    ((withProof?.data as StoryData).proof ?? []).length === 1
  )
  check("story narrative lives in the body", withProof?.body === STORY_NARRATIVE)

  // The regression the prose editor guards against. Editing a story's prose is
  // a correction, not a save: applyCorrection merges `data`, while putPage
  // defaults it to {} — so routing a body-only edit through the wrong one loses
  // the point, hook, proof and use-for tags that decide when the story is used.
  await applyCorrection({
    userId: owner.id,
    slug: "stories/docdir",
    patch: { body: "Rewritten by hand." },
    note: "Edited the narrative",
  })
  const edited = await getPage(owner.id, "stories/docdir")
  check("body-only correction rewrites the prose", edited?.body === "Rewritten by hand.")
  check(
    "body-only correction keeps the selection metadata",
    (edited?.data as StoryData)?.point === STORY.point &&
      ((edited?.data as StoryData)?.proof ?? []).length === 1
  )

  console.log("\n=== versions and events ===")
  const versions = await db
    .select()
    .from(brainPageVersion)
    .where(eq(brainPageVersion.pageId, withProof!.id))
  check("previous state snapshotted", versions.length >= 1, `${versions.length} versions`)

  await appendEvent({
    pageId: withProof!.id,
    source: "conversation:test",
    summary: "Mentioned the Docdir exit again",
  })
  const events = await getEvents(withProof!.id)
  check("events append, never replace", events.length >= 3, `${events.length} events`)

  console.log("\n=== corrections ===")
  await applyCorrection({
    userId: owner.id,
    slug: "human",
    patch: { body: "Christer Hagen. Based in Bodø. Writes in Norwegian." },
    note: "Corrected location",
  })
  const corrected = await getPage(owner.id, "human")
  check("correction applied", corrected!.body.includes("Bodø"))
  check("correction makes the page user-owned", corrected!.provenance === "user")
  const correctionEvents = await getEvents(corrected!.id)
  check(
    "correction is logged as high confidence",
    correctionEvents.some((e) => e.kind === "correction" && e.confidence === "high")
  )

  console.log("\n=== the prompt ===")
  const rendered = renderBrain(await getBrain(owner.id))
  check("identity rendered", rendered.includes("Bodø"))
  check("voice rendered", rendered.includes("Never imitate anyone else"))
  check("pillar weights rendered", rendered.includes("65% Product and building"))
  check("windows rendered", rendered.includes("07:00, 11:00, 12:00"))
  // The obvious failure of a string template with a numeric slot: "1 posts/day".
  check("cadence pluralised correctly", rendered.includes("1 post per day"))
  check(
    "story enters as catalogue, not full text",
    rendered.includes("use for: side projects") &&
      !rendered.includes("Vi jobbet aldri fulltid")
  )
  check("empty brain renders nothing", renderBrain([]) === "")

  console.log("\n=== isolation ===")
  const otherPages = await db
    .select()
    .from(brainPage)
    .where(eq(brainPage.userId, "definitely-not-a-real-user"))
  check("another user sees nothing", otherPages.length === 0)

  console.log("\n=== teardown ===")
  await db.delete(brainPage).where(eq(brainPage.userId, owner.id))
  const left = await getBrain(owner.id)
  check("pages deleted", left.length === 0)
  const orphanVersions = await db
    .select()
    .from(brainPageVersion)
    .where(eq(brainPageVersion.pageId, withProof!.id))
  check("versions cascaded", orphanVersions.length === 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

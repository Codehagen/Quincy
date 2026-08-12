/**
 * Exercises the capture -> compile loop against Neon with no model in the loop.
 * Run with: npx tsx --env-file=.env.local scripts/verify-heartbeat.ts
 *
 * The extractor is injected, so this costs nothing and is deterministic. The
 * model's judgment is not what needs testing; the watermark, the correction
 * rule and the idempotency are.
 */
import { eq } from "drizzle-orm"

import { applyCorrection, getEvents, getPage, putPage } from "../lib/brain"
import { db } from "../lib/db"
import {
  captureTurn,
  INBOX_SLUG,
  runHeartbeat,
  type Extractor,
} from "../lib/heartbeat"
import { brainPage } from "../lib/schema-app"
import { user } from "../lib/schema"

function check(label: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`)
  if (!ok) process.exitCode = 1
}

/** Deterministic stand-in for the model. Counts its own calls. */
function stubExtractor(facts: { topic: string; fact: string }[]) {
  const calls: string[][] = []
  const extract: Extractor = async (captures) => {
    calls.push(captures)
    // No `usage`: the stub spends nothing, so it must not write a usage_event
    // row. That is what makes the field optional on `Extractor`.
    return { facts }
  }
  return { extract, calls }
}

async function main() {
  const email = process.argv[2] ?? "christer@quincy.test"
  const [owner] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1)

  if (!owner) throw new Error(`No user with email ${email}`)

  await db.delete(brainPage).where(eq(brainPage.userId, owner.id))

  console.log("\n=== capture ===")
  const short = await captureTurn({
    userId: owner.id,
    source: "conversation:t1",
    text: "shorter",
  })
  check("trivial turns are not captured", short === null)

  await captureTurn({
    userId: owner.id,
    source: "conversation:t1",
    text: "I always write my posts in Norwegian and never on weekends.",
  })
  await captureTurn({
    userId: owner.id,
    source: "conversation:t1",
    text: "We sold Docdir to Broker AS, that was the first exit of 2026.",
  })

  const inbox = await getPage(owner.id, INBOX_SLUG)
  check("inbox created on first capture", inbox !== null)
  check("inbox is unreviewed", inbox?.provenance === "inferred")
  const captured = await getEvents(inbox!.id)
  check("two captures stored", captured.length === 2, `${captured.length}`)

  console.log("\n=== compile ===")
  const first = stubExtractor([
    { topic: "working-style", fact: "Writes posts in Norwegian." },
    { topic: "working-style", fact: "Does not post on weekends." },
    { topic: "shipped-work", fact: "Sold Docdir to Broker AS in 2026." },
  ])
  const run1 = await runHeartbeat({ userId: owner.id, extract: first.extract })

  check("both captures compiled", run1.captures === 2, `${run1.captures}`)
  check("facts grouped by topic", run1.pagesTouched.length === 2, run1.pagesTouched.join(","))
  const style = await getPage(owner.id, "memory/working-style")
  check(
    "same topic collapses into one page",
    (style?.body.match(/^- /gm) ?? []).length === 2,
    style?.body.replace(/\n/g, " | ")
  )

  console.log("\n=== watermark ===")
  const second = stubExtractor([{ topic: "working-style", fact: "should not appear" }])
  const run2 = await runHeartbeat({ userId: owner.id, extract: second.extract })
  check("nothing left to compile", run2.captures === 0, `${run2.captures}`)
  check("extractor not called on an empty backlog", second.calls.length === 0)
  const styleAgain = await getPage(owner.id, "memory/working-style")
  check("page untouched by a no-op run", styleAgain?.body === style?.body)

  console.log("\n=== incremental ===")
  await captureTurn({
    userId: owner.id,
    source: "conversation:t2",
    text: "I run a small VC fund with eight pre-seed companies.",
  })
  const third = stubExtractor([
    { topic: "shipped-work", fact: "Runs a VC fund with eight pre-seed companies." },
  ])
  const run3 = await runHeartbeat({ userId: owner.id, extract: third.extract })
  check("only the new capture is compiled", run3.captures === 1, `${run3.captures}`)
  check("extractor saw one capture", third.calls[0]?.length === 1)
  const shipped = await getPage(owner.id, "memory/shipped-work")
  check(
    "earlier facts survive a later compile",
    shipped!.body.includes("Docdir") && shipped!.body.includes("VC fund"),
    shipped!.body.replace(/\n/g, " | ")
  )

  console.log("\n=== corrections stick ===")
  await applyCorrection({
    userId: owner.id,
    slug: "memory/working-style",
    patch: { body: "- Writes in Norwegian, and posts on Sundays too." },
    note: "Weekends are fine",
  })
  await captureTurn({
    userId: owner.id,
    source: "conversation:t3",
    text: "Reminder that I generally avoid posting late in the evening.",
  })
  const fourth = stubExtractor([
    { topic: "working-style", fact: "Never posts on weekends." },
  ])
  const run4 = await runHeartbeat({ userId: owner.id, extract: fourth.extract })

  check(
    "a user-owned page is skipped",
    run4.skipped.includes("memory/working-style"),
    `skipped: ${run4.skipped.join(",") || "none"}`
  )
  const corrected = await getPage(owner.id, "memory/working-style")
  check(
    "the correction survived untouched",
    corrected!.body === "- Writes in Norwegian, and posts on Sundays too.",
    corrected!.body
  )
  check(
    "no contradiction was appended under it",
    !corrected!.body.includes("Never posts on weekends")
  )
  // Skipped does not mean discarded. The fact lands where a review surface can
  // find it, which is the difference between stubborn and lossy.
  const correctedEvents = await getEvents(corrected!.id)
  check(
    "the rejected fact is kept as an event",
    correctedEvents.some(
      (e) =>
        e.source === "heartbeat" &&
        e.summary === "Never posts on weekends." &&
        e.detail.includes("Needs review")
    ),
    correctedEvents.map((e) => `${e.source}:${e.kind}`).join(",")
  )

  console.log("\n=== idempotency ===")
  // The property that makes cron sufficient: re-running is free. Rewind the
  // watermark by compiling the same backlog twice through a fresh inbox.
  await db.delete(brainPage).where(eq(brainPage.userId, owner.id))
  await captureTurn({
    userId: owner.id,
    source: "conversation:t4",
    text: "My default posting windows are 07:00 and 11:00 on weekdays.",
  })
  const fifth = stubExtractor([{ topic: "cadence", fact: "Posts at 07:00 and 11:00." }])
  await runHeartbeat({ userId: owner.id, extract: fifth.extract })
  const once = await getPage(owner.id, "memory/cadence")
  await runHeartbeat({ userId: owner.id, extract: fifth.extract })
  const twice = await getPage(owner.id, "memory/cadence")
  check("a second run changes nothing", once!.body === twice!.body, twice!.body)

  console.log("\n=== isolation ===")
  await putPage({
    userId: owner.id,
    slug: "memory/scoped",
    kind: "memory",
    title: "Scoped",
    body: "x",
  })
  const strangers = await db
    .select()
    .from(brainPage)
    .where(eq(brainPage.userId, "not-a-real-user"))
  check("another user sees nothing", strangers.length === 0)

  console.log("\n=== teardown ===")
  await db.delete(brainPage).where(eq(brainPage.userId, owner.id))
  check("cleaned up", (await getPage(owner.id, INBOX_SLUG)) === null)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

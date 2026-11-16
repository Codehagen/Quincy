/**
 * Exercises lib/publish-run.ts — the sweep that sends — and lib/scheduling.ts,
 * the placement it depends on, without touching X or LinkedIn.
 * Run with:
 *   npx tsx --env-file=.env.local scripts/verify-publish-run.ts
 *
 * What it is for: this is the only code path in the product that puts text on
 * the internet in someone's name with no human present. Its two dangerous
 * decisions are both invisible in production until they have already happened:
 *
 *   1. **The claim.** A row is moved to `sending` before the platform call, so
 *      two overlapping runs cannot both send it and a run that dies mid-publish
 *      leaves the row somewhere nothing retries. Get this wrong and the failure
 *      mode is a double post, which cannot be taken back.
 *   2. **The window.** A post more than two hours late is not sent. Get this
 *      wrong and a cron that was broken for a week publishes a week of stale
 *      writing into one minute.
 *
 * Both are checked here against real rows, because both are properties of what
 * the database ends up holding rather than of a pure function —
 * lib/publish-run.test.ts covers the arithmetic, and this covers the effect.
 *
 * The publisher is injected, so nothing leaves the building. What is NOT
 * covered is whether X and LinkedIn accept a real post; that is still owed, and
 * it is the thing that settles /rest/posts versus /v2/ugcPosts.
 *
 * Teardown deletes only what it created.
 */
import { eq } from "drizzle-orm"

import { db } from "../lib/db"
import { runScheduledPublish, type PublishDeps } from "../lib/publish-run"
import { nextFreeSlot } from "../lib/scheduling"
import { type PublishResult } from "../lib/publish"
import {
  draft,
  draftVersion,
  scheduledPost,
  slot,
} from "../lib/schema-app"
import { user } from "../lib/schema"

function check(label: string, ok: boolean, detail = "") {
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`
  )
  if (!ok) process.exitCode = 1
}

/**
 * Guarded to @quincy.test, and every sweep below is additionally scoped to this
 * one user id. Both matter, and here the second one matters more than it does
 * in scripts/verify-channel-maintenance.ts: an unscoped run would pick up any
 * real person's queued writing sitting in the same table and hand it to the
 * stub, marking it published without it ever going out.
 */
const ACCOUNT = process.env.DEV_ACCOUNT_EMAIL ?? "dev@quincy.test"

if (!ACCOUNT.endsWith("@quincy.test")) {
  throw new Error(
    `Refusing to touch ${ACCOUNT} — this script schedules and publishes and ` +
      "only operates on @quincy.test accounts."
  )
}

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE

// `satisfies` rather than a type annotation: the assertions below read `OK.url`
// and `REFUSED.message`, and annotating these as `PublishResult` would widen
// them back to the union where neither field exists on both arms.
const OK = {
  ok: true,
  url: "https://x.com/verify/status/1",
  externalId: "1",
} as const satisfies PublishResult

const REFUSED = {
  ok: false,
  reason: "duplicate",
  message: "You have already said that.",
} as const satisfies PublishResult

const UNCONFIRMED = {
  ok: false,
  reason: "unconfirmed",
  message: "X accepted the post but returned no id that could be read.",
} as const satisfies PublishResult

/** A stub publisher that records every call so the assertions can read it back. */
function deps(result: PublishResult) {
  const calls: string[] = []

  const value: PublishDeps = {
    send: async ({ text }) => {
      calls.push(text)
      return result
    },
  }

  return {
    value,
    calls,
    get sent() {
      return calls.length
    },
  }
}

async function main() {
  const [owner] = await db
    .select()
    .from(user)
    .where(eq(user.email, ACCOUNT))
    .limit(1)

  if (!owner) {
    throw new Error(
      `No ${ACCOUNT} user. Run: npx tsx --env-file=.env.local scripts/dev-account.ts`
    )
  }

  console.log(`Using user ${owner.email}`)

  /**
   * The channel has to be one this environment has credentials for, or every
   * row comes back `unconfigured` and nothing below is actually exercised. X
   * first because it is the cheaper stub; LinkedIn if only that is configured.
   */
  const channel = process.env.X_CLIENT_ID
    ? "x"
    : process.env.LINKEDIN_CLIENT_ID
      ? "linkedin"
      : null

  if (!channel) {
    throw new Error(
      "Neither X nor LinkedIn has a client id in this environment. The sweep " +
        "would skip every row as unconfigured and prove nothing. Set one."
    )
  }

  console.log(`Publishing to ${channel} (stubbed)\n`)

  const ids = { drafts: [] as string[], slots: [] as string[] }

  const reset = async () => {
    await db.delete(scheduledPost).where(eq(scheduledPost.userId, owner.id))
    await db.delete(draft).where(eq(draft.userId, owner.id))
    await db.delete(slot).where(eq(slot.userId, owner.id))
    ids.drafts = []
    ids.slots = []
  }

  const id = (prefix: string) =>
    `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`

  /** One piece with one version, ready to be scheduled. */
  const seedVersion = async (body: string) => {
    const draftId = id("drf")
    const versionId = id("ver")

    await db.insert(draft).values({
      id: draftId,
      userId: owner.id,
      idea: "Verify publish run",
      sourceId: "verify",
      sourceLabel: "Verify",
    })

    await db.insert(draftVersion).values({
      id: versionId,
      draftId,
      channel,
      label: channel,
      body,
      state: "approved",
      approvedAt: new Date(),
    })

    ids.drafts.push(draftId)
    return versionId
  }

  const schedule = async (versionId: string, at: Date) => {
    const postId = id("sch")

    await db.insert(scheduledPost).values({
      id: postId,
      userId: owner.id,
      draftVersionId: versionId,
      scheduledFor: at,
    })

    return postId
  }

  const read = async (postId: string) => {
    const [row] = await db
      .select()
      .from(scheduledPost)
      .where(eq(scheduledPost.id, postId))
      .limit(1)

    return row
  }

  const sweep = (d: PublishDeps) =>
    runScheduledPublish({ userId: owner.id, deps: d })

  /* ── A post whose time has come ───────────────────────────────────────── */

  console.log("=== a due post goes out ===")
  await reset()
  let version = await seedVersion("Due now.")
  let postId = await schedule(version, new Date(Date.now() - 5 * MINUTE))
  let d = deps(OK)
  let run = await sweep(d.value)

  check("one post was due", run.due === 1, JSON.stringify(run.outcomes))
  check("the platform was asked once", d.sent === 1, `${d.sent} calls`)
  check("with the version's body", d.calls[0] === "Due now.", d.calls[0])
  let row = await read(postId)
  check("state is published", row.state === "published", row.state)
  check("the URL was stored as the receipt", row.postUrl === OK.url, `${row.postUrl}`)
  check("the external id was stored", row.externalId === "1")
  check("publishedAt was set", row.publishedAt !== null)
  check("no error was left behind", row.lastError === null)

  /* ── The claim ────────────────────────────────────────────────────────── */

  console.log("\n=== a published post is never picked up again ===")
  d = deps(OK)
  run = await sweep(d.value)
  check("nothing was due", run.due === 0, JSON.stringify(run.outcomes))
  check("the platform was not asked", d.sent === 0, `${d.sent} calls`)

  console.log("\n=== a row parked in sending is never retried ===")
  await reset()
  version = await seedVersion("Outcome unknown.")
  postId = await schedule(version, new Date(Date.now() - 5 * MINUTE))
  // Exactly what a run that died mid-publish leaves behind.
  await db
    .update(scheduledPost)
    .set({ state: "sending", attemptedAt: new Date() })
    .where(eq(scheduledPost.id, postId))

  d = deps(OK)
  run = await sweep(d.value)
  check("it was not selected", run.due === 0, JSON.stringify(run.outcomes))
  check(
    "and the platform was never asked a second time",
    d.sent === 0,
    `${d.sent} calls`
  )
  row = await read(postId)
  check("it is still sending, waiting for a human", row.state === "sending")

  /* ── The window ───────────────────────────────────────────────────────── */

  console.log("\n=== a post inside the window still goes out ===")
  await reset()
  version = await seedVersion("An hour late.")
  postId = await schedule(version, new Date(Date.now() - 1 * HOUR))
  d = deps(OK)
  run = await sweep(d.value)
  check("it was sent", run.outcomes.published === 1, JSON.stringify(run.outcomes))
  check("the platform was asked", d.sent === 1)

  console.log("\n=== a post past the window is marked, never sent ===")
  await reset()
  version = await seedVersion("Three hours late.")
  postId = await schedule(version, new Date(Date.now() - 3 * HOUR))
  d = deps(OK)
  run = await sweep(d.value)
  check("counted as missed", run.outcomes.missed === 1, JSON.stringify(run.outcomes))
  check(
    "the platform was NEVER asked — this is the whole point",
    d.sent === 0,
    `${d.sent} calls`
  )
  row = await read(postId)
  check("state is failed", row.state === "failed", row.state)
  check(
    "and it says why, in words the user can act on",
    (row.lastError ?? "").includes("two hours"),
    row.lastError ?? "(none)"
  )

  console.log("\n=== a post from last week is left alone entirely ===")
  await reset()
  version = await seedVersion("Ancient.")
  postId = await schedule(version, new Date(Date.now() - 7 * 24 * HOUR))
  d = deps(OK)
  run = await sweep(d.value)
  check("not even selected", run.due === 0, JSON.stringify(run.outcomes))
  check("the platform was not asked", d.sent === 0)
  row = await read(postId)
  check(
    "still queued rather than re-read every five minutes forever",
    row.state === "queued",
    row.state
  )

  console.log("\n=== a future post is not touched ===")
  await reset()
  version = await seedVersion("Tomorrow.")
  postId = await schedule(version, new Date(Date.now() + 4 * HOUR))
  d = deps(OK)
  run = await sweep(d.value)
  check("not selected", run.due === 0, JSON.stringify(run.outcomes))
  check("the platform was not asked", d.sent === 0)
  check("still queued", (await read(postId)).state === "queued")

  /* ── What a refusal leaves behind ─────────────────────────────────────── */

  console.log("\n=== a refused post records the platform's own words ===")
  await reset()
  version = await seedVersion("Said it already.")
  postId = await schedule(version, new Date(Date.now() - 5 * MINUTE))
  d = deps(REFUSED)
  run = await sweep(d.value)
  check("counted as failed", run.outcomes.failed === 1, JSON.stringify(run.outcomes))
  row = await read(postId)
  check("state is failed", row.state === "failed", row.state)
  check(
    "with the message unparaphrased",
    row.lastError === REFUSED.message,
    row.lastError ?? "(none)"
  )
  check("and no URL, because nothing was published", row.postUrl === null)

  console.log("\n=== a failed post is not retried on the next sweep ===")
  d = deps(OK)
  run = await sweep(d.value)
  check("not selected", run.due === 0, JSON.stringify(run.outcomes))
  check("the platform was not asked", d.sent === 0)

  /* ── The one that must never be retried ───────────────────────────────── */

  console.log("\n=== an unconfirmed post is parked, not failed and not retried ===")
  await reset()
  version = await seedVersion("Probably out.")
  postId = await schedule(version, new Date(Date.now() - 5 * MINUTE))
  d = deps(UNCONFIRMED)
  run = await sweep(d.value)
  check(
    "counted as unconfirmed",
    run.outcomes.unconfirmed === 1,
    JSON.stringify(run.outcomes)
  )
  row = await read(postId)
  check(
    "left in sending, which is the state that means 'go and look'",
    row.state === "sending",
    row.state
  )
  check(
    "NOT marked failed — that would invite a retry and a double post",
    row.state !== "failed"
  )
  check(
    "and it carries the wording that says to check the account",
    (row.lastError ?? "").includes("returned no id"),
    row.lastError ?? "(none)"
  )

  d = deps(OK)
  run = await sweep(d.value)
  check("the next sweep leaves it alone", run.due === 0 && d.sent === 0)

  /* ── Placement ────────────────────────────────────────────────────────── */

  console.log("\n=== approving with no slot produces no time ===")
  await reset()
  let placement = await nextFreeSlot({
    userId: owner.id,
    channel,
    timezone: owner.timezone,
  })
  check(
    "reported as no-slot rather than inventing a time",
    !placement.ok && placement.reason === "no-slot",
    JSON.stringify(placement)
  )

  console.log("\n=== a slot gives it a time, and a second approval takes the next one ===")
  const slotId = id("slot")
  await db.insert(slot).values({
    id: slotId,
    userId: owner.id,
    channel,
    weekday: 1,
    timeOfDay: "08:00",
  })

  placement = await nextFreeSlot({
    userId: owner.id,
    channel,
    timezone: owner.timezone,
  })
  check("a slot was found", placement.ok, JSON.stringify(placement))

  if (placement.ok) {
    check("it points at the slot we made", placement.slotId === slotId)

    // Fill it, exactly as approveVersion would.
    const first = await seedVersion("First.")
    await db.insert(scheduledPost).values({
      id: id("sch"),
      userId: owner.id,
      draftVersionId: first,
      slotId: placement.slotId,
      scheduledFor: placement.at,
    })

    const second = await nextFreeSlot({
      userId: owner.id,
      channel,
      timezone: owner.timezone,
    })

    check("a second approval finds a slot", second.ok, JSON.stringify(second))
    check(
      "and it is NOT the same instant — a slot holds one post",
      second.ok && second.at.getTime() !== placement.at.getTime(),
      second.ok ? second.at.toISOString() : "(none)"
    )
    check(
      "it is a week later, the next occurrence of the same commitment",
      second.ok &&
        second.at.getTime() - placement.at.getTime() === 7 * 24 * HOUR,
      second.ok
        ? `${(second.at.getTime() - placement.at.getTime()) / HOUR}h apart`
        : "(none)"
    )

    /**
     * The horizon is two weeks and /lineup draws seven days, so the second
     * occurrence of a weekly slot is scheduled and invisible. That mismatch is
     * deliberate — narrowing the horizon would refuse the approval outright
     * whenever this week's occurrence had passed — so the receipt has to say
     * so, and this is the flag it reads.
     */
    check(
      "the second one is flagged as past the week Lineup draws",
      second.ok && second.beyondThisWeek === true,
      second.ok ? `beyondThisWeek=${second.beyondThisWeek}` : "(none)"
    )
    check(
      "and the first one is not",
      placement.beyondThisWeek === false,
      `beyondThisWeek=${placement.beyondThisWeek}`
    )
  }

  console.log("\n=== approving after today's slot time never lands in the past ===")
  await reset()
  {
    /**
     * The bug this guard exists for: `occurrencesOf` offers today's slot
     * instant whether or not it is still morning, so an afternoon approval used
     * to schedule hours into the past. The sweep then either published it
     * within five minutes — the receipt said 08:00 — or marked it failed for
     * being outside the catch-up window.
     *
     * A slot on *today's* weekday at 00:01 is guaranteed to have passed by the
     * time this runs, whatever day it runs on.
     */
    const todayWeekday = ((new Date().getUTCDay() + 6) % 7) + 1

    await db.insert(slot).values({
      id: id("slot"),
      userId: owner.id,
      channel,
      weekday: todayWeekday,
      timeOfDay: "00:01",
    })

    const past = await nextFreeSlot({
      userId: owner.id,
      channel,
      timezone: owner.timezone,
    })

    check("a slot was still found", past.ok, JSON.stringify(past))
    check(
      "and it is in the FUTURE, not this morning",
      past.ok && past.at.getTime() > Date.now(),
      past.ok ? past.at.toISOString() : "(none)"
    )
  }

  console.log("\n=== teardown ===")
  await reset()
  const leftPosts = await db
    .select()
    .from(scheduledPost)
    .where(eq(scheduledPost.userId, owner.id))
  const leftSlots = await db
    .select()
    .from(slot)
    .where(eq(slot.userId, owner.id))
  const leftDrafts = await db
    .select()
    .from(draft)
    .where(eq(draft.userId, owner.id))

  check("scheduled posts deleted", leftPosts.length === 0)
  check("slots deleted", leftSlots.length === 0)
  check("drafts deleted", leftDrafts.length === 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

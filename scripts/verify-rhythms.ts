/**
 * Exercises lib/rhythm-run.ts — the sweep that runs rhythms — against a real
 * database, with the handler injected so nothing calls a model or X.
 * Run with:
 *   npx tsx --env-file=.env.local scripts/verify-rhythms.ts
 *
 * What it is for: the dispatcher's dangerous decisions are all properties of
 * what the database ends up holding, so a unit test cannot see them.
 * lib/rhythm-schedule.test.ts covers the arithmetic; this covers the effect.
 *
 *   1. **The cursor always moves.** A run that was skipped, missed or failed
 *      must still advance `next_run_at`. Get this wrong and the row stays due
 *      forever, which means it is re-read on every tick for the rest of time —
 *      and for an entitled user, re-run every fifteen minutes.
 *   2. **The claim.** Two overlapping sweeps must not both run one
 *      subscription. Get this wrong and every rhythm runs twice, at double the
 *      cost, writing two sets of drafts.
 *   3. **The window.** A subscription more than MAX_LATENESS_MS late is not
 *      run at all. Get this wrong and a dispatcher that was down overnight
 *      fires everybody's morning brief at midnight.
 *
 * Teardown deletes only what it created.
 */
import { and, eq } from "drizzle-orm"

import { db } from "../lib/db"
import {
  runDueRhythms,
  runRhythmOnce,
  rescheduleForUser,
} from "../lib/rhythm-run"
import { MAX_LATENESS_MS, STALE_CLAIM_MS } from "../lib/rhythm-schedule"
import type { RhythmHandler } from "../lib/rhythm-handlers"
import { rhythmRun, rhythmSubscription } from "../lib/schema-app"
import { user } from "../lib/schema"

/** `(condition, label, detail)`, matching scripts/verify-ingest-e2e.ts. The
 *  other order exists in scripts/verify-publish-run.ts; both are in the repo
 *  and reading the call sites is the only way to tell, which is why every call
 *  below reads as a sentence. */
function check(ok: boolean, label: string, detail = "") {
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`
  )
  if (!ok) process.exitCode = 1
}

/**
 * Guarded to @quincy.test, and every sweep below is additionally scoped by
 * deleting only the rows this script inserted. The guard matters because
 * `runDueRhythms` crosses users by design: an unscoped run on a real database
 * would pick up any real person's due subscriptions and fire them.
 */
const ACCOUNT = process.env.DEV_ACCOUNT_EMAIL ?? "dev@quincy.test"

if (!ACCOUNT.endsWith("@quincy.test")) {
  throw new Error(
    `Refusing to touch ${ACCOUNT} — this script fires rhythms and only ` +
      "operates on @quincy.test accounts."
  )
}

/** A rhythm id that exists in the catalogue and has a handler. */
const RHYTHM_ID = "voice-refresh"

/** Counts calls so the assertions can prove a handler did or did not run. */
function stubHandler() {
  let calls = 0

  const handler: RhythmHandler = async () => {
    calls += 1
    return { summary: `stub run ${calls}` }
  }

  const throwing: RhythmHandler = async () => {
    calls += 1
    throw new Error("the handler exploded")
  }

  return {
    handlers: { [RHYTHM_ID]: handler },
    throwingHandlers: { [RHYTHM_ID]: throwing },
    get calls() {
      return calls
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

  console.log(`Using user ${owner.email} (tz ${owner.timezone ?? "unset"})`)

  /**
   * Hold the account entitled for the length of the run, and put it back after.
   *
   * Without this every "the handler did not run" assertion below passes for the
   * wrong reason: the dev account's trial is long over, so `resolveEntitlement`
   * skips it and `calls` is zero whatever the claim, the window or the switch
   * did. The first version of this script reported eight passes it had not
   * earned — which is exactly the failure a verify script exists to prevent, so
   * it is worth the two writes to close it.
   *
   * Restored in the outer `finally`, including on a throw.
   */
  const originalTrialEndsAt = owner.trialEndsAt

  async function setTrial(endsAt: Date | null) {
    await db.update(user).set({ trialEndsAt: endsAt }).where(eq(user.id, owner.id))
  }

  await setTrial(new Date(Date.now() + 60 * 60 * 1000))
  console.log("Entitlement: held open for this run\n")

  const id = `rs_verify_${Date.now().toString(36)}`

  // Anything this user already had, so teardown can leave it alone.
  const preexisting = await db
    .select({ id: rhythmSubscription.id })
    .from(rhythmSubscription)
    .where(eq(rhythmSubscription.userId, owner.id))

  const preexistingIds = new Set(preexisting.map((r) => r.id))
  if (preexistingIds.size > 0) {
    console.log(
      `Note: ${preexistingIds.size} existing subscription(s) will be left alone.\n`
    )
  }

  async function reset(nextRunAt: Date, extra: Record<string, unknown> = {}) {
    await db
      .insert(rhythmSubscription)
      .values({
        id,
        userId: owner.id,
        rhythmId: RHYTHM_ID,
        hour: 9,
        minute: 0,
        weekday: null,
        enabled: true,
        nextRunAt,
        runningSince: null,
        ...extra,
      })
      .onConflictDoUpdate({
        target: rhythmSubscription.id,
        set: { nextRunAt, runningSince: null, enabled: true, ...extra },
      })

    await db.delete(rhythmRun).where(eq(rhythmRun.subscriptionId, id))
  }

  async function row() {
    const [found] = await db
      .select()
      .from(rhythmSubscription)
      .where(eq(rhythmSubscription.id, id))
      .limit(1)
    return found
  }

  async function runs() {
    return db
      .select()
      .from(rhythmRun)
      .where(eq(rhythmRun.subscriptionId, id))
  }

  try {
    /* ── 1. Due and entitled: it runs, and the cursor moves ──────────────── */
    console.log("── due and entitled ──")
    {
      const stub = stubHandler()
      const dueAt = new Date(Date.now() - 60_000)
      await reset(dueAt)

      const sweep = await runDueRhythms(new Date(), {
        handlers: stub.handlers,
      })

      const after = await row()
      const recorded = await runs()

      check(sweep.due >= 1, "the sweep saw at least one due row", `due=${sweep.due}`)
      check(stub.calls === 1, "the handler ran exactly once", `calls=${stub.calls}`)
      check(
        recorded.length === 1 && recorded[0].state === "ok",
        "one run recorded as ok",
        recorded.map((r) => r.state).join(",") || "none"
      )
      check(
        after.nextRunAt.getTime() > dueAt.getTime(),
        "next_run_at moved forward",
        after.nextRunAt.toISOString()
      )
      check(after.runningSince === null, "the claim was released")
      check(after.lastRunAt !== null, "last_run_at was stamped")
    }

    /* ── 2. A handler that throws: recorded failed, cursor STILL moves ───── */
    console.log("\n── the handler throws ──")
    {
      const stub = stubHandler()
      const dueAt = new Date(Date.now() - 60_000)
      await reset(dueAt)

      const sweep = await runDueRhythms(new Date(), {
        handlers: stub.throwingHandlers,
      })

      const after = await row()
      const recorded = await runs()

      check(sweep.failed >= 1, "the sweep counted a failure", `failed=${sweep.failed}`)
      check(
        recorded.length === 1 && recorded[0].state === "failed",
        "the run was recorded as failed"
      )
      check(
        recorded[0]?.summary.includes("exploded"),
        "the failure message reached the user-visible summary",
        recorded[0]?.summary
      )
      // The property that matters most. A throw must not leave the row due.
      check(
        after.nextRunAt.getTime() > dueAt.getTime(),
        "next_run_at moved forward despite the throw"
      )
      check(after.runningSince === null, "the claim was released in `finally`")
    }

    /* ── 3. Past the window: skipped without running, cursor moves ───────── */
    console.log("\n── past the lateness window ──")
    {
      const stub = stubHandler()
      const dueAt = new Date(Date.now() - MAX_LATENESS_MS - 60_000)
      await reset(dueAt)

      await runDueRhythms(new Date(), { handlers: stub.handlers })

      const after = await row()
      const recorded = await runs()

      check(stub.calls === 0, "the handler was never called", `calls=${stub.calls}`)
      check(
        recorded.length === 1 && recorded[0].state === "missed",
        "the run was recorded as missed",
        recorded[0]?.state
      )
      check(
        after.nextRunAt.getTime() > dueAt.getTime(),
        "next_run_at moved forward"
      )
    }

    /* ── 4. A live claim is not stolen ───────────────────────────────────── */
    console.log("\n── a live claim ──")
    {
      const stub = stubHandler()
      await reset(new Date(Date.now() - 60_000), {
        // Claimed one minute ago: well inside STALE_CLAIM_MS.
        runningSince: new Date(Date.now() - 60_000),
      })

      await runDueRhythms(new Date(), { handlers: stub.handlers })

      check(
        stub.calls === 0,
        "a subscription already running was not run again",
        `calls=${stub.calls}`
      )
    }

    /* ── 5. A stale claim IS reclaimed ───────────────────────────────────── */
    console.log("\n── a stale claim ──")
    {
      const stub = stubHandler()
      await reset(new Date(Date.now() - 60_000), {
        runningSince: new Date(Date.now() - STALE_CLAIM_MS - 60_000),
      })

      await runDueRhythms(new Date(), { handlers: stub.handlers })

      check(
        stub.calls === 1,
        "an abandoned claim was retaken",
        `calls=${stub.calls}`
      )
    }

    /* ── 6. Disabled rhythms are not run ─────────────────────────────────── */
    console.log("\n── switched off ──")
    {
      const stub = stubHandler()
      await reset(new Date(Date.now() - 60_000), { enabled: false })

      await runDueRhythms(new Date(), { handlers: stub.handlers })

      check(
        stub.calls === 0,
        "a disabled subscription was skipped",
        `calls=${stub.calls}`
      )
    }

    /* ── 7. Not yet due ──────────────────────────────────────────────────── */
    console.log("\n── not yet due ──")
    {
      const stub = stubHandler()
      await reset(new Date(Date.now() + 60 * 60 * 1000))

      await runDueRhythms(new Date(), { handlers: stub.handlers })

      check(
        stub.calls === 0,
        "a subscription due in an hour was left alone",
        `calls=${stub.calls}`
      )
    }

    /* ── 8. Run now: runs, records manual, does NOT move the cursor ──────── */
    console.log("\n── run now ──")
    {
      const stub = stubHandler()
      const dueAt = new Date(Date.now() + 60 * 60 * 1000)
      await reset(dueAt)

      const result = await runRhythmOnce({
        subscriptionId: id,
        userId: owner.id,
        deps: { handlers: stub.handlers },
      })

      const after = await row()
      const recorded = await runs()

      check(result.ok, "the manual run reported success", result.summary)
      check(stub.calls === 1, "the handler ran once")
      check(recorded[0]?.manual === true, "the run is marked manual")
      // Pressing the button must not quietly cancel the scheduled run.
      check(
        after.nextRunAt.getTime() === dueAt.getTime(),
        "next_run_at did NOT move",
        after.nextRunAt.toISOString()
      )
      check(after.runningSince === null, "the claim was released")
    }

    /* ── 8b. Run now refuses a second press inside the cooldown ─────────── */
    console.log("\n── run now, twice ──")
    {
      const stub = stubHandler()
      await reset(new Date(Date.now() + 60 * 60 * 1000))

      const first = await runRhythmOnce({
        subscriptionId: id,
        userId: owner.id,
        deps: { handlers: stub.handlers },
      })
      const second = await runRhythmOnce({
        subscriptionId: id,
        userId: owner.id,
        deps: { handlers: stub.handlers },
      })

      check(first.ok, "the first press ran", first.summary)
      /**
       * The guard the first cut of this feature did not have. Each press is a
       * paid X read plus up to four model calls, and the subscription claim
       * does not stop it — a claim is released the moment a run ends.
       */
      check(
        !second.ok && stub.calls === 1,
        "the second press inside the cooldown was refused",
        second.summary
      )
      check(
        second.summary.toLowerCase().includes("minute"),
        "and it says how long to wait",
        second.summary
      )
    }

    /* ── 9. Run now refuses somebody else's subscription ─────────────────── */
    console.log("\n── ownership ──")
    {
      const stub = stubHandler()
      const result = await runRhythmOnce({
        subscriptionId: id,
        userId: "not-this-user",
        deps: { handlers: stub.handlers },
      })

      check(!result.ok, "a subscription belonging to someone else was refused")
      check(stub.calls === 0, "and its handler never ran")
    }

    /* ── 10. A timezone change moves every cursor ────────────────────────── */
    console.log("\n── reschedule on timezone change ──")
    {
      await reset(new Date(Date.now() + 60 * 60 * 1000))
      const before = await row()

      const moved = await rescheduleForUser(owner.id, "Pacific/Auckland")
      const after = await row()

      check(moved >= 1, "at least one cursor was recomputed", `moved=${moved}`)
      check(
        after.nextRunAt.getTime() !== before.nextRunAt.getTime(),
        "the cursor actually changed for a zone half the world away"
      )
    }

    /* ── 11. Unentitled: skipped, and the cursor STILL moves ────────────── */
    console.log("\n── unentitled ──")
    {
      const stub = stubHandler()
      const dueAt = new Date(Date.now() - 60_000)
      await reset(dueAt)
      await setTrial(new Date(Date.now() - 60 * 60 * 1000))

      try {
        await runDueRhythms(new Date(), { handlers: stub.handlers })

        const after = await row()
        const recorded = await runs()

        check(
          stub.calls === 0,
          "an unentitled account's handler never ran",
          `calls=${stub.calls}`
        )
        check(
          recorded.length === 1 && recorded[0].state === "skipped",
          "the run was recorded as skipped",
          recorded[0]?.state
        )
        check(
          recorded[0]?.summary.toLowerCase().includes("skipped"),
          "and the summary says why",
          recorded[0]?.summary
        )
        /**
         * The difference from lib/heartbeat.ts, which deliberately does NOT
         * advance its watermark for an unentitled user so their backlog
         * survives. A rhythm has no backlog, so a row left due here would be
         * re-read on every tick forever.
         */
        check(
          after.nextRunAt.getTime() > dueAt.getTime(),
          "next_run_at moved anyway, so the row is not due forever"
        )
      } finally {
        await setTrial(new Date(Date.now() + 60 * 60 * 1000))
      }
    }

    /* ── 12. A rhythm with no handler is skipped, not retried forever ───── */
    console.log("\n── no handler ──")
    {
      const dueAt = new Date(Date.now() - 60_000)
      await reset(dueAt)

      // An empty registry stands in for a catalogue entry that has been
      // removed while a subscription to it still exists.
      await runDueRhythms(new Date(), { handlers: {} })

      const after = await row()
      const recorded = await runs()

      check(
        recorded.length === 1 && recorded[0].state === "skipped",
        "recorded as skipped",
        recorded[0]?.state
      )
      check(
        after.nextRunAt.getTime() > dueAt.getTime(),
        "and the cursor still moved, so it is not re-read every tick"
      )
    }
  } finally {
    console.log("\n── teardown ──")
    await setTrial(originalTrialEndsAt ?? null)
    console.log("  restored the account's original trial end")
    await db.delete(rhythmRun).where(eq(rhythmRun.subscriptionId, id))
    await db
      .delete(rhythmSubscription)
      .where(
        and(
          eq(rhythmSubscription.id, id),
          eq(rhythmSubscription.userId, owner?.id ?? "")
        )
      )
    console.log("  removed the verification subscription and its runs")
  }
}

main().then(
  () => {
    console.log(
      process.exitCode ? "\nFAILED" : "\nAll dispatcher properties hold."
    )
    process.exit(process.exitCode ?? 0)
  },
  (error) => {
    console.error(error)
    process.exit(1)
  }
)

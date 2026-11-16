/**
 * Wakes the owner's rhythms, and silences the ones talking to nobody.
 *
 * Run with:
 *   OWNER_EMAIL=you@example.com npx tsx --env-file=.env.local scripts/enroll-rhythms.ts
 *   OWNER_EMAIL=you@example.com npx tsx --env-file=.env.local scripts/enroll-rhythms.ts --apply
 *
 * **`OWNER_EMAIL` is required** and has no default. It names the account whose
 * rhythms are woken; the script refuses to start without it.
 *
 * **Dry by default, and that is the whole design.** This is phase 0 of
 * plans/028-the-advisor-first.md, whose STOP condition is that the owner sees
 * each live-table write before it happens. So the default run prints the exact
 * rows it would touch and changes nothing; `--apply` is a second, deliberate
 * act. Every other apply-*.ts script in this directory writes on sight because
 * it is a migration — DDL that is additive and idempotent. This one is not:
 * it decides which rhythms speak to a person, and a wrong row here is a
 * machine mailing somebody on a schedule they did not choose.
 *
 * **Why it exists at all.** On 2026-09-09 the live tables said: 33 rhythm
 * runs, 30 skipped and 3 failed, nothing accomplished. The only enrollment
 * firing belonged to `dev@quincy.test`, an account whose subscription was
 * cancelled on 2026-09-02, so every daily tick wrote "Skipped — your
 * subscription is no longer active" and stopped. The owner's own enrollment
 * was `enabled: false`, and the three rhythms plan 027 built — week-plan,
 * weekly-review, ship-log — had no enrollment row for anybody. The advisor
 * had no mouth. That is what this fixes, and it is configuration rather than
 * code, which is why it is a script and not a migration.
 *
 * **`nextRunAt` is computed, never guessed.** It is denormalised from
 * (hour, minute, weekday, user.timezone), and the note on the column in
 * lib/schema-app.ts is explicit that forgetting the zone is the easy mistake.
 * So this asks `nextRunAfter` for it, exactly as `rescheduleForUser` does,
 * rather than adding a day to now and hoping.
 */
import { createIdGenerator } from "ai"
import { and, eq } from "drizzle-orm"

import { db } from "../lib/db"
import { nextRunAfter } from "../lib/rhythm-schedule"
import { getRhythm, isRunnable } from "../lib/rhythms"
import { rhythmSubscription } from "../lib/schema-app"
import { user } from "../lib/schema"
import { resolveTimeZone } from "../lib/timezone"

/** The account the advisor is being woken for. Required; no default. */
const OWNER_EMAIL = requireOwnerEmail()

function requireOwnerEmail(): string {
  const email = process.env.OWNER_EMAIL?.trim()
  if (!email) {
    console.error(
      "OWNER_EMAIL is not set. Set it to the email of the account whose rhythms this enrolls. Nothing done.",
    )
    process.exit(1)
  }
  return email
}

/**
 * The seed account, whose enrollment is the source of the daily skip.
 *
 * Disabled rather than deleted. The row is the only evidence that the sweep
 * works end to end — it claimed, ran, wrote a run row and released, every day
 * for a month, which is more than any other enrollment has proven. Deleting
 * the proof to quiet the noise is a bad trade; `enabled: false` quiets it and
 * keeps it.
 */
const SEED_EMAIL = "dev@quincy.test"

/**
 * What the advisor should be running, and when.
 *
 * The cadences are the ones the rhythm definitions already advertise on the
 * /rhythm page (`trigger.label`), not new numbers invented here — a card that
 * says "Mon 07:00" and a row that fires Tuesday is a bug the user finds
 * before we do. `bookmarks-to-posts` is deliberately absent: it already has a
 * row for the owner and only needs its switch flipped.
 */
const WANTED = [
  { id: "week-plan", hour: 7, minute: 0, weekday: 1 },
  { id: "weekly-review", hour: 19, minute: 0, weekday: 7 },
  { id: "ship-log", hour: 18, minute: 0, weekday: 5 },
] as const

/**
 * The same generator, prefix and size `app/(app)/rhythm/actions.ts` uses.
 *
 * `rhythm_subscription.id` has no database default — the application supplies
 * it, and the first run of this script found that out the hard way with a
 * 23502 on a null id. Duplicating the generator here rather than exporting it
 * from the action: that module is a "use server" file, and importing one into
 * a plain node script drags the server-action runtime in behind it.
 */
const newSubscriptionId = createIdGenerator({ prefix: "rs", size: 16 })

const APPLY = process.argv.includes("--apply")

async function findUser(email: string) {
  const [row] = await db
    .select({ id: user.id, email: user.email, timezone: user.timezone })
    .from(user)
    .where(eq(user.email, email))
    .limit(1)

  return row ?? null
}

async function main() {
  const owner = await findUser(OWNER_EMAIL)
  if (!owner) {
    console.error(`No user with email ${OWNER_EMAIL}. Nothing done.`)
    process.exitCode = 1
    return
  }

  // Through `resolveTimeZone` rather than `?? "Europe/Oslo"`: the column is
  // nullable *and* free text, so a stale or misspelled zone is as likely as a
  // missing one, and that helper is what every other scheduling path in the
  // product uses to turn either into something `nextRunAfter` can trust.
  const zone = resolveTimeZone(owner.timezone)
  const now = new Date()

  console.log(`${APPLY ? "APPLYING" : "DRY RUN — nothing will be written"}`)
  console.log(`Owner:  ${owner.email}  (${zone})\n`)

  const existing = await db
    .select()
    .from(rhythmSubscription)
    .where(eq(rhythmSubscription.userId, owner.id))

  const byId = new Map(existing.map((row) => [row.rhythmId, row]))

  // 0b — the owner's existing enrollment, switched on.
  const bookmarks = byId.get("bookmarks-to-posts")
  if (!bookmarks) {
    console.log(`  bookmarks-to-posts   no row for the owner — skipping`)
  } else if (bookmarks.enabled) {
    console.log(`  bookmarks-to-posts   already enabled — nothing to do`)
  } else {
    const at = nextRunAfter(
      {
        hour: bookmarks.hour,
        minute: bookmarks.minute,
        weekday: bookmarks.weekday,
      },
      zone,
      now
    )
    console.log(
      `  bookmarks-to-posts   enable, next run ${at?.toISOString() ?? "unschedulable"}`
    )
    if (APPLY && at) {
      await db
        .update(rhythmSubscription)
        .set({ enabled: true, nextRunAt: at, updatedAt: new Date() })
        .where(eq(rhythmSubscription.id, bookmarks.id))
    }
  }

  // 0c — the three rhythms plan 027 built and nobody was enrolled in.
  for (const want of WANTED) {
    const rhythm = getRhythm(want.id)
    if (!rhythm) {
      console.log(`  ${want.id.padEnd(20)} unknown rhythm — skipping`)
      continue
    }
    // The same gate the UI uses, so this cannot enroll somebody in a switch
    // the dispatcher has no way to honour.
    if (!isRunnable(rhythm)) {
      console.log(`  ${want.id.padEnd(20)} no handler — skipping`)
      continue
    }
    if (byId.has(want.id)) {
      console.log(`  ${want.id.padEnd(20)} already enrolled — nothing to do`)
      continue
    }

    const at = nextRunAfter(
      { hour: want.hour, minute: want.minute, weekday: want.weekday },
      zone,
      now
    )
    console.log(
      `  ${want.id.padEnd(20)} enroll, next run ${at?.toISOString() ?? "unschedulable"}`
    )
    if (APPLY && at) {
      await db.insert(rhythmSubscription).values({
        id: newSubscriptionId(),
        userId: owner.id,
        rhythmId: want.id,
        enabled: true,
        hour: want.hour,
        minute: want.minute,
        weekday: want.weekday,
        nextRunAt: at,
      })
    }
  }

  // 0a — the seed account's daily skip.
  const seed = await findUser(SEED_EMAIL)
  if (!seed) {
    console.log(`\n  ${SEED_EMAIL} not found — no skip to silence`)
  } else {
    const rows = await db
      .select()
      .from(rhythmSubscription)
      .where(
        and(
          eq(rhythmSubscription.userId, seed.id),
          eq(rhythmSubscription.enabled, true)
        )
      )

    console.log(`\n  ${SEED_EMAIL}: ${rows.length} enabled enrollment(s)`)
    for (const row of rows) {
      console.log(`  ${row.rhythmId.padEnd(20)} disable (stops the daily skip)`)
      if (APPLY) {
        await db
          .update(rhythmSubscription)
          .set({ enabled: false, updatedAt: new Date() })
          .where(eq(rhythmSubscription.id, row.id))
      }
    }
  }

  console.log(
    APPLY
      ? "\nApplied."
      : "\nNothing written. Re-run with --apply to make these changes."
  )
}

main()

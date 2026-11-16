/**
 * Proves the property lib/timezone.ts exists for: the same rows, read on a
 * server in any zone, produce the same lineup for the same reader.
 *
 * The unit tests in lib/timezone.test.ts cover the arithmetic. This covers the
 * wiring — that `getLineup` actually asks the reader's zone rather than the
 * host's, all the way through a real query against real rows. Before the fix
 * the two host runs below differed by two hours and by a day boundary, and
 * nothing in the test suite could see it because the tests and the dev machine
 * shared a zone.
 *
 * Reads only. Nothing is written and nothing needs teardown.
 *
 * Run with:
 *   npx tsx --env-file=.env.local scripts/verify-timezone.ts
 *
 * The host zone is the variable under test, so run it under both:
 *   TZ=UTC        npx tsx --env-file=.env.local scripts/verify-timezone.ts
 *   TZ=Asia/Tokyo npx tsx --env-file=.env.local scripts/verify-timezone.ts
 *
 * Same output every time is the pass. It also checks that inside one run,
 * against one host, three readers in three zones each get their own wall clock
 * off the same instants.
 */
import { eq } from "drizzle-orm"

import { db } from "../lib/db"
import { getLineup } from "../lib/lineup"
import { user } from "../lib/schema"

const ACCOUNT = "dev@quincy.test"

// Fixed, so "today" cannot drift between two runs of this script.
const NOW = new Date("2026-08-04T09:00:00Z")

function check(label: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`)
  if (!ok) process.exitCode = 1
}

async function main() {
  console.log(`Host TZ is ${process.env.TZ ?? "unset"}.\n`)

  const [owner] = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(eq(user.email, ACCOUNT))
    .limit(1)

  if (!owner) {
    throw new Error(
      `No ${ACCOUNT}. Run scripts/seed-drafts.ts first — this reads real rows on purpose.`
    )
  }

  const readings = new Map<string, string[]>()

  for (const zone of ["Europe/Oslo", "UTC", "Pacific/Auckland"]) {
    const { days } = await getLineup({ ...owner, timezone: zone }, NOW)

    const lines = days.flatMap((day) =>
      day.entries.map((e) => `${day.id} ${e.time} ${e.channel}`)
    )
    readings.set(zone, lines)

    console.log(`  reader in ${zone}: opens on ${days[0].id} (${days[0].label})`)
    for (const line of lines) console.log(`    ${line}`)
  }

  console.log("")

  const oslo = readings.get("Europe/Oslo")!
  const utc = readings.get("UTC")!
  const auckland = readings.get("Pacific/Auckland")!

  check(
    "the lineup is not empty",
    oslo.length > 0,
    `${oslo.length} scheduled posts in the window`
  )

  // The same instants, so the same number of posts however they are read. A
  // reader whose day boundary falls elsewhere can legitimately see a different
  // *set* at the window edges, which is why this checks the count of the two
  // zones on the same side of UTC rather than all three.
  check(
    "every reader sees the same posts",
    oslo.length === utc.length && utc.length === auckland.length,
    `${oslo.length} / ${utc.length} / ${auckland.length}`
  )

  // The actual bug, inverted: two readers in different zones must NOT agree on
  // the wall clock, because the same instant is a different hour where they
  // are. If these matched, the zone would be being ignored again.
  check(
    "each reader gets their own wall clock",
    oslo.join() !== utc.join() && utc.join() !== auckland.join(),
    "Oslo, UTC and Auckland all differ"
  )

  // Oslo is UTC+2 in August. Every Oslo reading should be exactly two hours
  // ahead of the UTC one for the same post.
  const shifted = oslo.every((line, i) => {
    const osloHour = Number(line.split(" ")[1].slice(0, 2))
    const utcHour = Number(utc[i].split(" ")[1].slice(0, 2))
    return (utcHour + 2) % 24 === osloHour
  })
  check("Oslo reads exactly +02:00 against UTC in August", shifted)

  console.log(
    "\nRun this again with a different TZ. The three blocks above must not move."
  )
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  (error) => {
    console.error(error)
    process.exit(1)
  }
)

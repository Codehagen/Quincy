/**
 * Creates the rhythm_subscription and rhythm_run tables, and adds the two
 * adapted-from columns to `draft`. See plans/016.
 *
 * Hand-applied for the same reason scripts/apply-source-items.ts is: `drizzle/`
 * has no baseline, so a generated migration carries `CREATE TABLE` for every
 * table in the app.
 *
 * Idempotent — every statement is IF NOT EXISTS, so a second run changes
 * nothing.
 *
 * Run with: npx tsx --env-file=.env.local scripts/apply-rhythms.ts
 */
import { readFileSync } from "node:fs"
import { sql } from "drizzle-orm"

import { db } from "../lib/db"

/** Every column lib/schema-app.ts declares, and nothing may be missing. */
const EXPECTED: Record<string, string[]> = {
  rhythm_subscription: [
    "created_at",
    "enabled",
    "hour",
    "id",
    "last_run_at",
    "minute",
    "next_run_at",
    "rhythm_id",
    "running_since",
    "updated_at",
    "user_id",
    "weekday",
  ],
  rhythm_run: [
    "created_at",
    "finished_at",
    "id",
    "manual",
    "rhythm_id",
    "started_at",
    "state",
    "subscription_id",
    "summary",
    "user_id",
  ],
}

const EXPECTED_INDEXES = [
  "rhythm_subscription_user_rhythm_key",
  "rhythm_subscription_due_idx",
  "rhythm_subscription_user_idx",
  "rhythm_run_subscription_idx",
  "rhythm_run_user_started_idx",
]

/**
 * The two columns added to an existing table, checked separately.
 *
 * A missing column here is the failure mode that does not announce itself: the
 * tables above would be created, the script would report success, and every
 * adapted draft would fail on insert.
 */
const EXPECTED_DRAFT_COLUMNS = ["adapted_from_url", "adapted_from_handle"]

async function main() {
  const statements = readFileSync(
    process.argv[2] ?? "scripts/rhythms.sql",
    "utf8"
  )
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s && !s.split("\n").every((line) => line.startsWith("--")))

  for (const statement of statements) {
    const head = statement
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join(" ")
      .replace(/\s+/g, " ")
      .slice(0, 76)

    await db.execute(sql.raw(statement))
    console.log(`  ok   ${head}`)
  }

  for (const [table, expected] of Object.entries(EXPECTED)) {
    const columns = await db.execute<{
      column_name: string
      data_type: string
      is_nullable: string
    }>(sql`
      select column_name, data_type, is_nullable
      from information_schema.columns
      where table_name = ${table}
      order by column_name
    `)

    console.log(`\nColumns (${table}):`)
    for (const row of columns.rows) {
      console.log(
        `  ${row.column_name.padEnd(20)} ${row.data_type}${
          row.is_nullable === "NO" ? " not null" : ""
        }`
      )
    }

    const found = columns.rows.map((r) => r.column_name).sort()
    const missing = expected.filter((c) => !found.includes(c))
    if (missing.length > 0) {
      throw new Error(`${table}: missing columns ${missing.join(", ")}`)
    }

    // The dispatcher's cursor must be timestamptz. As a naive `timestamp` the
    // whole thing still works locally and drifts by the server's offset in
    // production, which is the failure this line exists to catch.
    if (table === "rhythm_subscription") {
      const cursor = columns.rows.find((r) => r.column_name === "next_run_at")
      if (cursor && !cursor.data_type.includes("with time zone")) {
        throw new Error(
          `rhythm_subscription.next_run_at is ${cursor.data_type}, expected timestamptz`
        )
      }
    }
  }

  const draftColumns = await db.execute<{ column_name: string }>(sql`
    select column_name from information_schema.columns
    where table_name = 'draft'
  `)
  const draftFound = draftColumns.rows.map((r) => r.column_name)
  const draftMissing = EXPECTED_DRAFT_COLUMNS.filter(
    (c) => !draftFound.includes(c)
  )
  if (draftMissing.length > 0) {
    throw new Error(`draft: missing columns ${draftMissing.join(", ")}`)
  }
  console.log(`\nDraft columns added: ${EXPECTED_DRAFT_COLUMNS.join(", ")}`)

  const indexes = await db.execute<{ indexname: string }>(sql`
    select indexname from pg_indexes
    where tablename in ('rhythm_subscription', 'rhythm_run')
    order by indexname
  `)

  const indexNames = indexes.rows.map((r) => r.indexname)
  console.log("\nIndexes:")
  for (const name of indexNames) {
    console.log(`  ${name}`)
  }

  const missingIndexes = EXPECTED_INDEXES.filter((i) => !indexNames.includes(i))
  if (missingIndexes.length > 0) {
    throw new Error(`Missing indexes: ${missingIndexes.join(", ")}`)
  }

  console.log("\nDone.")
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error)
    process.exit(1)
  }
)

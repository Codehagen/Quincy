/**
 * Adds user.onboarded_at and backfills the accounts that predate it.
 * See plans/022.
 *
 * Hand-applied for the same reason scripts/apply-import-cooldown.ts is:
 * `drizzle/` has no baseline, so a generated migration carries `CREATE TABLE`
 * for every table in the app. And `drizzle-kit push` is not an option here at
 * all — there is one Neon branch, so a push from a laptop rewrites
 * production's schema.
 *
 * Idempotent. The ALTER is IF NOT EXISTS and the backfill is bounded by a
 * literal date rather than by IS NULL, so a second run cannot mark a genuinely
 * new account as onboarded.
 *
 * Run with: npx tsx --env-file=.env.local scripts/apply-onboarded-at.ts
 */
import { readFileSync } from "node:fs"
import { sql } from "drizzle-orm"

import { db } from "../lib/db"

/** Every column plans/022 declares, and nothing may be missing. */
const EXPECTED_COLUMNS = ["onboarded_at"]

async function main() {
  const statements = readFileSync(
    process.argv[2] ?? "scripts/onboarded-at.sql",
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

  const columns = await db.execute<{
    column_name: string
    data_type: string
    is_nullable: string
  }>(sql`
    select column_name, data_type, is_nullable
    from information_schema.columns
    where table_name = 'user'
    order by column_name
  `)

  console.log("\nColumns:")
  for (const row of columns.rows) {
    console.log(
      `  ${row.column_name.padEnd(26)} ${row.data_type}${
        row.is_nullable === "NO" ? " not null" : ""
      }`
    )
  }

  const found = columns.rows.map((r) => r.column_name).sort()
  const missing = EXPECTED_COLUMNS.filter((c) => !found.includes(c))

  if (missing.length > 0) {
    throw new Error(`Missing columns: ${missing.join(", ")}`)
  }

  /**
   * Who is left unonboarded, printed rather than asserted.
   *
   * Zero is the expected answer immediately after the backfill, but a non-zero
   * count is not a failure — it is what a real signup from today looks like,
   * and this script may be re-run long after one exists.
   */
  const pending = await db.execute<{ email: string; created_at: string }>(sql`
    select email, created_at from "user"
    where onboarded_at is null
    order by created_at
  `)

  console.log(
    `\nAccounts still to be onboarded: ${pending.rows.length}${
      pending.rows.length ? "" : " (backfill covered everyone)"
    }`
  )
  for (const row of pending.rows) {
    console.log(`  ${row.email}`)
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

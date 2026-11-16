/**
 * Creates the `waitlist` table. See plans/023.
 *
 * Hand-applied for the same reason scripts/apply-onboarded-at.ts is: `drizzle/`
 * has no baseline, so a generated migration carries `CREATE TABLE` for every
 * table in the app. And `drizzle-kit push` is not an option here at all —
 * there is one Neon branch, so a push from a laptop rewrites production's
 * schema.
 *
 * Idempotent. Every statement is IF NOT EXISTS and nothing is backfilled,
 * because there is nothing to backfill: before this table existed, nobody
 * could join a waitlist.
 *
 * Run with: npx tsx --env-file=.env.local scripts/apply-waitlist.ts
 */
import { readFileSync } from "node:fs"
import { sql } from "drizzle-orm"

import { db } from "../lib/db"

/** Every column plans/023 declares, and nothing may be missing. */
const EXPECTED_COLUMNS = [
  "created_at",
  "email",
  "id",
  "invite_code",
  "invite_expires_at",
  "invited_at",
  "ip_hash",
  "note",
  "redeemed_at",
  "source",
]

/** The three the read paths depend on. A missing one is a slow bug, not a loud one. */
const EXPECTED_INDEXES = [
  "waitlist_created_idx",
  "waitlist_invite_code_idx",
  "waitlist_ip_created_idx",
]

async function main() {
  const statements = readFileSync(
    process.argv[2] ?? "scripts/waitlist.sql",
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
    where table_name = 'waitlist'
    order by column_name
  `)

  console.log("\nColumns:")
  for (const row of columns.rows) {
    console.log(
      `  ${row.column_name.padEnd(20)} ${row.data_type}${
        row.is_nullable === "NO" ? " not null" : ""
      }`
    )
  }

  const indexes = await db.execute<{ indexname: string }>(sql`
    select indexname from pg_indexes
    where tablename = 'waitlist'
    order by indexname
  `)

  console.log("\nIndexes:")
  for (const row of indexes.rows) {
    console.log(`  ${row.indexname}`)
  }

  const foundColumns = columns.rows.map((r) => r.column_name).sort()
  const missingColumns = EXPECTED_COLUMNS.filter(
    (c) => !foundColumns.includes(c)
  )

  if (missingColumns.length > 0) {
    throw new Error(`Missing columns: ${missingColumns.join(", ")}`)
  }

  const foundIndexes = indexes.rows.map((r) => r.indexname)
  const missingIndexes = EXPECTED_INDEXES.filter(
    (i) => !foundIndexes.includes(i)
  )

  if (missingIndexes.length > 0) {
    throw new Error(`Missing indexes: ${missingIndexes.join(", ")}`)
  }

  const count = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from "waitlist"`
  )

  console.log(`\nRows on the list: ${count.rows[0]?.n ?? 0}`)
  console.log("Done.")
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error)
    process.exit(1)
  }
)

/**
 * Creates the source_item table. See plans/011.
 *
 * Hand-applied for the same reason scripts/apply-channels.ts is: `drizzle/`
 * has no baseline, so a generated migration carries `CREATE TABLE` for every
 * table in the app.
 *
 * Idempotent — every statement is IF NOT EXISTS, so a second run changes
 * nothing.
 *
 * Run with: npx tsx --env-file=.env.local scripts/apply-source-items.ts
 */
import { readFileSync } from "node:fs"
import { sql } from "drizzle-orm"

import { db } from "../lib/db"

/** Every column lib/schema-app.ts declares, and nothing may be missing. */
const EXPECTED_COLUMNS = [
  "body",
  "created_at",
  "external_id",
  "id",
  "meta",
  "posted_at",
  "source",
  "url",
  "user_id",
]

const EXPECTED_INDEXES = [
  "source_item_user_source_external_key",
  "source_item_user_source_posted_idx",
]

async function main() {
  const statements = readFileSync(
    process.argv[2] ?? "scripts/source-items.sql",
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
    where table_name = 'source_item'
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

  const indexes = await db.execute<{ indexname: string }>(sql`
    select indexname from pg_indexes
    where tablename = 'source_item'
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

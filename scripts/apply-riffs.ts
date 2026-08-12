/**
 * Creates the riff and riff_angle tables. See plans/017.
 *
 * Hand-applied for the same reason scripts/apply-source-items.ts is: `drizzle/`
 * has no baseline, so a generated migration carries `CREATE TABLE` for every
 * table in the app.
 *
 * Idempotent — every statement is IF NOT EXISTS, so a second run changes
 * nothing.
 *
 * Run with: npx tsx --env-file=.env.local scripts/apply-riffs.ts
 */
import { readFileSync } from "node:fs"
import { sql } from "drizzle-orm"

import { db } from "../lib/db"

/** Every column lib/schema-app.ts declares, and nothing may be missing. */
const EXPECTED: Record<string, string[]> = {
  riff: [
    "adapted_from_handle",
    "adapted_from_url",
    "created_at",
    "id",
    "scrap",
    "source_id",
    "source_label",
    "state",
    "updated_at",
    "user_id",
  ],
  riff_angle: [
    "created_at",
    "hook",
    "id",
    "position",
    "riff_id",
    "shape",
    "why",
  ],
}

const EXPECTED_INDEXES = [
  "riff_user_created_idx",
  "riff_user_adapted_from_idx",
  "riff_angle_riff_idx",
]

async function main() {
  const statements = readFileSync(
    process.argv[2] ?? "scripts/riffs.sql",
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

  }

  const indexes = await db.execute<{ indexname: string }>(sql`
    select indexname from pg_indexes
    where tablename in ('riff', 'riff_angle')
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

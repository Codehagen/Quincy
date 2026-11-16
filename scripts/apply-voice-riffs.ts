/**
 * Adds `failure` and `started_at` to `riff`. See plans/018.
 *
 * Hand-applied for the reason scripts/apply-riffs.ts is: `drizzle/` has no
 * baseline, so a generated migration carries `CREATE TABLE` for every table in
 * the app.
 *
 * Idempotent — both statements are ADD COLUMN IF NOT EXISTS, so a second run
 * changes nothing.
 *
 * **There is one database.** A run of this from a laptop is the production
 * migration; see AGENTS.md. Both statements are additive and neither rewrites
 * an existing value, which is what makes that acceptable here rather than
 * merely survivable.
 *
 * Run with: npx tsx --env-file=.env.local scripts/apply-voice-riffs.ts
 */
import { readFileSync } from "node:fs"
import { sql } from "drizzle-orm"

import { db } from "../lib/db"

/** Every column lib/schema-app.ts declares on `riff`, and nothing may be
 *  missing. The two new ones are last. */
const EXPECTED = [
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
  "failure",
  "started_at",
]

async function main() {
  const statements = readFileSync(
    process.argv[2] ?? "scripts/voice-riffs.sql",
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
    where table_name = 'riff'
    order by column_name
  `)

  console.log("\nColumns (riff):")
  for (const row of columns.rows) {
    console.log(
      `  ${row.column_name.padEnd(20)} ${row.data_type}${
        row.is_nullable === "NO" ? " not null" : ""
      }`
    )
  }

  const found = columns.rows.map((r) => r.column_name).sort()
  const missing = EXPECTED.filter((c) => !found.includes(c))
  if (missing.length > 0) {
    throw new Error(`riff: missing columns ${missing.join(", ")}`)
  }

  /**
   * `started_at` must be nullable, and that is worth asserting rather than
   * assuming. A NOT NULL on it would be a silent lie about every riff the
   * paste box ever made: those never had a background phase, and a defaulted
   * timestamp would claim they started work at the moment of the migration.
   */
  const startedAt = columns.rows.find((r) => r.column_name === "started_at")
  if (startedAt && startedAt.is_nullable !== "YES") {
    throw new Error("riff.started_at must be nullable")
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

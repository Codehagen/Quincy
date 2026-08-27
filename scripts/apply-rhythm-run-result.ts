/**
 * Adds rhythm_run.result. See plans/027.
 *
 * Hand-applied for the same reason scripts/apply-post-metric.ts is: `drizzle/`
 * has no baseline, so a generated migration carries `CREATE TABLE` for every
 * table in the app.
 *
 * Idempotent — the one statement is IF NOT EXISTS, so a second run changes
 * nothing.
 *
 * There is one database. Running this is the production migration. See
 * AGENTS.md, "There is one database".
 *
 * Run with: npx tsx --env-file=.env.local scripts/apply-rhythm-run-result.ts
 */
import { readFileSync } from "node:fs"
import { sql } from "drizzle-orm"

import { db } from "../lib/db"

async function main() {
  const statements = readFileSync(
    process.argv[2] ?? "scripts/rhythm-run-result.sql",
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
    where table_name = 'rhythm_run'
    order by column_name
  `)

  console.log("\nColumns (rhythm_run):")
  for (const row of columns.rows) {
    console.log(
      `  ${row.column_name.padEnd(20)} ${row.data_type}${
        row.is_nullable === "NO" ? " not null" : ""
      }`
    )
  }

  /**
   * The column is checked by name, by type, and by nullability, because each
   * of the three fails differently and only the first announces itself.
   *
   * A missing column makes every `recordRun` insert throw, which the
   * dispatcher catches and logs — the work happens, the receipt is lost, and
   * the sweep reports success. A `text` column would take the write and hand
   * back a string to whoever reads it. A NOT NULL column would reject every
   * run that produced nothing, which is most of them.
   */
  const result = columns.rows.find((row) => row.column_name === "result")

  if (!result) {
    throw new Error("rhythm_run.result is missing")
  }

  if (result.data_type !== "jsonb") {
    throw new Error(`rhythm_run.result is ${result.data_type}, expected jsonb`)
  }

  if (result.is_nullable !== "YES") {
    throw new Error(
      "rhythm_run.result is NOT NULL — a run that produced nothing could not be recorded"
    )
  }

  console.log("\nrhythm_run.result  ok   jsonb, nullable")
  console.log("\nDone.")
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error)
    process.exit(1)
  }
)

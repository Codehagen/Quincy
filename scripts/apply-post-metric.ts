/**
 * Creates the post_metric table and channel_connection.last_metrics_at.
 * See plans/027, phase 2c.
 *
 * Hand-applied for the same reason scripts/apply-source-items.ts is: `drizzle/`
 * has no baseline, so a generated migration carries `CREATE TABLE` for every
 * table in the app.
 *
 * Idempotent — every statement is IF NOT EXISTS, so a second run changes
 * nothing.
 *
 * There is one database. Running this is the production migration. See
 * AGENTS.md, "There is one database".
 *
 * Run with: npx tsx --env-file=.env.local scripts/apply-post-metric.ts
 */
import { readFileSync } from "node:fs"
import { sql } from "drizzle-orm"

import { db } from "../lib/db"

/** Every column lib/schema-app.ts declares, and nothing may be missing. */
const EXPECTED_COLUMNS = [
  "bookmarks",
  "captured_at",
  "channel",
  "created_at",
  "external_id",
  "id",
  "impressions",
  "likes",
  "quotes",
  "replies",
  "reposts",
  "source_item_id",
  "user_id",
]

const EXPECTED_INDEXES = [
  "post_metric_item_captured_idx",
  "post_metric_user_captured_idx",
  "post_metric_user_post_day_key",
]

async function main() {
  const statements = readFileSync(
    process.argv[2] ?? "scripts/post-metric.sql",
    "utf8"
  )
    // Comment lines go first, before the split on ";". A semicolon inside a
    // comment is otherwise a statement boundary, and the first live run of
    // this file cut CREATE TABLE in half on exactly that.
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)

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
    where table_name = 'post_metric'
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
    where tablename = 'post_metric'
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

  /**
   * The cooldown column is checked separately because it lives on a table this
   * script did not create. A refresh with nowhere to write `last_metrics_at`
   * would claim nothing, buy a page on every invocation, and look healthy
   * doing it — which is the failure this whole guard exists to prevent.
   */
  const cooldown = await db.execute<{ column_name: string }>(sql`
    select column_name
    from information_schema.columns
    where table_name = 'channel_connection'
      and column_name = 'last_metrics_at'
  `)

  if (cooldown.rows.length === 0) {
    throw new Error("channel_connection.last_metrics_at is missing")
  }

  console.log("\nchannel_connection.last_metrics_at  ok")
  console.log("\nDone.")
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error)
    process.exit(1)
  }
)

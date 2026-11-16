/**
 * Adds the publish-outcome columns to scheduled_post.
 *
 * Hand-applied for the reason scripts/apply-channels.ts gives: `drizzle/` has
 * no baseline, so a generated migration carries `CREATE TABLE` for every table
 * in the app.
 *
 * Idempotent — every statement is IF NOT EXISTS, so a second run changes
 * nothing.
 *
 * Verifies rather than trusts. The check that matters here is not that the
 * columns arrived but that they arrived **nullable**: `scheduled_post` has rows
 * in it already, and a NOT NULL column added to a populated table either fails
 * outright or fills history with a default that claims something happened. A
 * queued post that has never been attempted must read as null in all four.
 *
 * Run with: npx tsx --env-file=.env.local scripts/apply-publish.ts
 */
import { readFileSync } from "node:fs"
import { sql } from "drizzle-orm"

import { db } from "../lib/db"

/** The four this migration adds. All must exist, all must be nullable. */
const ADDED_COLUMNS = [
  "attempted_at",
  "external_id",
  "last_error",
  "post_url",
]

/** Everything lib/schema-app.ts declares on the table, after this runs. */
const EXPECTED_COLUMNS = [
  ...ADDED_COLUMNS,
  "created_at",
  "draft_version_id",
  "id",
  "published_at",
  "scheduled_for",
  "slot_id",
  "state",
  "user_id",
]

const EXPECTED_INDEXES = [
  "scheduled_post_version_key",
  "scheduled_post_user_when_idx",
  "scheduled_post_due_idx",
]

async function main() {
  const statements = readFileSync(
    process.argv[2] ?? "scripts/publish.sql",
    "utf8"
  )
    .split(";")
    .map((s) => s.trim())
    // Strip comment-only fragments; a leading `--` block would otherwise be
    // sent to the server as a statement with nothing in it.
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
    where table_name = 'scheduled_post'
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

  const found = columns.rows.map((r) => r.column_name).sort()
  const missing = EXPECTED_COLUMNS.filter((c) => !found.includes(c))

  if (missing.length > 0) {
    throw new Error(`Missing columns: ${missing.join(", ")}`)
  }

  // The point of the assertion, not a formality. See the header.
  for (const name of ADDED_COLUMNS) {
    const column = columns.rows.find((r) => r.column_name === name)

    if (column?.is_nullable !== "YES") {
      throw new Error(
        `${name} must be nullable — a post that has never been attempted has ` +
          "nothing to say in it, and a default would claim otherwise."
      )
    }
  }

  // Both timestamps carry an instant that something other than drizzle reads:
  // the sweep compares scheduled_for against now() in SQL. A naive column makes
  // that comparison depend on the session's TimeZone, which is the bug
  // scheduled_for was made timestamptz to avoid. attempted_at sits beside it.
  for (const name of ["attempted_at", "scheduled_for", "published_at"]) {
    const column = columns.rows.find((r) => r.column_name === name)

    if (column && !column.data_type.includes("with time zone")) {
      throw new Error(
        `${name} is ${column.data_type}, not timestamptz. See the note on ` +
          "scheduledFor in lib/schema-app.ts."
      )
    }
  }

  const indexes = await db.execute<{ indexname: string }>(sql`
    select indexname from pg_indexes
    where tablename = 'scheduled_post'
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

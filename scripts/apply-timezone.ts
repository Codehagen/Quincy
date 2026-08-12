/**
 * Adds user.timezone and moves the two instant columns to timestamptz.
 *
 * Hand-applied for the same reason scripts/apply-drafts-lineup.ts is: `drizzle/`
 * has no baseline, so a generated migration carries `CREATE TABLE` for every
 * table in the app. See that file's header for the full story.
 *
 * Idempotent. The column add is `IF NOT EXISTS`, and re-typing a column that is
 * already `timestamptz` is a no-op in Postgres rather than an error, so a second
 * run changes nothing.
 *
 * Verifies rather than trusts: it reads the column types back afterwards and
 * prints them, because "the ALTER did not error" and "the column is now
 * timestamptz" are different claims and only the second one matters.
 *
 * Run with: npx tsx --env-file=.env.local scripts/apply-timezone.ts
 */
import { readFileSync } from "node:fs"
import { sql } from "drizzle-orm"

import { db } from "../lib/db"

async function main() {
  const statements = readFileSync(
    process.argv[2] ?? "scripts/timezone.sql",
    "utf8"
  )
    .split(";")
    .map((s) => s.trim())
    // Strip comment-only fragments; a leading `--` block would otherwise be sent
    // to the server as a statement with nothing in it.
    .filter((s) => s && !s.split("\n").every((line) => line.startsWith("--")))

  for (const statement of statements) {
    const head = statement
      .split("\n")
      .filter((line) => !line.startsWith("--"))
      .join(" ")
      .slice(0, 76)

    await db.execute(sql.raw(statement))
    console.log(`  ok   ${head}`)
  }

  const after = await db.execute<{
    table_name: string
    column_name: string
    data_type: string
  }>(sql`
    select table_name, column_name, data_type
    from information_schema.columns
    where (table_name = 'user' and column_name = 'timezone')
       or (table_name = 'scheduled_post'
           and column_name in ('scheduled_for', 'published_at'))
    order by table_name, column_name
  `)

  console.log("\nColumns now:")
  for (const row of after.rows) {
    console.log(`  ${row.table_name}.${row.column_name}  ${row.data_type}`)
  }

  const wrong = after.rows.filter(
    (r) =>
      r.table_name === "scheduled_post" &&
      r.data_type !== "timestamp with time zone"
  )

  if (wrong.length > 0 || after.rows.length !== 3) {
    throw new Error("Schema is not what this script set out to produce.")
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

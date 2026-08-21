/**
 * Adds user.timezone and moves the two instant columns to timestamptz.
 *
 * Hand-applied for the same reason scripts/apply-drafts-lineup.ts is: `drizzle/`
 * has no baseline, so a generated migration carries `CREATE TABLE` for every
 * table in the app. See that file's header for the full story.
 *
 * Idempotent, but not for the reason the first version of this comment gave.
 * The column add is `IF NOT EXISTS`, which is genuinely a no-op. The re-type is
 * not: a `USING` clause makes Postgres rewrite the column every time, and
 * `timestamptz AT TIME ZONE 'UTC'` on an already-converted column yields a
 * naive timestamp that is then re-read in the **session** zone. Run a second
 * time from a machine whose session TimeZone is not UTC and every queued and
 * published post silently shifts by the offset — and the verification below
 * cannot see it, because `data_type` is unchanged either way.
 *
 * So the re-type is skipped when the column already holds it. The obvious fix —
 * `SET TimeZone = 'UTC'` before the ALTERs — does not work here and is worth
 * saying out loud: `lib/db.ts` is the Neon **HTTP** driver, where every
 * `db.execute` is its own request on its own connection, so a session setting
 * is gone before the next statement is sent. A pin that does not hold, with a
 * comment saying it does, is the exact smell AGENTS.md warns about under
 * "Money" — a persuasive argument that a guard exists when it does not.
 *
 * Skipping is also the stronger property: it is immune to the session zone
 * rather than merely correcting it. `scripts/timezone.sql` warns about the
 * same hazard in its own header and remains the authority for the SQL.
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

/**
 * Which of the two instant columns still need converting.
 *
 * Asked before anything runs, because "already converted" is the only state in
 * which re-running the ALTER is destructive rather than redundant.
 */
async function alreadyConverted() {
  const rows = await db.execute<{ column_name: string; data_type: string }>(sql`
    select column_name, data_type
    from information_schema.columns
    where table_name = 'scheduled_post'
      and column_name in ('scheduled_for', 'published_at')
  `)

  const converted = rows.rows.filter(
    (r) => r.data_type === "timestamp with time zone"
  )

  return converted.length > 0 && converted.length === rows.rows.length
}

async function main() {
  const skipRetype = await alreadyConverted()

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

    // `AT TIME ZONE` identifies the two re-types and nothing else in this file.
    // Matched on the clause rather than on the column names so a third instant
    // column added to timezone.sql inherits the guard instead of missing it.
    if (skipRetype && statement.includes("AT TIME ZONE")) {
      console.log(`  skip ${head}`)
      console.log(
        `       already timestamptz — re-running this would re-interpret ` +
          `every stored instant in the session's zone.`
      )
      continue
    }

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

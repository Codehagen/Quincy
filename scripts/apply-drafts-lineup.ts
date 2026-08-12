/**
 * Creates the drafts and lineup tables.
 *
 * Hand-applied rather than run through `drizzle-kit migrate`, because this
 * project has always used `db:push` and `drizzle/` had no baseline — a
 * generated migration therefore contains `CREATE TABLE` for *every* table in
 * the app, which would fail on the first one that already exists. The SQL below
 * is drizzle's own output for the four new tables, lifted out of that file so
 * nothing is hand-written and nothing touches a table that is already there.
 *
 * Idempotent by inspection: it checks what exists before it writes, so running
 * it twice is a no-op rather than an error.
 *
 * Run with: npx tsx --env-file=.env.local scripts/apply-drafts-lineup.ts scripts/drafts-lineup.sql
 */
import { readFileSync } from "node:fs"
import { sql } from "drizzle-orm"

import { db } from "../lib/db"

const TABLES = ["draft", "draft_version", "slot", "scheduled_post"]

async function main() {
  const existing = await db.execute<{ table_name: string }>(
    sql`select table_name from information_schema.tables where table_schema = 'public'`
  )
  const have = new Set(existing.rows.map((r) => r.table_name))
  const missing = TABLES.filter((t) => !have.has(t))

  if (missing.length === 0) {
    console.log("All four tables already exist. Nothing to do.")
    return
  }

  console.log(`Creating: ${missing.join(", ")}`)

  const statements = readFileSync(
    process.argv[2] ?? "scripts/drafts-lineup.sql",
    "utf8"
  )
    .split(/\n\n(?=CREATE|ALTER)/)
    .map((s) => s.trim())
    .filter(Boolean)

  for (const statement of statements) {
    const head = statement.split("\n")[0].slice(0, 76)
    try {
      await db.execute(sql.raw(statement))
      console.log(`  ok   ${head}`)
    } catch (error) {
      // Already-exists is the expected outcome on a partial re-run; anything
      // else should stop the script rather than leave a half-built schema.
      const message = error instanceof Error ? error.message : String(error)
      if (/already exists/i.test(message)) {
        console.log(`  skip ${head}`)
        continue
      }
      throw error
    }
  }

  console.log("Done.")
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error)
    process.exit(1)
  }
)

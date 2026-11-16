/**
 * Adds the five video_asset columns that describe a filmstrip sheet.
 *
 * Hand-applied for the same reason scripts/apply-video.ts is: `drizzle/` has no
 * baseline, so a generated migration carries `CREATE TABLE` for every table in
 * the app. See that file's header for the full story.
 *
 * Idempotent — every add is `IF NOT EXISTS`, so a second run changes nothing.
 *
 * Verifies rather than trusts: it reads the columns back afterwards and throws
 * if they are not all there, because "the ALTER did not error" and "the columns
 * exist with the right types" are different claims and only the second matters.
 *
 * Run with: npx tsx --env-file=.env.local scripts/apply-filmstrip.ts
 */
import { readFileSync } from "node:fs"
import { sql } from "drizzle-orm"

import { db } from "../lib/db"

const EXPECTED: Record<string, string> = {
  filmstrip_key: "text",
  filmstrip_tiles: "integer",
  filmstrip_interval_us: "bigint",
  filmstrip_tile_width: "integer",
  filmstrip_tile_height: "integer",
}

async function main() {
  const statements = readFileSync(
    process.argv[2] ?? "scripts/filmstrip.sql",
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
    column_name: string
    data_type: string
  }>(sql`
    select column_name, data_type
    from information_schema.columns
    where table_name = 'video_asset'
      and column_name like 'filmstrip%'
    order by column_name
  `)

  console.log("\nColumns now:")
  for (const row of after.rows) {
    console.log(`  video_asset.${row.column_name}  ${row.data_type}`)
  }

  const found = new Map(after.rows.map((r) => [r.column_name, r.data_type]))
  const missing = Object.keys(EXPECTED).filter((name) => !found.has(name))

  if (missing.length > 0) {
    throw new Error(`Missing after apply: ${missing.join(", ")}`)
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

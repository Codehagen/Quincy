/**
 * Adds `riff.source_item_id` and `riff.context`. See plans/026.
 *
 * Hand-applied for the reason scripts/apply-voice-riffs.ts is: `drizzle/` has
 * no baseline, so a generated migration carries `CREATE TABLE` for every table
 * in the app.
 *
 * Idempotent — both statements are ADD COLUMN IF NOT EXISTS, so a second run
 * changes nothing.
 *
 * **There is one database.** A run of this from a laptop is the production
 * migration; see AGENTS.md. Both statements are additive and neither rewrites
 * an existing value, which is what makes that acceptable here rather than
 * merely survivable. There is no `--target` and no guard from
 * scripts/target-guard.ts, because this touches no account's rows: the guard
 * asks "may I destroy what this address owns", and a column added to a table
 * owns nothing. The seed and verify scripts are the ones that need it.
 *
 * Run with: npx tsx --env-file=.env.local scripts/apply-riff-context.ts
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
  "failure",
  "id",
  "scrap",
  "source_id",
  "source_label",
  "started_at",
  "state",
  "updated_at",
  "user_id",
  "source_item_id",
  "context",
]

/**
 * The comments go before the split, not after it.
 *
 * scripts/apply-voice-riffs.ts splits on the separator first and then drops any
 * chunk that is comments all the way down, and that is a rule about prose
 * dressed up as a parser: a single semicolon in an English sentence cuts the
 * header in half, and the *second* half starts mid-sentence rather than with
 * `--`, so it survives the filter and is handed to Postgres as SQL. The review
 * of 2026-08-25 ran this over riff-context.sql and got three statements out of
 * a two-statement file, the first being the tail of a paragraph about foreign
 * keys.
 *
 * Removing whole-line comments first makes the file's own NOTE unnecessary —
 * which is the point. A warning that a mistake is possible is worth less than
 * an arrangement in which it is not, and this one is three lines.
 */
function statementsIn(file: string): string[] {
  return file
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean)
}

async function main() {
  const statements = statementsIn(
    readFileSync(process.argv[2] ?? "scripts/riff-context.sql", "utf8")
  )

  for (const statement of statements) {
    const head = statement.replace(/\s+/g, " ").slice(0, 76)

    await db.execute(sql.raw(statement))
    console.log(`  ok   ${head}`)
  }

  const columns = await db.execute<{
    column_name: string
    data_type: string
    is_nullable: string
    column_default: string | null
  }>(sql`
    select column_name, data_type, is_nullable, column_default
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
   * Asserted rather than assumed, the same pair
   * scripts/apply-source-connection-meta.ts checks.
   *
   * `jsonb` and not `json`: the app reads this column through a Drizzle
   * `$type` declaration, which is a compile-time claim that a `json` column
   * would satisfy at runtime while comparison and indexing behaved
   * differently.
   *
   * NOT NULL, because the whole point of the default is that every read path
   * gets an object. `describeMaterial` in app/(app)/riffs/actions.ts narrows
   * whatever it is handed, so a null would not crash — it would silently drop
   * the block for every riff written before the migration, which is the kind
   * of fault nobody looks for.
   */
  const context = columns.rows.find((r) => r.column_name === "context")

  if (context?.data_type !== "jsonb") {
    throw new Error(`riff.context is ${context?.data_type}, not jsonb`)
  }

  if (context.is_nullable !== "NO") {
    throw new Error("riff.context must be not null")
  }

  /**
   * `source_item_id` must be NOT NULL too, and for a sharper reason than
   * tidiness: it is read as a string everywhere and the empty string is the
   * real value for a riff that was typed. A nullable column would make "no
   * upstream row" and "we do not know" two spellings of the same fact, which
   * is exactly the ambiguity the default removes.
   */
  const sourceItemId = columns.rows.find(
    (r) => r.column_name === "source_item_id"
  )

  if (sourceItemId?.is_nullable !== "NO") {
    throw new Error("riff.source_item_id must be not null")
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

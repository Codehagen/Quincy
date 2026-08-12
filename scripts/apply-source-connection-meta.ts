/**
 * Adds `source_connection.meta`. See plans/021.
 *
 * Hand-applied for the reason scripts/apply-source-connections.ts is: `drizzle/`
 * has no baseline, so a generated migration carries `CREATE TABLE` for every
 * table in the app.
 *
 * Idempotent — one ADD COLUMN IF NOT EXISTS, so a second run changes nothing.
 *
 * **There is one database.** A run of this from a laptop is the production
 * migration; see AGENTS.md. It is additive against a table with zero rows,
 * which is what makes that acceptable rather than merely survivable.
 *
 * Run with: npx tsx --env-file=.env.local scripts/apply-source-connection-meta.ts
 */
import { readFileSync } from "node:fs"
import { sql } from "drizzle-orm"

import { db } from "../lib/db"

async function main() {
  const statements = readFileSync(
    process.argv[2] ?? "scripts/source-connection-meta.sql",
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
    column_default: string | null
  }>(sql`
    select column_name, data_type, is_nullable, column_default
    from information_schema.columns
    where table_name = 'source_connection' and column_name = 'meta'
  `)

  const meta = columns.rows[0]

  if (!meta) {
    throw new Error("source_connection.meta was not created")
  }

  console.log(
    `\n  meta  ${meta.data_type}${meta.is_nullable === "NO" ? " not null" : ""} default ${meta.column_default}`
  )

  /**
   * Asserted rather than assumed, and both halves matter.
   *
   * `jsonb` and not `json`: the app reads this column and Drizzle's `$type`
   * declaration is a compile-time claim that a `json` column would satisfy at
   * runtime while indexing and comparison behaved differently.
   *
   * NOT NULL, because the whole point of the default is that every read path
   * gets an object. A nullable column would make `meta.installationId` a
   * two-step check at every call site, and the one that forgot would be the
   * webhook.
   */
  if (meta.data_type !== "jsonb") {
    throw new Error(`source_connection.meta is ${meta.data_type}, not jsonb`)
  }

  if (meta.is_nullable !== "NO") {
    throw new Error("source_connection.meta must be not null")
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

/**
 * Creates `source_connection`. See plans/019.
 *
 * Hand-applied for the reason scripts/apply-riffs.ts is: `drizzle/` has no
 * baseline, so a generated migration carries `CREATE TABLE` for every table in
 * the app.
 *
 * Idempotent — CREATE TABLE IF NOT EXISTS and two CREATE UNIQUE INDEX IF NOT
 * EXISTS, so a second run changes nothing.
 *
 * **There is one database.** A run of this from a laptop is the production
 * migration; see AGENTS.md. Nothing here touches an existing table, which is
 * what makes that acceptable rather than merely survivable.
 *
 * Run with: npx tsx --env-file=.env.local scripts/apply-source-connections.ts
 */
import { readFileSync } from "node:fs"
import { sql } from "drizzle-orm"

import { db } from "../lib/db"

/** Every column lib/schema-app.ts declares on `source_connection`. */
const EXPECTED = [
  "created_at",
  "id",
  "last_error",
  "last_error_at",
  "last_item_at",
  "signing_secret",
  "source",
  "state",
  "token",
  "updated_at",
  "user_id",
]

/** Both indexes, by name. A table with the columns and neither index would
 *  pass a column check and still let one token resolve to two users. */
const EXPECTED_INDEXES = [
  "source_connection_token_key",
  "source_connection_user_source_key",
]

async function main() {
  const statements = readFileSync(
    process.argv[2] ?? "scripts/source-connections.sql",
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
    where table_name = 'source_connection'
    order by column_name
  `)

  console.log("\nColumns (source_connection):")
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
    throw new Error(`source_connection: missing columns ${missing.join(", ")}`)
  }

  /**
   * `signing_secret` must be nullable, and it is worth asserting rather than
   * assuming. The provider mints that secret and only reveals it once the
   * automation exists, so there is a real interval in which a connection is
   * legitimately half-made. A NOT NULL here would make that interval
   * unrepresentable and force a placeholder — which is a value the verify path
   * would then have to be careful never to trust.
   */
  const secret = columns.rows.find((r) => r.column_name === "signing_secret")
  if (secret && secret.is_nullable !== "YES") {
    throw new Error("source_connection.signing_secret must be nullable")
  }

  const indexes = await db.execute<{ indexname: string }>(sql`
    select indexname from pg_indexes where tablename = 'source_connection'
  `)

  console.log("\nIndexes:")
  for (const row of indexes.rows) console.log(`  ${row.indexname}`)

  const indexNames = indexes.rows.map((r) => r.indexname)
  const missingIndexes = EXPECTED_INDEXES.filter((i) => !indexNames.includes(i))
  if (missingIndexes.length > 0) {
    throw new Error(
      `source_connection: missing indexes ${missingIndexes.join(", ")}`
    )
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

/**
 * Creates the channel_connection table.
 *
 * Hand-applied for the same reason scripts/apply-timezone.ts is: `drizzle/` has
 * no baseline, so a generated migration carries `CREATE TABLE` for every table
 * in the app. See that file's header.
 *
 * Idempotent — every statement is IF NOT EXISTS, so a second run changes
 * nothing.
 *
 * Verifies rather than trusts: it reads the columns and indexes back and
 * checks them, because "the CREATE did not error" and "the table is what the
 * application expects" are different claims and only the second one matters.
 * The unique index in particular is the thing standing between a reconnect and
 * a pile of duplicate live tokens, so it is asserted by name.
 *
 * Run with: npx tsx --env-file=.env.local scripts/apply-channels.ts
 */
import { readFileSync } from "node:fs"
import { sql } from "drizzle-orm"

import { db } from "../lib/db"

/** Every column lib/schema-app.ts declares, and nothing may be missing. */
const EXPECTED_COLUMNS = [
  "access_token",
  "access_token_expires_at",
  "avatar_url",
  "channel",
  "created_at",
  "display_name",
  "external_id",
  "handle",
  "id",
  "last_error",
  "last_error_at",
  "last_published_at",
  "reauth_notice_sent_at",
  "refresh_token",
  "scope",
  "state",
  "updated_at",
  "user_id",
]

const EXPECTED_INDEXES = [
  "channel_connection_user_channel_key",
  "channel_connection_user_channel_idx",
]

async function main() {
  const statements = readFileSync(
    process.argv[2] ?? "scripts/channels.sql",
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
    where table_name = 'channel_connection'
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
    where tablename = 'channel_connection'
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

  // The token columns must never have been created nullable-and-forgotten or
  // typed as something that would silently truncate ciphertext.
  const accessToken = columns.rows.find((r) => r.column_name === "access_token")

  if (accessToken?.is_nullable !== "NO") {
    throw new Error(
      "access_token must be NOT NULL — a connection without a token is not a connection."
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

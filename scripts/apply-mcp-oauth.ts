/**
 * Creates the three tables Better Auth's `mcp` plugin needs.
 * See plans/027, phase 4e, and docs/mcp.md.
 *
 * Hand-applied for the same reason scripts/apply-post-metric.ts is: `drizzle/`
 * has no baseline, so a generated migration carries `CREATE TABLE` for every
 * table in the app.
 *
 * Idempotent — every statement is IF NOT EXISTS, so a second run changes
 * nothing.
 *
 * There is one database. Running this is the production migration. See
 * AGENTS.md, "There is one database".
 *
 * The tables it creates are declared by hand in lib/schema.ts, in a block
 * marked as such. `pnpm auth:generate` is what proves that block right, and it
 * is owed: run it and compare before trusting either.
 *
 * Run with: npx tsx --env-file=.env.local scripts/apply-mcp-oauth.ts
 */
import { readFileSync } from "node:fs"
import { sql } from "drizzle-orm"

import { db } from "../lib/db"

/**
 * Every column the plugin writes, per table.
 *
 * Checked rather than assumed, because the failure this guards against is
 * silent: a missing column does not stop the server, it stops the *first*
 * person who tries to connect a client — and it surfaces as an OAuth error in
 * somebody else's tool, which is the hardest place in the world to read a
 * Postgres message.
 */
const EXPECTED: Record<string, string[]> = {
  oauth_application: [
    "client_id",
    "client_secret",
    "created_at",
    "disabled",
    "icon",
    "id",
    "metadata",
    "name",
    "redirect_urls",
    "type",
    "updated_at",
    "user_id",
  ],
  oauth_access_token: [
    "access_token",
    "access_token_expires_at",
    "client_id",
    "created_at",
    "id",
    "refresh_token",
    "refresh_token_expires_at",
    "scopes",
    "updated_at",
    "user_id",
  ],
  oauth_consent: [
    "client_id",
    "consent_given",
    "created_at",
    "id",
    "scopes",
    "updated_at",
    "user_id",
  ],
}

const EXPECTED_INDEXES = [
  "oauth_access_token_clientId_idx",
  "oauth_access_token_userId_idx",
  "oauth_application_userId_idx",
  "oauth_consent_clientId_idx",
  "oauth_consent_userId_idx",
]

async function main() {
  const statements = readFileSync(
    process.argv[2] ?? "scripts/mcp-oauth.sql",
    "utf8"
  )
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s && !s.split("\n").every((line) => line.trim().startsWith("--")))

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

  for (const [table, expected] of Object.entries(EXPECTED)) {
    const columns = await db.execute<{
      column_name: string
      data_type: string
      is_nullable: string
    }>(
      sql`
        select column_name, data_type, is_nullable
        from information_schema.columns
        where table_name = ${table}
        order by column_name
      `
    )

    console.log(`\n${table}:`)
    for (const row of columns.rows) {
      console.log(
        `  ${row.column_name.padEnd(26)} ${row.data_type}${
          row.is_nullable === "NO" ? " not null" : ""
        }`
      )
    }

    const found = columns.rows.map((r) => r.column_name)
    const missing = expected.filter((c) => !found.includes(c))

    if (missing.length > 0) {
      throw new Error(`${table} is missing: ${missing.join(", ")}`)
    }
  }

  const indexes = await db.execute<{ indexname: string }>(sql`
    select indexname from pg_indexes
    where tablename in ('oauth_application', 'oauth_access_token', 'oauth_consent')
    order by indexname
  `)

  const names = indexes.rows.map((r) => r.indexname)

  console.log("\nIndexes:")
  for (const name of names) {
    console.log(`  ${name}`)
  }

  const missingIndexes = EXPECTED_INDEXES.filter((i) => !names.includes(i))

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

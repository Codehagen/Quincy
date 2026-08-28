/**
 * Applies scripts/account-issuer.sql: `account.issuer` and the rest of what
 * Better Auth 1.7 tightened. See the SQL for the argument.
 *
 * Hand-applied for the same reason scripts/apply-post-metric.ts is: `drizzle/`
 * has no baseline, so a generated migration carries `CREATE TABLE` for every
 * table in the app.
 *
 * Idempotent — see the SQL. A second run changes nothing.
 *
 * There is one database. Running this is the production migration. See
 * AGENTS.md, "There is one database".
 *
 * Run with: npx tsx --env-file=.env.local scripts/apply-account-issuer.ts
 */
import { readFileSync } from "node:fs"
import { sql } from "drizzle-orm"

import { db } from "../lib/db"

/** Column, table, and the nullability 1.7 requires of it. */
const EXPECTED_NOT_NULL: Array<[table: string, column: string]> = [
  ["account", "issuer"],
  ["subscription", "status"],
  ["oauth_refresh_token", "expires_at"],
  ["oauth_refresh_token", "created_at"],
  ["oauth_access_token", "token"],
  ["oauth_access_token", "expires_at"],
  ["oauth_access_token", "created_at"],
  ["oauth_consent", "created_at"],
  ["oauth_consent", "updated_at"],
]

const EXPECTED_INDEXES: Array<[table: string, index: string]> = [
  ["account", "account_issuer_accountId_uidx"],
  ["oauth_client_resource", "oauthClientResource_clientId_resourceId_uidx"],
]

async function main() {
  const statements = readFileSync(
    process.argv[2] ?? "scripts/account-issuer.sql",
    "utf8"
  )
    // Comment lines go first, before the split on ";". A semicolon inside a
    // comment is otherwise a statement boundary, and that is what cut a
    // CREATE TABLE in half on the first live run of apply-post-metric.ts.
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)

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

  /**
   * The assertions in the SQL run before the locks and fail the migration.
   * These run after it and check the shape that came out, which is the half
   * that a partially-applied earlier run would leave wrong.
   */
  const columns = await db.execute<{
    table_name: string
    column_name: string
    is_nullable: string
  }>(sql`
    select table_name::text, column_name::text, is_nullable::text
    from information_schema.columns
    where table_schema = 'public'
      and table_name in (
        'account',
        'subscription',
        'oauth_refresh_token',
        'oauth_access_token',
        'oauth_consent'
      )
    order by table_name, column_name
  `)

  const nullability = new Map(
    columns.rows.map((r) => [`${r.table_name}.${r.column_name}`, r.is_nullable])
  )

  console.log("\nNot null:")
  for (const [table, column] of EXPECTED_NOT_NULL) {
    const state = nullability.get(`${table}.${column}`)
    console.log(
      `  ${`${table}.${column}`.padEnd(36)} ${
        state === "NO" ? "not null" : state === "YES" ? "NULLABLE" : "MISSING"
      }`
    )
  }

  const wrong = EXPECTED_NOT_NULL.filter(
    ([table, column]) => nullability.get(`${table}.${column}`) !== "NO"
  )

  if (wrong.length > 0) {
    throw new Error(
      `Missing or still nullable: ${wrong.map(([t, c]) => `${t}.${c}`).join(", ")}`
    )
  }

  const indexes = await db.execute<{ tablename: string; indexname: string }>(sql`
    select tablename, indexname from pg_indexes
    where tablename in ('account', 'oauth_client_resource')
    order by tablename, indexname
  `)

  console.log("\nIndexes:")
  for (const row of indexes.rows) {
    console.log(`  ${row.tablename.padEnd(24)} ${row.indexname}`)
  }

  const missingIndexes = EXPECTED_INDEXES.filter(
    ([table, index]) =>
      !indexes.rows.some(
        (r) => r.tablename === table && r.indexname === index
      )
  )

  if (missingIndexes.length > 0) {
    throw new Error(
      `Missing indexes: ${missingIndexes.map(([t, i]) => `${t}.${i}`).join(", ")}`
    )
  }

  /**
   * The values, not just the shape. A column that is NOT NULL and full of the
   * wrong string is exactly as migrated as one full of the right one, and the
   * failure it causes is a 401 at sign-in rather than an error here.
   */
  const issuers = await db.execute<{
    provider_id: string
    issuer: string
    n: number
  }>(sql`
    select provider_id, issuer, count(*)::int as n
    from account group by provider_id, issuer order by provider_id, issuer
  `)

  console.log("\nIssuers:")
  for (const row of issuers.rows) {
    console.log(
      `  ${row.provider_id.padEnd(16)} ${row.issuer.padEnd(32)} ${row.n}`
    )
  }

  const unexpected = issuers.rows.filter(
    (row) =>
      !(row.provider_id === "credential" && row.issuer === "local:credential") &&
      !(
        row.provider_id === "google" &&
        row.issuer === "https://accounts.google.com"
      )
  )

  if (unexpected.length > 0) {
    throw new Error(
      `Unexpected issuer: ${unexpected
        .map((r) => `${r.provider_id} -> ${r.issuer}`)
        .join(", ")}`
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

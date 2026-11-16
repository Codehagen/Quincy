/**
 * Creates the eight tables `@better-auth/mcp` 1.7 needs. See docs/mcp.md.
 *
 * Hand-applied for the same reason scripts/apply-post-metric.ts is: `drizzle/`
 * has no baseline, so a generated migration carries `CREATE TABLE` for every
 * table in the app.
 *
 * Idempotent — every statement is IF NOT EXISTS, so a second run changes
 * nothing. It drops nothing either: the 1.6 three-table version of this script
 * was never applied, so there is no `oauth_application` to migrate and no
 * client data to move.
 *
 * There is one database. Running this is the production migration. See
 * AGENTS.md, "There is one database".
 *
 * The tables it creates are declared in lib/schema.ts, which is the output of
 * `pnpm auth:generate`. The two files were written from the same generator run
 * and have to stay that way — the assertions below are what proves it.
 *
 * **The order to do this in.** Apply this first, then deploy. The provider
 * tolerates a missing `oauth_resource` at boot by deferring its seed, so an app
 * deployed ahead of the migration starts and merely cannot serve OAuth; but
 * `jwks` has no such tolerance, and without it the first token request fails at
 * signing.
 *
 * Run with: npx tsx --env-file=.env.local scripts/apply-mcp-oauth.ts
 */
import { readFileSync } from "node:fs"
import { sql } from "drizzle-orm"

import { db } from "../lib/db"

/**
 * Every column the provider writes, per table.
 *
 * Checked rather than assumed, because the failure this guards against is
 * silent: a missing column does not stop the server, it stops the *first*
 * person who tries to connect a client — and it surfaces as an OAuth error in
 * somebody else's tool, which is the hardest place in the world to read a
 * Postgres message.
 */
const EXPECTED: Record<string, string[]> = {
  jwks: [
    "alg",
    "created_at",
    "crv",
    "expires_at",
    "id",
    "private_key",
    "public_key",
  ],
  oauth_client: [
    "application_type",
    "backchannel_logout_session_required",
    "backchannel_logout_uri",
    "client_credentials_scopes",
    "client_discovery_id",
    "client_id",
    "client_secret",
    "contacts",
    "created_at",
    "disabled",
    "dpop_bound_access_tokens",
    "grant_types",
    "icon",
    "id",
    "jwks",
    "jwks_uri",
    "metadata",
    "name",
    "policy",
    "post_logout_redirect_uris",
    "redirect_uris",
    "reference_id",
    "require_pkce",
    "response_types",
    "scopes",
    "skip_consent",
    "enable_end_session",
    "software_id",
    "software_statement",
    "software_version",
    "subject_type",
    "token_endpoint_auth_method",
    "tos",
    "updated_at",
    "uri",
    "user_id",
  ],
  oauth_resource: [
    "access_token_ttl",
    "allowed_scopes",
    "created_at",
    "custom_claims",
    "disabled",
    "dpop_bound_access_tokens_required",
    "id",
    "identifier",
    "metadata",
    "name",
    "policy_version",
    "refresh_token_ttl",
    "signing_algorithm",
    "signing_key_id",
    "updated_at",
  ],
  oauth_client_resource: [
    "client_id",
    "created_at",
    "id",
    "metadata",
    "resource_id",
  ],
  oauth_refresh_token: [
    "auth_time",
    "authorization_code_id",
    "client_id",
    "confirmation",
    "created_at",
    "expires_at",
    "id",
    "reference_id",
    "requested_user_info_claims",
    "resources",
    "revoked",
    "rotated_at",
    "rotation_replay_expires_at",
    "rotation_replay_response",
    "scopes",
    "session_id",
    "token",
    "user_id",
  ],
  oauth_access_token: [
    "authorization_code_id",
    "client_id",
    "confirmation",
    "created_at",
    "expires_at",
    "id",
    "reference_id",
    "refresh_id",
    "requested_user_info_claims",
    "resources",
    "revoked",
    "scopes",
    "session_id",
    "token",
    "user_id",
  ],
  oauth_consent: [
    "client_id",
    "created_at",
    "id",
    "reference_id",
    "requested_user_info_claims",
    "resources",
    "scopes",
    "updated_at",
    "user_id",
  ],
  oauth_client_assertion: ["expires_at", "id"],
}

const EXPECTED_INDEXES = [
  "oauthAccessToken_authorizationCodeId_idx",
  "oauthAccessToken_clientId_idx",
  "oauthAccessToken_refreshId_idx",
  "oauthAccessToken_sessionId_idx",
  "oauthAccessToken_userId_idx",
  "oauthClientResource_clientId_idx",
  "oauthClientResource_clientId_resourceId_uidx",
  "oauthClientResource_resourceId_idx",
  "oauthClient_userId_idx",
  "oauthConsent_clientId_idx",
  "oauthConsent_userId_idx",
  "oauthRefreshToken_authorizationCodeId_idx",
  "oauthRefreshToken_clientId_idx",
  "oauthRefreshToken_sessionId_idx",
  "oauthRefreshToken_userId_idx",
]

/**
 * The columns 1.7 declares NOT NULL, per table.
 *
 * Names alone stopped being enough at 1.7. The generator tightened seven
 * columns the provider had always written on every insert, and a column that
 * exists but still allows null is invisible to a `column_name` check while
 * being exactly the drift this script exists to catch: drizzle-kit would plan
 * an ALTER on the next push, and a row written by hand or by an older build
 * would pass the database and fail the reader.
 *
 * Compared against `is_nullable`, which is the only place the fact lives.
 */
const EXPECTED_NOT_NULL: Record<string, string[]> = {
  oauth_refresh_token: ["expires_at", "created_at"],
  oauth_access_token: ["token", "expires_at", "created_at"],
  oauth_consent: ["created_at", "updated_at"],
}

/**
 * The 1.6 table this replaced. It was never created, and finding one means
 * somebody applied the old script — in which case `oauth_access_token` and
 * `oauth_consent` already exist in the wrong shape and IF NOT EXISTS would
 * leave them there. Refuse rather than half-migrate.
 */
const FORBIDDEN_TABLE = "oauth_application"

async function main() {
  const legacy = await db.execute<{ table_name: string }>(sql`
    select table_name from information_schema.tables
    where table_schema = 'public' and table_name = ${FORBIDDEN_TABLE}
  `)

  if (legacy.rows.length > 0) {
    throw new Error(
      `${FORBIDDEN_TABLE} exists, so the 1.6 schema was applied after all. ` +
        "The 1.7 tables cannot be created over it with IF NOT EXISTS — move " +
        "the client rows into oauth_client by hand first. See docs/mcp.md."
    )
  }

  const statements = readFileSync(
    process.argv[2] ?? "scripts/mcp-oauth.sql",
    "utf8"
  )
    // Comment lines go first, before the split on ";". A semicolon inside a
    // comment is otherwise a statement boundary; the post-metric script cut
    // CREATE TABLE in half on exactly that on its first live run.
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
        `  ${row.column_name.padEnd(36)} ${row.data_type}${
          row.is_nullable === "NO" ? " not null" : ""
        }`
      )
    }

    const found = columns.rows.map((r) => r.column_name)
    const missing = expected.filter((c) => !found.includes(c))

    if (missing.length > 0) {
      throw new Error(`${table} is missing: ${missing.join(", ")}`)
    }

    const nullable = new Set(
      columns.rows.filter((r) => r.is_nullable === "YES").map((r) => r.column_name)
    )
    const loose = (EXPECTED_NOT_NULL[table] ?? []).filter((c) => nullable.has(c))

    if (loose.length > 0) {
      throw new Error(
        `${table} still allows null on: ${loose.join(", ")} — run ` +
          "scripts/apply-account-issuer.ts, which tightens them on a database " +
          "created from the pre-1.7 shape of scripts/mcp-oauth.sql."
      )
    }
  }

  const indexes = await db.execute<{ indexname: string }>(sql`
    select indexname from pg_indexes
    where tablename in (
      'jwks',
      'oauth_client',
      'oauth_resource',
      'oauth_client_resource',
      'oauth_refresh_token',
      'oauth_access_token',
      'oauth_consent',
      'oauth_client_assertion'
    )
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

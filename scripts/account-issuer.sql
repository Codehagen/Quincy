-- What Better Auth 1.7 added to the tables it owns.
--
-- The headline is `account.issuer`. 1.7 stopped recognising an account by
-- (provider_id, account_id) and started recognising it by (issuer, account_id):
-- a provider id is a name this app chose, an issuer is a name the identity
-- provider answers to, and only the second one is safe to make unique across
-- providers. The column is NOT NULL in the 1.7 schema, so an unmigrated
-- database answers every sign-up with `The field "issuer" does not exist in
-- the "account" Drizzle schema`.
--
-- Every statement is idempotent: ADD COLUMN IF NOT EXISTS, an UPDATE that only
-- sees null rows, SET NOT NULL on an already-not-null column, and
-- CREATE INDEX IF NOT EXISTS. A second run changes nothing.
--
-- There is one database. Running this is the production migration. See
-- AGENTS.md, "There is one database".
--
-- Apply with: npx tsx --env-file=.env.local scripts/apply-account-issuer.ts

-- ---------------------------------------------------------------------------
-- account.issuer
-- ---------------------------------------------------------------------------

-- Nullable first. The column is NOT NULL in the end, but adding it that way on
-- a populated table needs a default, and the only honest default is per-row.
ALTER TABLE "account"
  ADD COLUMN IF NOT EXISTS "issuer" text;

-- Password accounts. Better Auth has no issuer for a credential it stores
-- itself, so it mints a synthetic one — `local:` plus the URI-encoded provider
-- id. `createLocalAccountIssuer("credential")` in
-- @better-auth/core/src/db/schema/account.ts:51 is the definition, and
-- api/routes/sign-up.mjs:246, api/routes/sign-in.mjs:319,
-- api/routes/password.mjs:167 and api/routes/update-user.mjs:223 are the four
-- places 1.7 writes or matches it. Getting this string wrong does not error —
-- sign-in simply stops finding the credential row and answers 401.
UPDATE "account"
  SET "issuer" = 'local:credential'
  WHERE "provider_id" = 'credential'
    AND "issuer" IS NULL;

-- Google. Note that this is NOT the synthetic `local:oauth:google`: the
-- built-in provider declares a real issuer of its own
-- (`accountIssuer: "https://accounts.google.com"`,
-- @better-auth/core/src/social-providers/google.ts:154), and
-- resolveOAuthAccountKey in better-auth/dist/oauth2/account-key.mjs:25 only
-- falls back to `createOAuthAccountIssuer(provider.id)` when a provider
-- declares none. A backfill to the synthetic value would leave the live Google
-- account unmatchable at the next sign-in, and account linking would build a
-- second row beside it.
UPDATE "account"
  SET "issuer" = 'https://accounts.google.com'
  WHERE "provider_id" = 'google'
    AND "issuer" IS NULL;

-- Three assertions before the column is locked down. Each is one statement so
-- the splitter in apply-account-issuer.ts cannot cut it in half, and each
-- fails by casting its own message to an integer — the message is the error.
--
-- 1. Nothing is left null. This is also the guard against a provider nobody
--    listed above: an unknown provider_id is not backfilled by either UPDATE,
--    so it stops the migration here instead of being invented a value.
SELECT CASE WHEN count(*) = 0 THEN 0 ELSE
  ('account.issuer is still null on ' || count(*) ||
   ' row(s) — add the provider to this file rather than guessing a value')::int
END FROM "account" WHERE "issuer" IS NULL;

-- 2. Every credential row is keyed on its own user id, which is what 1.7
--    matches on (sign-in.mjs:319 requires accountId === user.id). Asserted
--    rather than rewritten: an account_id that is not the user id means
--    something wrote this row by hand, and rewriting it would hide that.
SELECT CASE WHEN count(*) = 0 THEN 0 ELSE
  ('credential account_id does not equal user_id on ' || count(*) ||
   ' row(s) — 1.7 sign-in would not find them')::int
END FROM "account" WHERE "provider_id" = 'credential' AND "account_id" <> "user_id";

-- 3. No two rows now share (issuer, account_id). The unique index below would
--    fail on a collision, and it is worth saying which pairs collided rather
--    than letting Postgres name one index and stop.
SELECT CASE WHEN count(*) = 0 THEN 0 ELSE
  ('(issuer, account_id) collides on ' || count(*) ||
   ' pair(s) — the unique index cannot be created')::int
END FROM (
  SELECT "issuer", "account_id" FROM "account"
  GROUP BY "issuer", "account_id" HAVING count(*) > 1
) AS dup;

ALTER TABLE "account"
  ALTER COLUMN "issuer" SET NOT NULL;

-- The name is the one lib/schema.ts declares, which is the one the 1.7
-- generator emits. A differently named index is invisible to Postgres and
-- loud to drizzle-kit — it would plan a second, identical index on the next
-- push.
CREATE UNIQUE INDEX IF NOT EXISTS "account_issuer_accountId_uidx"
  ON "account" ("issuer", "account_id");

-- ---------------------------------------------------------------------------
-- The rest of the 1.7 diff
-- ---------------------------------------------------------------------------
--
-- These columns are already the right type and already hold no nulls; 1.7 only
-- tightened them. They are here rather than in a second file because they are
-- the same regeneration, and splitting them would mean two migrations that are
-- only ever run together.

-- Every row already carries the 'incomplete' default, so this cannot fail on
-- the three live subscriptions. Asserted anyway — SET NOT NULL on a column with
-- a null is a failure in the middle of a migration, and this says why.
SELECT CASE WHEN count(*) = 0 THEN 0 ELSE
  ('subscription.status is null on ' || count(*) || ' row(s)')::int
END FROM "subscription" WHERE "status" IS NULL;

ALTER TABLE "subscription"
  ALTER COLUMN "status" SET NOT NULL;

-- The oauth_* tables were created empty this morning by scripts/mcp-oauth.sql,
-- against the schema the old generator emitted. Nothing has been issued yet, so
-- these are free now and would be a backfill after the first client connects.
ALTER TABLE "oauth_refresh_token"
  ALTER COLUMN "expires_at" SET NOT NULL;

ALTER TABLE "oauth_refresh_token"
  ALTER COLUMN "created_at" SET NOT NULL;

ALTER TABLE "oauth_access_token"
  ALTER COLUMN "token" SET NOT NULL;

ALTER TABLE "oauth_access_token"
  ALTER COLUMN "expires_at" SET NOT NULL;

ALTER TABLE "oauth_access_token"
  ALTER COLUMN "created_at" SET NOT NULL;

ALTER TABLE "oauth_consent"
  ALTER COLUMN "created_at" SET NOT NULL;

ALTER TABLE "oauth_consent"
  ALTER COLUMN "updated_at" SET NOT NULL;

-- Same index, same columns, the name the 1.7 generator gives it. IF EXISTS
-- makes the rename a no-op on a second run.
ALTER INDEX IF EXISTS "oauthClientResource_clientId_resourceId_idx"
  RENAME TO "oauthClientResource_clientId_resourceId_uidx";

CREATE UNIQUE INDEX IF NOT EXISTS "oauthClientResource_clientId_resourceId_uidx"
  ON "oauth_client_resource" ("client_id", "resource_id");

-- The `source_connection` table. See plans/019.
--
-- Purely additive: one new table, no change to any existing one. `source_item`
-- gains a new value in `SOURCE_ITEM_SOURCES` in the same change, but that
-- column is plain text with no CHECK constraint (scripts/source-items.sql
-- explains why), so widening the enum is a change to lib/schema-app.ts alone
-- and there is nothing to migrate for it.
--
-- **There is one database.** Running this from a laptop is the production
-- migration, per AGENTS.md. CREATE TABLE IF NOT EXISTS and CREATE UNIQUE INDEX
-- IF NOT EXISTS make a second run a no-op.
--
-- NOTE: never put a statement separator inside a comment. The apply scripts
-- split this file on that character (see scripts/apply-source-connections.ts),
-- so one appearing in prose cuts a statement in half and Postgres answers with
-- a syntax error pointing at a position that looks nothing like the mistake.
-- Written down in every one of these files and still caught this one out on
-- first run, on the sentence directly above this note.

CREATE TABLE IF NOT EXISTS "source_connection" (
  "id" text PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  -- An id from SOURCES in lib/sources.ts. Not a foreign key: the catalogue is
  -- code, so a source is added in a pull request rather than a migration.
  "source" text NOT NULL,
  -- The routing secret in the webhook URL. The only thing identifying an
  -- inbound POST, which is why the index below is global rather than per user.
  "token" text NOT NULL,
  -- The provider's whsec_, encrypted with symmetricEncrypt keyed off
  -- BETTER_AUTH_SECRET. Null until the user pastes it back, because the
  -- provider mints it after the automation exists.
  "signing_secret" text,
  -- 'waiting' | 'arriving' | 'paused' | 'broken'. Plain text, no CHECK: the
  -- enum lives in lib/schema-app.ts and a constraint here would need a
  -- migration every time it widens.
  "state" text NOT NULL DEFAULT 'waiting',
  -- The arrival, not the connection. A source wired to the wrong workspace
  -- must not look identical to one that is working.
  "last_item_at" timestamp with time zone,
  "last_error_at" timestamp with time zone,
  "last_error" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- The lookup the webhook does on every request.
CREATE UNIQUE INDEX IF NOT EXISTS "source_connection_token_key"
  ON "source_connection" ("token");

-- One row per source per user.
CREATE UNIQUE INDEX IF NOT EXISTS "source_connection_user_source_key"
  ON "source_connection" ("user_id", "source");

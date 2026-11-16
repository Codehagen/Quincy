-- Channel connections: where Quincy may post as you.
--
-- Purely additive. One new table, two constraints, no change to anything that
-- already exists. See plans/005 for why this is not better-auth's account table.

CREATE TABLE IF NOT EXISTS "channel_connection" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "channel" text NOT NULL,

  "external_id" text NOT NULL,
  "handle" text,
  "display_name" text,
  "avatar_url" text,

  -- Ciphertext, not a token. symmetricEncrypt from better-auth/crypto, keyed
  -- off BETTER_AUTH_SECRET — the same primitive account.encryptOAuthTokens uses.
  "access_token" text NOT NULL,
  "refresh_token" text,
  "access_token_expires_at" timestamptz,
  "scope" text,

  -- active | needs_reauth | revoked. Not a CHECK constraint: the enum lives in
  -- CONNECTION_STATES in lib/schema-app.ts, and duplicating it here would mean
  -- two places to change and one of them silently authoritative.
  "state" text NOT NULL DEFAULT 'active',
  "reauth_notice_sent_at" timestamptz,
  "last_published_at" timestamptz,
  "last_error_at" timestamptz,
  "last_error" text,

  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- One row per platform account per user, so reconnecting updates rather than
-- growing a pile of dead tokens. The user is in the key deliberately — a key
-- without a tenant is how two accounts end up sharing a row.
CREATE UNIQUE INDEX IF NOT EXISTS "channel_connection_user_channel_external_key"
  ON "channel_connection" ("user_id", "channel", "external_id");

-- The read path: one user's connections, or one channel of them.
CREATE INDEX IF NOT EXISTS "channel_connection_user_channel_idx"
  ON "channel_connection" ("user_id", "channel");

-- Collapse any duplicate connections before narrowing the key.
--
-- The application has only ever been able to address one connection per
-- channel: every read path resolves by (user_id, channel) and the UI renders
-- one row. A second row was therefore invisible and unpublishable-through by
-- the UI, but still live in the database and still reachable by an arbitrary
-- LIMIT 1 — which is how Disconnect could delete one credential and leave
-- another working. Keep the most recently updated row per (user_id, channel);
-- it is the one the person last consented to.
DELETE FROM "channel_connection" a
  USING "channel_connection" b
  WHERE a."user_id" = b."user_id"
    AND a."channel" = b."channel"
    AND (a."updated_at", a."id") < (b."updated_at", b."id");

DROP INDEX IF EXISTS "channel_connection_user_channel_external_key";

CREATE UNIQUE INDEX IF NOT EXISTS "channel_connection_user_channel_key"
  ON "channel_connection" ("user_id", "channel");

-- Rhythms: the schedule table and its run log. See plans/016.
--
-- Additive. Two new tables and two new columns on `draft`, all with defaults,
-- so nothing that already exists changes shape and no backfill is needed.
--
-- NOTE: never put a statement separator inside a comment. The apply scripts
-- split this file on that character (see scripts/apply-rhythms.ts), so one
-- appearing in prose cuts a statement in half, and Postgres answers "syntax
-- error at end of input" pointing at a position that looks nothing like the
-- mistake. This very warning broke the migration on its first draft.

CREATE TABLE IF NOT EXISTS "rhythm_subscription" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,

  -- A catalogue id from RHYTHMS in lib/rhythms.ts. Not a foreign key and not a
  -- CHECK constraint: the catalogue is code, and a row for a rhythm that has
  -- been renamed should be a no-op the dispatcher reports, not a deploy that
  -- cannot land until a migration has run.
  "rhythm_id" text NOT NULL,

  -- A wall clock on the user's own calendar. The zone is user.timezone, read
  -- at dispatch — never stored here. See lib/timezone.ts for why.
  "hour" integer NOT NULL,
  "minute" integer NOT NULL,
  -- ISO weekday 1-7. NULL means daily.
  "weekday" integer,

  "enabled" boolean NOT NULL DEFAULT true,

  -- timestamptz, unlike most columns in this app: the dispatcher compares this
  -- against now() in SQL, and against a naive column that comparison silently
  -- depends on the database session's TimeZone setting.
  "next_run_at" timestamptz NOT NULL,
  "running_since" timestamptz,
  "last_run_at" timestamptz,

  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- Two subscriptions to one rhythm is not a state the product has.
CREATE UNIQUE INDEX IF NOT EXISTS "rhythm_subscription_user_rhythm_key"
  ON "rhythm_subscription" ("user_id", "rhythm_id");

-- The dispatcher's path, which crosses users. Without this it is a full scan
-- every fifteen minutes on the table that grows with every user.
CREATE INDEX IF NOT EXISTS "rhythm_subscription_due_idx"
  ON "rhythm_subscription" ("enabled", "next_run_at");

CREATE INDEX IF NOT EXISTS "rhythm_subscription_user_idx"
  ON "rhythm_subscription" ("user_id");

CREATE TABLE IF NOT EXISTS "rhythm_run" (
  "id" text PRIMARY KEY NOT NULL,
  "subscription_id" text NOT NULL
    REFERENCES "rhythm_subscription"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "rhythm_id" text NOT NULL,

  -- ok | failed | skipped | missed. The enum lives in RHYTHM_RUN_STATES in
  -- lib/schema-app.ts. Duplicating it as a CHECK here would mean two places to
  -- change and one of them silently authoritative.
  "state" text NOT NULL,
  "summary" text NOT NULL DEFAULT '',
  "manual" boolean NOT NULL DEFAULT false,

  "started_at" timestamptz NOT NULL,
  "finished_at" timestamptz,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "rhythm_run_subscription_idx"
  ON "rhythm_run" ("subscription_id", "started_at");

CREATE INDEX IF NOT EXISTS "rhythm_run_user_started_idx"
  ON "rhythm_run" ("user_id", "started_at");

-- Where a draft came from when it was adapted from somebody else's post.
-- Defaulted to '' so every existing row is already correct: those drafts were
-- not adapted from anything, which is exactly what '' means.
ALTER TABLE "draft"
  ADD COLUMN IF NOT EXISTS "adapted_from_url" text NOT NULL DEFAULT '';

ALTER TABLE "draft"
  ADD COLUMN IF NOT EXISTS "adapted_from_handle" text NOT NULL DEFAULT '';

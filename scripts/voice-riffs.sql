-- Voice notes: two columns on `riff` for the stuck-state story. See plans/018.
--
-- Additive and idempotent. No new tables, no change to any existing column,
-- no backfill needed: both additions have a default or are nullable, so every
-- row already in `riff` is already correct under the new shape.
--
-- `state` gains a third value, 'failed', but the column is plain text with no
-- CHECK constraint (scripts/riffs.sql explains why), so widening the enum is a
-- change to lib/schema-app.ts alone and there is nothing to migrate for it.
--
-- NOTE: never put a statement separator inside a comment. The apply scripts
-- split this file on that character (see scripts/apply-voice-riffs.ts), so one
-- appearing in prose cuts a statement in half and Postgres answers with a
-- syntax error pointing at a position that looks nothing like the mistake.

-- Why it failed, in the user's words rather than the exception's. On the row
-- because the person deciding whether to re-record is looking at the card,
-- not at a log. Empty for every state but 'failed'.
ALTER TABLE "riff"
  ADD COLUMN IF NOT EXISTS "failure" text NOT NULL DEFAULT '';

-- When the work started, as distinct from when the row appeared. Nullable
-- rather than defaulted: a riff the paste box made never had a background
-- phase, and NULL says that where a timestamp would imply one.
ALTER TABLE "riff"
  ADD COLUMN IF NOT EXISTS "started_at" timestamp;

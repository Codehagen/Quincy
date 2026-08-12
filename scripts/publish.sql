-- Publish outcomes on scheduled_post. See plans/010.
--
-- Purely additive: four nullable columns and one index. Nothing that exists
-- changes shape, and every row already in the table stays valid — a queued post
-- that has never been attempted has null in all four, which is what they mean.
--
-- The `state` column is not touched. It is `text` with the enum living in
-- SCHEDULED_STATES in lib/schema-app.ts rather than in a CHECK constraint, for
-- the reason channels.sql gives about the same decision: two places to change
-- and one of them silently authoritative. So `sending` and `failed` need no
-- migration to become writable.

ALTER TABLE "scheduled_post"
  -- Set at the moment a sweep claims the row, before the platform call. The
  -- age of a row sitting in `sending` is the only evidence that it is stuck
  -- rather than in flight.
  ADD COLUMN IF NOT EXISTS "attempted_at" timestamptz;

ALTER TABLE "scheduled_post"
  -- The platform's own words. Read by a human deciding whether to try again.
  ADD COLUMN IF NOT EXISTS "last_error" text;

ALTER TABLE "scheduled_post"
  -- The live post. Nullable forever: a post published before this column
  -- existed has no URL to backfill, and inventing one would be worse.
  ADD COLUMN IF NOT EXISTS "post_url" text;

ALTER TABLE "scheduled_post"
  -- A tweet id, or a LinkedIn URN.
  ADD COLUMN IF NOT EXISTS "external_id" text;

-- The sweep crosses users rather than scoping to one, so the existing
-- (user_id, scheduled_for) index does not serve it. Without this, finding the
-- handful of due posts is a full scan of the fastest-growing table in the
-- product, every few minutes, forever.
CREATE INDEX IF NOT EXISTS "scheduled_post_due_idx"
  ON "scheduled_post" ("state", "scheduled_for");

-- Post metrics: what a published post actually did, sampled daily.
-- See plans/027, phase 2c.
--
-- Purely additive. One new table, three indexes, and one nullable column on
-- channel_connection. Nothing existing changes shape and no data moves, so a
-- deploy that has not shipped the code yet is unaffected by this running first.

CREATE TABLE IF NOT EXISTS "post_metric" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,

  -- Soft on purpose, the way riff.source_item_id is soft: the refresh reads
  -- the timeline, not the corpus, so a post published this morning has numbers
  -- before it has a source_item row. A real foreign key would turn that honest
  -- answer into an insert failure at 06:00 with nobody watching. Empty until
  -- the import catches up; external_id below is what a backfill joins on.
  "source_item_id" text NOT NULL DEFAULT '',

  -- x | linkedin. Not a CHECK constraint: the enum lives in
  -- CONNECTABLE_CHANNELS in lib/schema-app.ts, and duplicating it here would
  -- mean two places to change and one of them silently authoritative.
  "channel" text NOT NULL,
  "external_id" text NOT NULL,

  -- The day the reading belongs to, normalised to UTC midnight by
  -- lib/post-metrics.ts. Normalised rather than stamped with the wall clock so
  -- the unique index below can be an ON CONFLICT target — an index over
  -- captured_at::date cannot be, and on the HTTP driver, with no transaction to
  -- fall back on, that would mean a read-then-write and a duplicate every time
  -- the cron fired twice. The instant the row was written is created_at.
  "captured_at" timestamptz NOT NULL,

  -- All six not null default 0. A metric the platform did not return is not a
  -- different kind of nothing from a metric that is zero, and a nullable
  -- integer reaching a median is a NaN on /numbers.
  "impressions" integer NOT NULL DEFAULT 0,
  "likes" integer NOT NULL DEFAULT 0,
  "replies" integer NOT NULL DEFAULT 0,
  "reposts" integer NOT NULL DEFAULT 0,
  "bookmarks" integer NOT NULL DEFAULT 0,
  "quotes" integer NOT NULL DEFAULT 0,

  "created_at" timestamp NOT NULL DEFAULT now()
);

-- One reading per post per day, keyed on the platform's id rather than on
-- source_item_id. That column defaults to the empty string, so a key holding it
-- would collapse every not-yet-imported post of a single day into one row and
-- lose all but the last. The user is in the key deliberately — a key without a
-- tenant is how two accounts end up sharing a row.
CREATE UNIQUE INDEX IF NOT EXISTS "post_metric_user_post_day_key"
  ON "post_metric" ("user_id", "channel", "external_id", "captured_at");

-- The read path: one user's window, in time order.
CREATE INDEX IF NOT EXISTS "post_metric_user_captured_idx"
  ON "post_metric" ("user_id", "captured_at");

-- The join /numbers makes once the corpus and the series meet: the newest
-- reading for a given post.
CREATE INDEX IF NOT EXISTS "post_metric_item_captured_idx"
  ON "post_metric" ("source_item_id", "captured_at");

-- The cooldown column. A second column rather than a reuse of last_import_at,
-- because the two jobs bound different spends on different clocks — an import
-- is a person pressing a button every ten minutes, this is a cron reading the
-- same hundred posts every twenty hours — and sharing one column would let
-- either one silence the other. Claimed by a conditional UPDATE, which is what
-- makes "one refresh per window" hold with no transactions on the HTTP driver.
ALTER TABLE "channel_connection"
  ADD COLUMN IF NOT EXISTS "last_metrics_at" timestamptz;

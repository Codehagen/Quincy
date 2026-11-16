-- Source items: material Quincy has read. See plans/011.
--
-- Purely additive. One new table, two indexes, no change to anything that
-- already exists.

CREATE TABLE IF NOT EXISTS "source_item" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,

  -- x | x-archive | linkedin | linkedin-export. Not a CHECK constraint: the
  -- enum lives in SOURCE_ITEM_SOURCES in lib/schema-app.ts, and duplicating it
  -- here would mean two places to change and one of them silently
  -- authoritative.
  "source" text NOT NULL,
  "external_id" text NOT NULL,
  "url" text NOT NULL DEFAULT '',
  "posted_at" timestamptz,
  "body" text NOT NULL DEFAULT '',
  "meta" jsonb NOT NULL DEFAULT '{}',

  "created_at" timestamp NOT NULL DEFAULT now()
);

-- Re-import is a no-op. The user is in the key deliberately — a key without a
-- tenant is how two accounts end up sharing a row.
CREATE UNIQUE INDEX IF NOT EXISTS "source_item_user_source_external_key"
  ON "source_item" ("user_id", "source", "external_id");

-- The read path: one user's corpus from one source, newest first.
CREATE INDEX IF NOT EXISTS "source_item_user_source_posted_idx"
  ON "source_item" ("user_id", "source", "posted_at");

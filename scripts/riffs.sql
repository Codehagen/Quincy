-- Riffs: the step between raw material and a draft. See plans/017.
--
-- Additive. Two new tables, no change to anything that already exists.
--
-- NOTE: never put a statement separator inside a comment. The apply scripts
-- split this file on that character (see scripts/apply-riffs.ts), so one
-- appearing in prose cuts a statement in half and Postgres answers with a
-- syntax error pointing at a position that looks nothing like the mistake.
-- This bit us once on scripts/rhythms.sql.

CREATE TABLE IF NOT EXISTS "riff" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,

  -- The raw material, close to verbatim. What you actually said, or for an
  -- adapted riff what somebody else actually wrote.
  "scrap" text NOT NULL,

  "source_id" text NOT NULL DEFAULT '',
  "source_label" text NOT NULL DEFAULT '',

  -- Whose post this came out of, when it came out of somebody else's. The
  -- same pair `draft` carries. Empty for material of your own.
  "adapted_from_url" text NOT NULL DEFAULT '',
  "adapted_from_handle" text NOT NULL DEFAULT '',

  -- working | ready. The enum lives in RIFF_STATES in lib/schema-app.ts.
  -- Duplicating it as a CHECK here would mean two places to change and one of
  -- them silently authoritative.
  "state" text NOT NULL DEFAULT 'working',

  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- The read path: one user's working queue, newest first.
CREATE INDEX IF NOT EXISTS "riff_user_created_idx"
  ON "riff" ("user_id", "created_at");

-- What makes the Bookmarks rhythm's idempotency check cheap. It re-reads the
-- same bookmarks every run, so "have I already riffed on this post" is asked
-- once per candidate per run.
CREATE INDEX IF NOT EXISTS "riff_user_adapted_from_idx"
  ON "riff" ("user_id", "adapted_from_url");

CREATE TABLE IF NOT EXISTS "riff_angle" (
  "id" text PRIMARY KEY NOT NULL,
  "riff_id" text NOT NULL REFERENCES "riff"("id") ON DELETE CASCADE,

  -- The opening line, which is the whole bet on any platform.
  "hook" text NOT NULL,
  -- Shape, not platform. Short post | Thread | Carousel | Essay.
  "shape" text NOT NULL,
  -- One line on why this angle is worth writing. Quincy's reasoning, shown.
  "why" text NOT NULL DEFAULT '',
  -- Render order, so the model's ranking survives the round trip.
  "position" integer NOT NULL DEFAULT 0,

  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "riff_angle_riff_idx"
  ON "riff_angle" ("riff_id", "position");

-- Video: the edit document and the media it points at.
--
-- Purely additive. Two new tables, no change to anything that already exists.
-- See docs/video-ingest.md for the pipeline these back.
--
-- The split between them is the point: a **project** is an edit, an **asset**
-- is a file. Assets are content-addressed and shared, because the same
-- recording feeds a TikTok cut and a Shorts cut and must not be probed,
-- transcoded or transcribed twice.

CREATE TABLE IF NOT EXISTS "video_project" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "title" text NOT NULL DEFAULT 'Untitled',

  -- The whole timeline, authoritative. Deliberately not normalised into clip
  -- and track tables: every read wants the whole document, every write is a
  -- batch, and a relational shape would mean a join per lane to rebuild
  -- something the client holds in memory anyway.
  "document" jsonb NOT NULL,

  -- Optimistic concurrency, not a version history. A write states the revision
  -- it read and loses if the document moved, which is what stops a slow agent
  -- run from overwriting a drag made while it was thinking.
  "revision" integer NOT NULL DEFAULT 0,

  -- Held for the length of an agent run. See DocumentLock in lib/editor/types.ts.
  "lock" jsonb NOT NULL,

  "thumbnail_key" text,

  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- The project list: one user's edits, most recently touched first.
CREATE INDEX IF NOT EXISTS "video_project_user_updated_idx"
  ON "video_project" ("user_id", "updated_at");

CREATE TABLE IF NOT EXISTS "video_asset" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,

  -- uploaded | probed | processing | ready | failed. Not a CHECK constraint:
  -- the enum lives in VIDEO_ASSET_STATES in lib/schema-app.ts, and duplicating
  -- it here would mean two places to change and one of them silently
  -- authoritative. Same call as channel_connection.state.
  "state" text NOT NULL DEFAULT 'uploaded',

  "filename" text NOT NULL,
  "mime_type" text NOT NULL,

  -- `xxh3-128:<bytes>:<hash>`. The identity of the file, and the reason a
  -- re-upload is free.
  "content_hash" text NOT NULL,

  -- bigint because a 4K screen recording clears the int4 ceiling. int4 tops out
  -- at 2.1GB and a long 4K take passes that without being unusual.
  "size_bytes" bigint NOT NULL,

  "storage_key" text NOT NULL,
  "proxy_key" text,
  -- Peaks and keyframe offsets together, drawn by the timeline every render.
  "seek_index_key" text,
  "thumbnail_key" text,

  -- Probe output. Columns rather than a blob because the editor branches on all
  -- of them: rotation decides the display matrix, fps decides frame snapping,
  -- has_audio decides whether a transcript is even attempted.
  "duration_us" bigint,
  "width" integer,
  "height" integer,
  "fps" integer,
  "rotation" integer NOT NULL DEFAULT 0,
  "has_audio" boolean NOT NULL DEFAULT false,

  -- The provider's response, verbatim. Word timestamps are read constantly and
  -- the shape is Deepgram's, so parsing it into columns would re-derive
  -- something the caption builder already reads whole.
  "transcript" jsonb,
  "transcript_provider" text,
  "transcribed_at" timestamptz,

  -- Gemini Files handle. Expires in 48 hours, so it is stored with its expiry
  -- and re-uploaded on demand rather than assumed live.
  "gemini_file_uri" text,
  "gemini_expires_at" timestamptz,

  -- Why it failed, or the warnings from a run that finished anyway. The state
  -- column says which of the two this is.
  "error" text,

  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- Re-upload is a no-op. The user is in the key so two accounts uploading the
-- same file each get a row, matching brain_page and source_item — a key without
-- a tenant in it is how two accounts end up sharing one row.
CREATE UNIQUE INDEX IF NOT EXISTS "video_asset_user_hash_key"
  ON "video_asset" ("user_id", "content_hash");

-- The library: one user's assets, newest first.
CREATE INDEX IF NOT EXISTS "video_asset_user_created_idx"
  ON "video_asset" ("user_id", "created_at");

-- The ingest worker's queue: everything not yet finished, oldest first. Also
-- the path that finds rows abandoned in `processing` by a function that died.
CREATE INDEX IF NOT EXISTS "video_asset_state_idx"
  ON "video_asset" ("state", "created_at");

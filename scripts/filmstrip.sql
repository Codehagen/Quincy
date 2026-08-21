-- Filmstrip: the sprite sheet the timeline's spine tiles across its clips.
-- Purely additive.
--
-- The key and the geometry travel together on purpose. A sheet is unreadable
-- without knowing how many tiles it holds and how far apart in source time they
-- were sampled, and those numbers come from the duration at ingest — so a
-- constant in the client would be right until the first video that planned
-- differently, and then silently wrong for that one asset forever.
ALTER TABLE "video_asset"
  ADD COLUMN IF NOT EXISTS "filmstrip_key" text;

ALTER TABLE "video_asset"
  ADD COLUMN IF NOT EXISTS "filmstrip_tiles" integer;

ALTER TABLE "video_asset"
  ADD COLUMN IF NOT EXISTS "filmstrip_interval_us" bigint;

ALTER TABLE "video_asset"
  ADD COLUMN IF NOT EXISTS "filmstrip_tile_width" integer;

ALTER TABLE "video_asset"
  ADD COLUMN IF NOT EXISTS "filmstrip_tile_height" integer;

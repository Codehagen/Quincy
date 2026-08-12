-- Import cooldown: one timestamp on channel_connection. See plans/012.
-- Purely additive.
ALTER TABLE "channel_connection"
  ADD COLUMN IF NOT EXISTS "last_import_at" timestamptz;

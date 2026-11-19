-- Facebook app-scoped user id on an Instagram connection.
--
-- Additive. One nullable column, no rewrite of existing rows. Meta's
-- data-deletion callback matches this column. `external_id` stays the
-- Instagram professional account id, which is a different number.
--
-- Apply this before deploying the code that selects `channel_connection`.
-- Drizzle names every column in a select, so a deploy that arrives first
-- fails every channel read with a missing-column error.
--
-- Not run from this change. Do not point it at a database you cannot
-- afford to change, and do not run it as a stand-in for reviewing the SQL.

ALTER TABLE "channel_connection"
  ADD COLUMN IF NOT EXISTS "meta_user_id" text;

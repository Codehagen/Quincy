-- The record behind a rhythm's one-line receipt. See plans/027.
--
-- One nullable column on an existing table. Nothing changes shape, no row
-- moves, and nothing backfills: every run written before this produced no
-- record, and NULL is exactly what that means. So a deploy that has not
-- shipped the code yet is unaffected by this running first, and a deploy that
-- has shipped it writes into the column the moment it lands.
--
-- jsonb rather than a column per fact because three handlers answer in three
-- shapes — Ship Log's merge count and ids, Weekly Review's message and two
-- facts, Week Plan's proposed/critiqued/drafted/placed. See the column comment
-- in lib/schema-app.ts.
--
-- NOTE: never put a statement separator inside a comment. The apply scripts
-- split this file on that character (see scripts/apply-rhythm-run-result.ts),
-- so one appearing in prose cuts a statement in half.

ALTER TABLE "rhythm_run"
  ADD COLUMN IF NOT EXISTS "result" jsonb;

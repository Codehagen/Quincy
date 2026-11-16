-- First run: one timestamp on user. See plans/022.
-- Purely additive.
ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS "onboarded_at" timestamptz;

-- Everyone who already existed when this shipped has been using Quincy for
-- days or weeks. Null means "has not been asked" and the layout redirects on
-- null, so without this backfill every existing account is sent through an
-- interview on its next navigation.
--
-- The cutoff is a literal, not `WHERE onboarded_at IS NULL`.
--
-- An IS NULL guard reads as the idempotent one and is the dangerous one: run
-- this file a second time next month and it marks every account that has
-- signed up since as onboarded, silently skipping first run for exactly the
-- people it was built for. A date cannot do that.
--
-- Every account on the live database at the time of writing was created on
-- 2026-08-01 or 2026-08-02. Anyone who arrives from today onward goes through
-- the interview.
--
-- Keep semicolons out of these comments. apply-*.ts splits the file on the
-- statement terminator without parsing it, so one inside a comment cuts a
-- statement in half mid-sentence and Postgres rejects the fragment.
UPDATE "user"
  SET "onboarded_at" = now()
  WHERE "onboarded_at" IS NULL
    AND "created_at" < timestamptz '2026-08-11 00:00:00+00';

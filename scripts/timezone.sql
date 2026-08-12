-- Timezone: a zone per user, and instants that say so.
--
-- Two independent changes that ship together because they are one feature.
-- Both are additive and neither rewrites a value.

-- Where this person's clock is. IANA name, nullable: Google sign-ups arrive
-- without one and every account predating this has none. lib/timezone.ts turns
-- absent into UTC on read, so nothing needs backfilling for correctness.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "timezone" text;

-- The two columns that hold an instant rather than a wall clock.
--
-- USING ... AT TIME ZONE 'UTC' is the load-bearing half. Without it Postgres
-- reinterprets each naive value in the *session's* TimeZone, which would shift
-- every queued post by whatever offset the connection happened to have. Drizzle
-- has always written these as UTC (it sends toISOString()), so UTC is what the
-- stored values already mean and this clause says so explicitly rather than
-- letting a session setting decide.
--
-- On Neon the session TimeZone is UTC, which would make the clause redundant
-- today and wrong the moment anything runs this from a machine that sets it.
ALTER TABLE "scheduled_post"
  ALTER COLUMN "scheduled_for" TYPE timestamptz
  USING "scheduled_for" AT TIME ZONE 'UTC';

ALTER TABLE "scheduled_post"
  ALTER COLUMN "published_at" TYPE timestamptz
  USING "published_at" AT TIME ZONE 'UTC';

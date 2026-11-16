-- The waitlist table. See plans/023.
--
-- Purely additive. Nothing existing is touched, so this is safe to run against
-- the one branch that is also production.
--
-- Keep semicolons out of these comments. apply-*.ts splits the file on the
-- statement terminator without parsing it, so one inside a comment cuts a
-- statement in half mid-sentence and Postgres rejects the fragment.
CREATE TABLE IF NOT EXISTS "waitlist" (
  "id" text PRIMARY KEY,
  "email" text NOT NULL UNIQUE,
  "source" text NOT NULL DEFAULT 'landing',
  "ip_hash" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "invited_at" timestamptz,
  "invite_code" text,
  "invite_expires_at" timestamptz,
  "redeemed_at" timestamptz,
  "note" text NOT NULL DEFAULT ''
);

-- Oldest first. The page promises invites go out in the order people asked,
-- and this is the index that makes keeping that promise cheap.
CREATE INDEX IF NOT EXISTS "waitlist_created_idx"
  ON "waitlist" ("created_at");

-- The cooldown read: has this caller been here in the last hour.
CREATE INDEX IF NOT EXISTS "waitlist_ip_created_idx"
  ON "waitlist" ("ip_hash", "created_at");

-- Partial, because every row that has not been invited carries NULL here.
-- Postgres allows any number of NULLs in a plain UNIQUE index, so a plain one
-- would also work — it would just be a larger index describing a constraint
-- that only applies to a minority of rows.
CREATE UNIQUE INDEX IF NOT EXISTS "waitlist_invite_code_idx"
  ON "waitlist" ("invite_code")
  WHERE "invite_code" IS NOT NULL;

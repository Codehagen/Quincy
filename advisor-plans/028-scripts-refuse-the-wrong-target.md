# Plan 028: Every script that mutates an account refuses a real address, and the timezone applier survives a re-run

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md` — unless a reviewer dispatched you and told
> you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 223a12d..HEAD -- scripts/seed-drafts.ts scripts/seed-stories.ts scripts/seed-brain.ts scripts/seed-conversations.ts scripts/corpus-x-live.ts scripts/invite.ts scripts/apply-timezone.ts scripts/timezone.sql lib/test-address.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `223a12d`, 2026-08-12

## Why this matters

This repo has **one database**. The single Neon branch is production;
`.env.local` and Vercel point at the same one. `AGENTS.md` ("There is one
database") states the house rule: mutating scripts are guarded **on the
target address**, not on the environment, "because the environment cannot
tell you anything, only the target can." All 20 `scripts/verify-*.ts` files
and `scripts/dev-account.ts` follow it.

Five scripts do not. Each resolves its target with
`where(eq(user.email, process.argv[2]))` and mutates whatever account that
names. `scripts/seed-drafts.ts` is the worst: it deletes **every standing
slot the account owns** and writes the running machine's timezone onto the
row. One mistyped argument destroys a real user's publishing schedule with no
undo.

Two more script defects ride along because they are the same class (a
hand-run script that is safe on the happy path and destructive off it):
`scripts/invite.ts` silently re-opens a spent invite when an operator names an
address that already signed up, and `scripts/apply-timezone.ts` claims to be
idempotent while a re-run from a non-UTC session would silently shift every
stored `scheduled_for` and `published_at`.

## Current state

- `lib/test-address.ts` exports the guard predicate:

```ts
// lib/test-address.ts:24-32
const UNREACHABLE_SUFFIX = "@quincy.test"

export function isUnreachableTestAddress(email: string | null | undefined) {
  if (!email) {
    return false
  }
  return email.trim().toLowerCase().endsWith(UNREACHABLE_SUFFIX)
}
```

- The five unguarded scripts resolve targets like this (none import
  `isUnreachableTestAddress`; verified by grep at `223a12d`):

```ts
// scripts/seed-drafts.ts:217-224 (same shape in seed-stories.ts:211,
// seed-brain.ts:133, seed-conversations.ts:16, corpus-x-live.ts:36-49)
const email = process.argv[2]
...
  .where(eq(user.email, email))
```

- `scripts/seed-drafts.ts` then mutates broadly:

```ts
// scripts/seed-drafts.ts:243-251
if (!owner.timezone) {
  await db.update(user).set({ timezone: zone }).where(eq(user.id, owner.id))
  ...
}
// Re-runnable. Drafts cascade to versions, versions cascade to scheduled
// posts, so clearing the pieces clears the chain.
await db.delete(draft).where(inArray(draft.id, DRAFT_IDS))
await db.delete(slot).where(eq(slot.userId, owner.id))
```

  Note the second delete: **all** slots for the user, not only seeded ones.

- `scripts/invite.ts`: `targets()` for explicitly named addresses warns on
  `row.invitedAt` but never checks `row.redeemedAt` (lines 56-78), and the
  update at 133-143 unconditionally sets `redeemedAt: null`:

```ts
// scripts/invite.ts:135-143
.set({
  invitedAt: new Date(),
  inviteCode: code,
  inviteExpiresAt: new Date(Date.now() + INVITE_TTL_MS),
  // A re-issue has to clear this or the new code is dead on arrival:
  // every read in lib/waitlist.ts requires `redeemed_at IS NULL`.
  redeemedAt: null,
})
```

  So `npx tsx scripts/invite.ts alice@real.com --send` against someone who
  already signed up mails a fresh invite and makes the address able to create
  a second account (`lib/waitlist.ts` `spendInviteFor` only requires
  `redeemed_at IS NULL`).

- `scripts/apply-timezone.ts:8-10` claims: "Idempotent. … re-typing a column
  that is already `timestamptz` is a no-op in Postgres rather than an error".
  That is false when a `USING` clause is present — Postgres always rewrites.
  `scripts/timezone.sql` itself warns about it (lines 14-21: "On Neon the
  session TimeZone is UTC, which would make the clause redundant today and
  wrong the moment anything runs this from a machine that sets it") and then
  runs:

```sql
-- scripts/timezone.sql:22-29
ALTER TABLE "scheduled_post"
  ALTER COLUMN "scheduled_for" TYPE timestamptz
  USING "scheduled_for" AT TIME ZONE 'UTC';

ALTER TABLE "scheduled_post"
  ALTER COLUMN "published_at" TYPE timestamptz
  USING "published_at" AT TIME ZONE 'UTC';
```

  On a second run against an already-`timestamptz` column from a session
  whose `TimeZone` is not UTC, `timestamptz AT TIME ZONE 'UTC'` produces a
  naive timestamp that is then re-interpreted in the **session** zone —
  silently shifting every queued and published post. The script's own
  verification (lines 63-71) only checks `data_type`, which is unchanged
  either way, so it cannot detect the shift.

- Convention exemplar for the guard message: `scripts/dev-account.ts` refuses
  non-`@quincy.test` addresses and explains why in one sentence.

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Typecheck | `pnpm typecheck` | exit 0              |
| Lint      | `pnpm lint`      | exit 0 (after plan 027; if 027 has not run, expect the same 2 pre-existing errors and nothing new from your files) |
| Tests     | `pnpm test`      | all pass            |

Do **not** run any script against the database as part of this plan. The
guards are verified by reading and by typecheck, not by executing mutations
against production.

## Scope

**In scope** (the only files you should modify):
- `scripts/seed-drafts.ts`
- `scripts/seed-stories.ts`
- `scripts/seed-brain.ts`
- `scripts/seed-conversations.ts`
- `scripts/corpus-x-live.ts`
- `scripts/invite.ts`
- `scripts/apply-timezone.ts`
- `scripts/timezone.sql`

**Out of scope** (do NOT touch):
- `lib/test-address.ts` — the predicate is correct as is.
- `scripts/dev-account.ts` and every `scripts/verify-*.ts` — already guarded.
- `lib/waitlist.ts` — `spendInviteFor` and `redeemInvite` are correct; the
  defect is in the operator script, not the library.
- The `redeemedAt: null` line itself for the *legitimate* re-issue case
  (unredeemed, expired code). Do not remove it; gate who reaches it.

## Git workflow

- Branch: `advisor/028-scripts-refuse-the-wrong-target`
- Commit style: single evocative sentence (see `git log --oneline -5`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Guard the four seed scripts

In each of `seed-drafts.ts`, `seed-stories.ts`, `seed-brain.ts`,
`seed-conversations.ts`: import the predicate and refuse before the first
database read.

```ts
import { isUnreachableTestAddress } from "../lib/test-address"

// At the top of main(), immediately after reading process.argv[2]:
if (!isUnreachableTestAddress(email)) {
  console.error(
    `Refusing to touch ${email ?? "(no address given)"} — this script mutates ` +
      `the production database and only runs against @quincy.test accounts. ` +
      `See AGENTS.md, "There is one database".`
  )
  process.exit(1)
}
```

Match each script's existing import style (they import from `../lib/...`).

**Verify**: `grep -l "isUnreachableTestAddress" scripts/seed-drafts.ts scripts/seed-stories.ts scripts/seed-brain.ts scripts/seed-conversations.ts` → all four paths printed.
**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Guard `corpus-x-live.ts` with an explicit override instead

This script exists to run against a **real** X connection, so a hard
`@quincy.test` guard would break its purpose. Give it the equivalent target
guard: refuse a non-test address unless the operator passed `--live`, and
echo the resolved account back before proceeding.

- Accept a `--live` flag (the script already parses `process.argv` for a
  command at line 73; follow that pattern).
- If the resolved user's email is not an unreachable test address and
  `--live` was not passed: print the resolved email and id, state that
  `--live` is required for a real account, exit 1.
- If `--live` was passed: print `Running LIVE against <email> (<id>)` before
  the first mutation.

**Verify**: `grep -n "live" scripts/corpus-x-live.ts | head` → shows the flag
parse and both branches. `pnpm typecheck` → exit 0.

### Step 3: Stop `invite.ts` from re-opening a spent invite

In `targets()`, in the explicit-addresses loop (after the `row.invitedAt`
warning at lines 67-74), add:

```ts
if (row.redeemedAt) {
  console.log(
    `  skip  ${row.email} — already signed up ${row.redeemedAt.toISOString().slice(0, 10)}. ` +
      `Re-inviting would re-open a spent invite; pass --force if that is truly intended.`
  )
  continue
}
```

Support `--force` the same way the script parses its other flags (look at how
`--send` is detected and mirror it). With `--force`, print a `note` line
instead of skipping. The `nextInLine` path already excludes redeemed rows and
needs no change.

**Verify**: `pnpm typecheck` → exit 0. `grep -n "redeemedAt" scripts/invite.ts`
→ shows both the existing `redeemedAt: null` write and the new check above it
in `targets()`.

### Step 4: Make the timezone applier immune to the session zone

Two changes:

1. In `scripts/apply-timezone.ts`, before executing the statements, run
   `await db.execute(sql\`SET TimeZone = 'UTC'\`)` so the session setting is
   pinned rather than inherited. Add one comment line saying why (the
   `USING` clause re-interprets in the session zone on a re-run).
2. Correct the header comment (lines 8-10): replace the claim that re-typing
   is "a no-op in Postgres" with the truth — a `USING` clause always
   rewrites, the script pins the session to UTC so the rewrite is the
   identity, and `scripts/timezone.sql`'s own warning comment is the
   authority.

Do not restructure the SQL file's statements. Optionally add a guard comment
in `timezone.sql` noting the applier pins UTC.

**Verify**: `grep -n "SET TimeZone" scripts/apply-timezone.ts` → 1 match.
`grep -ni "no-op" scripts/apply-timezone.ts` → no match.
`pnpm typecheck` → exit 0.

## Test plan

No new vitest files — these are operator scripts with no test harness, and
executing them is a production mutation. The verification is:

- `pnpm typecheck` and `pnpm lint` pass.
- The greps in each step's Verify line.
- `pnpm test` → the existing suite still passes (nothing in `lib/` changed).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0; `pnpm test` exits 0
- [ ] `grep -L "isUnreachableTestAddress" scripts/seed-drafts.ts scripts/seed-stories.ts scripts/seed-brain.ts scripts/seed-conversations.ts` → prints nothing (no file lacks the import)
- [ ] `grep -c "redeemedAt" scripts/invite.ts` ≥ 3 (the write, the new check, the skip message)
- [ ] `grep -c "SET TimeZone" scripts/apply-timezone.ts` → 1
- [ ] No database was contacted: you ran no `tsx` script during this plan
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `advisor-plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any of the five scripts already contains a target guard — the codebase
  drifted and the finding may be stale.
- `corpus-x-live.ts`'s argument parsing does not match the shape described
  (a positional command at argv[2]) — report the actual shape rather than
  guessing where the flag goes.
- You are tempted to run any of these scripts to "verify" them. Do not. They
  mutate production.
- The fix appears to require changing `lib/waitlist.ts` or `lib/test-address.ts`.

## Maintenance notes

- Any **new** script that takes an email argument and writes must start from
  this guard. Reviewers: the smell is `eq(user.email, process.argv[2])`
  without `isUnreachableTestAddress` in the same file.
- The `--force` path in `invite.ts` deliberately keeps the re-open behaviour
  reachable — the plan gates it, it does not delete it. If a real
  "second seat" policy ever exists, that flag is where it goes.
- `apply-timezone.ts` is already applied in production. The fix matters for
  the re-run case only; nothing needs re-running now.

# Plan 025: Cover the receipt that lied, against real rows

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `advisor-plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat efd2e2a..HEAD -- "app/(app)/riffs/actions.ts" lib/riffs.ts lib/drafting.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW to the product, **MED to the database** — this script writes and
  deletes real rows in the one production database. Read "The one database"
  below before running anything.
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `efd2e2a`, 2026-08-09

## Why this matters

On 2026-08-08 an angle was drafted, the model failed twice, every channel body
fell back to the hook — and the receipt said `written: true`. The field whose
only job was to distinguish "Quincy wrote this" from "here is your hook back"
reported the wrong one, and /drafts showed a 89-character hook as a finished
Substack post.

Commit `efd2e2a` fixed that by deriving the answer from the bodies in two
places: `written`/`fellBack` in `draftAngle`'s receipt, and `Angle.fellBack` in
`getRiffsForUser`, computed in SQL with `bool_and`. **Neither has a single
test.** `lib/drafting.test.ts` covers only the pure helpers (`targetsFor`,
`describeConstraints`); `lib/riffs.test.ts` covers only `channelGaps` and
`shapesForChannel`.

So the exact fact that lied is now computed in two untested places, one of them
a hand-written SQL aggregate. A regression here is silent by construction — it
does not throw, it just tells you a hook is a post.

This plan adds a `scripts/verify-*.ts` covering both, against real rows, on a
test account.

## The one database

`AGENTS.md` says this and it is the fact most likely to be missed:

> `quincy` on Neon (`winter-grass-66812609`) has a **single branch**, `main`.
> `.env.local` and Vercel's production `DATABASE_URL` point at the same one.
> There is no staging and no dev copy.

That is why every `scripts/verify-*.ts` is guarded on the `@quincy.test` address
rather than on `NODE_ENV` — the environment cannot tell you anything, only the
target can. **Never relax that guard.** Your script must refuse to run against
any other address, and every write and delete it makes must additionally be
scoped to the rows it created.

## Current state

**What is untested, part 1** — `app/(app)/riffs/actions.ts`, inside
`draftAngle`:

```ts
  const bodies = new Map(versions.map((v) => [v.channel, v.body]))
  const overLimit: string[] = []
  /* …doc comment… */
  const fellBack: string[] = []

  const channelBodies = targets.map((target) => {
    const generated = bodies.get(target.id)

    const body = generated ?? angle.hook
    if (generated === undefined) fellBack.push(target.id)

    const { over } = measurePost(body, target.id)
    if (over > 0) overLimit.push(target.id)
    return { target, body }
  })
```

and the receipt it returns:

```ts
  return {
    ok: true,
    draftId: id,
    channels: targets.map((t) => t.id),
    written: fellBack.length === 0,
    fellBack,
    overLimit,
    existing: false,
  }
```

`generateDraft` is injectable via the `DraftGenerator` type in
`lib/drafting.ts` — but `draftAngle` imports the concrete `generateDraft`
directly, so **there is no seam to inject through today**. Your script exercises
the derivation by writing rows, not by faking the model. See Step 2.

**What is untested, part 2** — `lib/riffs.ts`, inside `getRiffsForUser`:

```ts
  const draftedRows = await db
    .select({
      riffHook: draft.riffHook,
      fellBack: sql<boolean>`coalesce(bool_and(${draftVersion.body} = ${draft.riffHook}), false)`,
    })
    .from(draft)
    .leftJoin(draftVersion, eq(draftVersion.draftId, draft.id))
    .where(eq(draft.userId, user.id))
    .groupBy(draft.riffHook)

  const draftedHooks = new Map(draftedRows.map((d) => [d.riffHook, d.fellBack]))
```

Four behaviours are load-bearing and none is covered:

1. every body equals the hook → `fellBack: true`
2. **one** body written and one fallen back → `fellBack: false` (a partial
   failure is not "Quincy could not write it")
3. a draft with **no** versions at all → still `drafted`, `fellBack: false`
   (this is what the `leftJoin` + `coalesce` are for; an `innerJoin` would drop
   the angle out of the drafted set entirely)
4. an angle with no draft → neither `status` nor `fellBack`

**Conventions to match.** Read `scripts/verify-publish-run.ts` in full first —
it is the closest structural match and you should copy its shape:

```ts
function check(label: string, ok: boolean, detail = "") {
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`
  )
  if (!ok) process.exitCode = 1
}

const ACCOUNT = process.env.DEV_ACCOUNT_EMAIL ?? "dev@quincy.test"

if (!ACCOUNT.endsWith("@quincy.test")) {
  throw new Error(
    `Refusing to touch ${ACCOUNT} — this script … and ` +
      "only operates on @quincy.test accounts."
  )
}
```

Its header comment states what the script is for, why the thing it covers is
dangerous, what is *not* covered, and that teardown deletes only what it
created. Match that structure.

## Commands you will need

| Purpose        | Command | Expected on success |
|----------------|---------|---------------------|
| Typecheck      | `pnpm typecheck` | exit 0 |
| Unit tests     | `pnpm test` | 40 files, 701 tests passing |
| Lint           | `pnpm exec eslint <files you changed>` | no output |
| Format         | `pnpm exec prettier --write <files you changed>` | lists the files |
| Run the script | `npx tsx --env-file=.env.local scripts/verify-draft-receipt.ts` | every line `PASS`, exit 0 |
| Repair account | `npx tsx --env-file=.env.local scripts/dev-account.ts` | idempotent; run if the test user is missing |

## Scope

**In scope**:
- `scripts/verify-draft-receipt.ts` (create)
- `lib/riffs.test.ts` — only if you extract a pure helper in Step 4; otherwise
  leave it alone

**Out of scope** (do NOT touch, even though they look related):
- `app/(app)/riffs/actions.ts` — do **not** refactor `draftAngle` to accept an
  injected generator just to make it testable. It is a `"use server"` action;
  adding a parameter to it widens what a browser can influence, and the
  ownership argument in its own doc comment is about exactly that. If you
  conclude a seam is genuinely needed, STOP and report rather than adding one.
- `lib/drafting.ts` — `generateDraft` is already injectable at the type level;
  nothing there needs to change for this plan.
- The `bool_and` SQL itself. This plan *covers* it; it does not change it. If a
  test fails, report the failure — do not adjust the query to make the test
  pass.
- Any `@quincy.test` guard, anywhere. Never relax it.

## Git workflow

- Branch: `advisor/025-cover-the-receipt`
- One commit. Message style is a sentence, not a conventional-commit prefix.
- Do NOT push or open a PR.

## Steps

### Step 1: Scaffold the script with its guard and teardown

Create `scripts/verify-draft-receipt.ts`. Before writing any assertion:

- The header comment (see Conventions).
- The `@quincy.test` guard, copied in shape from
  `scripts/verify-publish-run.ts`.
- Resolve the test user id from `ACCOUNT` via a `user` lookup; if there is no
  such user, print a line telling the operator to run
  `npx tsx --env-file=.env.local scripts/dev-account.ts` and exit non-zero.
- A `teardown()` that deletes **only rows this script created**, identified by
  an id prefix you choose (e.g. `vdr-`), scoped to the test user id, and run in
  a `finally` so a failed assertion still cleans up.

**Verify**: `npx tsx --env-file=.env.local scripts/verify-draft-receipt.ts` →
runs, prints nothing but the header, exits 0. Then confirm it leaves no rows:
`select count(*) from draft where id like 'vdr-%'` → 0.

### Step 2: Cover the four `fellBack` derivation cases

Insert `riff`, `riff_angle`, `draft` and `draft_version` rows directly (not via
`draftAngle` — that would spend money on a real model call), one scenario per
hook, all owned by the test user, all with your id prefix:

| Scenario | Rows to write | Expect from `getRiffsForUser` |
|---|---|---|
| total fallback | draft + 2 versions, both bodies == hook | `status: "drafted"`, `fellBack: true` |
| partial | draft + 2 versions, one body == hook, one written | `status: "drafted"`, `fellBack` falsy |
| no versions | draft, zero `draft_version` rows | `status: "drafted"`, `fellBack` falsy |
| not drafted | angle only, no draft | `status` undefined |

Then call `getRiffsForUser` for the test user and assert with `check(...)`. Read
the function's signature in `lib/riffs.ts` before calling — it takes the user
object, not just an id, and resolves a timezone.

The "no versions" case is the one most likely to be got wrong by a future
change, because an `innerJoin` looks equivalent and silently drops the angle out
of the drafted set. Label that `check` so its name says what breaks.

**Verify**: `npx tsx --env-file=.env.local scripts/verify-draft-receipt.ts` →
4 PASS, 0 FAIL, exit 0.

### Step 3: Cover the receipt's `existing` path through the real action

`draftAngle` is safe to call **only** when it will short-circuit before spending.
Two such paths exist and both are worth covering:

1. **`existing: true`** — write a draft carrying the angle's hook first, then
   call `draftAngle({ angleId })`. It must return `ok: true`, `existing: true`,
   `written: false`, `fellBack: []`, and the channels of the draft that already
   existed. No model call happens, so this costs nothing.
2. **`reason: "no-channel"`** — an angle whose `shape` is `Essay` on a test user
   with at least one active `channel_connection` that is not `substack`. It must
   return `ok: false` with `reason: "no-channel"`. This is the fix for the
   Substack-draft-for-an-X-account bug and it also returns before the
   entitlement gate, so it needs no subscription.

**Do not** write a case that reaches `generateDraft`. If a scenario you are
building would, STOP — a verify script must not buy model calls on every run.

Note that path 2 requires the test user to have a connection row; create one
with your id prefix and tear it down.

**Verify**: `npx tsx --env-file=.env.local scripts/verify-draft-receipt.ts` →
6 PASS, 0 FAIL, exit 0. Confirm no new `usage_event` rows were written for the
test user during the run — that is the proof no model call happened.

### Step 4: Consider extracting the fallback decision (optional)

The per-channel decision inside `draftAngle` —

```ts
    const body = generated ?? angle.hook
    if (generated === undefined) fellBack.push(target.id)
```

— is pure and currently untestable in vitest only because it is inlined in a
server action. If you can extract it to a small exported function in
`lib/drafting.ts` (e.g. `resolveBodies(targets, versions, hook)` returning
`{ channelBodies, fellBack }`) **without changing behaviour**, do so and add
unit tests to `lib/drafting.test.ts` for: all channels written, none written,
some written, and a version for a channel that was not requested (it must be
ignored, not appended).

This is optional. If the extraction touches more than `lib/drafting.ts`,
`lib/drafting.test.ts` and the one block in `actions.ts`, skip it and say so in
your report — the script from Steps 1–3 is the deliverable.

**Verify** (only if done): `pnpm test` → 701 + your new tests, all passing.

### Step 5: Format, lint, typecheck

**Verify**:
- `pnpm exec prettier --write scripts/verify-draft-receipt.ts` (plus any other file you changed) → exit 0
- `pnpm exec eslint scripts/verify-draft-receipt.ts` → no output
- `pnpm typecheck` → exit 0
- `pnpm test` → all pass

## Test plan

- New file `scripts/verify-draft-receipt.ts`, structured after
  `scripts/verify-publish-run.ts`, with 6 `check(...)` assertions (Steps 2–3).
- Optional unit tests in `lib/drafting.test.ts` (Step 4), structured after the
  existing `describe("targetsFor")` block.
- The script is not run by `pnpm test` and must not be — it needs a database and
  an env file. Its home is the same as every other `verify-*.ts`: run by hand,
  and named in your report.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `scripts/verify-draft-receipt.ts` exists and its first 40 lines contain
      the `@quincy.test` guard
- [ ] `npx tsx --env-file=.env.local scripts/verify-draft-receipt.ts` prints
      6 or more PASS and 0 FAIL, and exits 0
- [ ] Re-running it immediately produces the same result (it is idempotent —
      teardown worked)
- [ ] `select count(*) from draft where id like '<your-prefix>%'` returns 0 after a run
- [ ] No `usage_event` row was created for the test account during a run
- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0
- [ ] `git status --short` lists only in-scope files
- [ ] `advisor-plans/README.md` status row for 025 updated

## STOP conditions

Stop and report back (do not improvise) if:

- `DEV_ACCOUNT_EMAIL` resolves to anything not ending in `@quincy.test`. Do not
  proceed, do not "just this once" point it elsewhere.
- A scenario you are building would reach `generateDraft`, i.e. would buy a real
  model call.
- Making an assertion pass would require editing the `bool_and` query, the
  `fellBack` derivation, or `draftAngle`. Those are the code under test; a
  failure is a finding, not a task.
- You conclude `draftAngle` needs an injected generator to be testable. Report
  it; do not add the parameter.
- The teardown cannot identify its own rows precisely. An unscoped delete
  against this database is the failure mode `AGENTS.md` warns about most
  loudly.

## Maintenance notes

- **What will interact with this**: plan 024 adds the same
  body-equals-hook comparison in `components/drafts/draft-parts.tsx`. If the
  definition of "fell back" ever changes (say, to a stored column instead of a
  derivation), all three sites move together and this script is what proves it.
- **What a reviewer should scrutinise**: the teardown scoping and the guard,
  before anything about the assertions. Everything else is recoverable.
- **Deferred**: covering the paths that do spend — a real `generateDraft` round
  trip belongs in a manual check, not in a script anyone might run in a loop.

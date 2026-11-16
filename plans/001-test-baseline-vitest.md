# Plan 001: Establish a test runner and lock down the entitlement state machine

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat fee31fe..HEAD -- lib/billing.ts lib/trial.ts package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `fee31fe`, 2026-08-02

## Why this matters

This repository has **no test runner at all** — `package.json` has no `test`
script and there is no vitest/jest config. The only "verification" is a set of
hand-run `scripts/verify-*.ts` files that talk to the real Neon database and a
real running server.

Billing logic was just added. It decides whether an account may spend money on
model calls, and it has four outcomes (`trialing` / `active` / `expired` /
`lapsed`) resolved by pure branching over two inputs. That is exactly the shape
that unit tests catch regressions in, and exactly the shape nobody can safely
change without them.

Three follow-up plans (002, 003, 004) modify this logic. Without a runner, each
of them ships on hope. This plan installs the runner and writes tests for the
behaviour that is currently **correct**, so the later plans have something that
fails when they break it.

This plan deliberately does **not** fix any bug. It records today's behaviour.

## Current state

Files that matter:

- `lib/billing.ts` — entitlement resolution. `resolveEntitlement()` is the
  function under test.
- `lib/trial.ts` — exports `startTrial(userId)` and `TRIAL_DAYS`. Writes to the
  database; will be mocked.
- `lib/db.ts` — exports `db`, a lazy Proxy around a Drizzle/Neon client. Will be
  mocked.
- `lib/session.ts` — exports `getSession()`; imports `next/headers`. **Must be
  mocked** or the test will drag in the whole Better Auth + Stripe stack.
- `package.json` — no `test` script today.

`lib/billing.ts:55-97` as it exists today:

```ts
export async function resolveEntitlement(user: {
  id: string
  trialEndsAt?: Date | string | null
}): Promise<Entitlement> {
  let endsAt = toDate(user.trialEndsAt)

  if (!endsAt) {
    endsAt = await startTrial(user.id)
  }

  if (endsAt && endsAt.getTime() > Date.now()) {
    return { state: "trialing", endsAt }
  }

  const rows = await db
    .select({ status: subscription.status })
    .from(subscription)
    .where(eq(subscription.referenceId, user.id))

  if (rows.some((row) => row.status && GOOD_STATUSES.has(row.status))) {
    return { state: "active" }
  }

  return rows.length > 0 ? { state: "lapsed" } : { state: "expired" }
}
```

Supporting definitions in the same file:

```ts
export type Entitlement =
  | { state: "trialing"; endsAt: Date }
  | { state: "active" }
  | { state: "expired" }
  | { state: "lapsed" }

export function isEntitled(entitlement: Entitlement): boolean {
  return entitlement.state === "trialing" || entitlement.state === "active"
}

const GOOD_STATUSES = new Set(["active", "trialing"])
```

Repo conventions you must match:

- **TypeScript, ESM.** `package.json` has `"type": "module"`. `tsconfig.json`
  maps `"@/*"` to `"./*"` (repo root), so `@/lib/billing` resolves to
  `lib/billing.ts`.
- **Package manager is `pnpm`.** Never use `npm install` or `yarn`.
- **Comments explain *why*, not *what*.** Look at `lib/session.ts` or
  `lib/trial.ts` for the house style: a block comment above a non-obvious
  decision explaining the reasoning and the cost of the alternative. Match this
  density in the test file — one comment per non-obvious mock, not one per line.
- **Prettier is configured** (`prettier` + `prettier-plugin-tailwindcss`). Do
  not hand-format against it; if `pnpm lint` complains about formatting, run
  `pnpm format`.

There is no existing test file to model after — this plan creates the first one.

## Commands you will need

| Purpose   | Command             | Expected on success           |
|-----------|---------------------|-------------------------------|
| Install   | `pnpm install`      | exit 0                        |
| Add dep   | `pnpm add -D vitest`| exit 0                        |
| Typecheck | `pnpm typecheck`    | exit 0, no output after the `$ tsc --noEmit` banner |
| Lint      | `pnpm lint`         | exit 1 with exactly 3 pre-existing errors (see below) |
| Tests     | `pnpm test`         | exit 0, all tests pass        |

**`pnpm lint` already fails on this repo before you change anything.** There are
exactly 3 pre-existing errors, in `components/rhythm-settings-dialog.tsx` (2)
and `hooks/use-mobile.ts` (1). That is the baseline. Your job is not to fix
them — your job is to not add a fourth. Run `pnpm lint` **before** you start and
record the count.

## Scope

**In scope** (the only files you should modify or create):
- `package.json` — add the `test` script and the vitest devDependency
- `pnpm-lock.yaml` — will change as a result of the install
- `vitest.config.ts` (create)
- `lib/billing.test.ts` (create)

**Out of scope** (do NOT touch, even though they look related):
- `lib/billing.ts` — this plan records current behaviour, it does not change
  it. Plans 002 and 004 change this file. If a test you write fails against the
  current implementation, that is a STOP condition, not an invitation to fix
  the source.
- `lib/trial.ts`, `lib/db.ts`, `lib/session.ts` — mocked, never edited.
- `scripts/verify-*.ts` — the existing manual scripts stay exactly as they are.
  They serve a different purpose (integration against real infrastructure).
- `next.config.ts`, `tsconfig.json` — vitest resolves its own aliases via
  `vitest.config.ts`; you do not need to touch the TypeScript config.
- The 3 pre-existing lint errors listed above.

## Git workflow

- Branch: `advisor/001-test-baseline`
- Commit style is conventional commits, lowercase, descriptive — from `git log`:
  `feat: the brain as a document, and a cache in front of it`,
  `fix: teach tailwind-merge the role scale`, `chore: ignore .vercel`.
  Use `test: a runner, and the entitlement state machine pinned down`.
- Do NOT push or open a PR.

## Steps

### Step 1: Record the lint baseline

Run `pnpm lint` and count the errors. Write the number down; you will compare
against it in the done criteria.

**Verify**: `pnpm lint 2>&1 | tail -3` → a line matching
`✖ 3 problems (3 errors, 0 warnings)`.

If the count is not 3, the repo has drifted — see STOP conditions.

### Step 2: Install vitest

```
pnpm add -D vitest
```

**Verify**: `node -e "console.log(require('./node_modules/vitest/package.json').version)"`
→ prints a version number, `3.x` or newer.

### Step 3: Add the test script

In `package.json`, inside `"scripts"`, add these two entries next to the
existing `"typecheck"` entry:

```json
"test": "vitest run",
"test:watch": "vitest"
```

**Verify**: `pnpm test` → exits non-zero with a message about no test files
found. That failure is expected at this step; it proves the script is wired.

### Step 4: Create `vitest.config.ts`

Create it at the repository root:

```ts
import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

/**
 * Vitest resolves its own module graph, so the `@/*` alias from tsconfig.json
 * has to be restated here — tsconfig paths are a type-level mapping and mean
 * nothing to the bundler at runtime.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
  },
})
```

**Verify**: `pnpm typecheck` → exit 0.

### Step 5: Write `lib/billing.test.ts`

Create the file with the structure below. The mocking setup is load-bearing and
is explained inline — **do not simplify it**.

```ts
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Three modules are mocked, for three different reasons.
 *
 * `@/lib/session` is mocked to keep the import graph small: it pulls in
 * lib/auth.ts, which constructs Better Auth and a Stripe client at module
 * scope. None of that is under test here, and loading it would make a unit
 * test depend on environment variables.
 *
 * `@/lib/db` and `@/lib/trial` are mocked because they are the two side
 * effects resolveEntitlement performs. Mocking them is what makes the state
 * machine testable without a database.
 */
const mocks = vi.hoisted(() => ({
  rows: [] as Array<{ status: string | null }>,
  startTrial: vi.fn<(userId: string) => Promise<Date | null>>(),
}))

vi.mock("@/lib/session", () => ({
  getSession: vi.fn(),
}))

vi.mock("@/lib/trial", () => ({
  TRIAL_DAYS: 1,
  startTrial: mocks.startTrial,
}))

/**
 * Only the shape resolveEntitlement actually calls:
 * db.select(...).from(...).where(...) awaited as an array.
 */
vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => mocks.rows,
      }),
    }),
  },
}))

const { isEntitled, resolveEntitlement } = await import("@/lib/billing")

const HOUR = 60 * 60 * 1000
const future = () => new Date(Date.now() + 24 * HOUR)
const past = () => new Date(Date.now() - HOUR)

beforeEach(() => {
  mocks.rows = []
  mocks.startTrial.mockReset()
})

describe("resolveEntitlement", () => {
  it("is trialing while the deadline is in the future", async () => {
    const endsAt = future()
    const result = await resolveEntitlement({ id: "u1", trialEndsAt: endsAt })

    expect(result).toEqual({ state: "trialing", endsAt })
    expect(mocks.startTrial).not.toHaveBeenCalled()
  })

  it("accepts an ISO string deadline as well as a Date", async () => {
    const endsAt = future()
    const result = await resolveEntitlement({
      id: "u1",
      trialEndsAt: endsAt.toISOString(),
    })

    expect(result.state).toBe("trialing")
  })

  it("starts a trial when none is recorded, and uses what startTrial returns", async () => {
    const endsAt = future()
    mocks.startTrial.mockResolvedValue(endsAt)

    const result = await resolveEntitlement({ id: "u1", trialEndsAt: null })

    expect(mocks.startTrial).toHaveBeenCalledWith("u1")
    expect(result).toEqual({ state: "trialing", endsAt })
  })

  it("is active when a subscription row is active, even after the trial ended", async () => {
    mocks.rows = [{ status: "active" }]

    const result = await resolveEntitlement({ id: "u1", trialEndsAt: past() })

    expect(result).toEqual({ state: "active" })
  })

  it("treats a stripe-side trialing subscription as active", async () => {
    mocks.rows = [{ status: "trialing" }]

    const result = await resolveEntitlement({ id: "u1", trialEndsAt: past() })

    expect(result).toEqual({ state: "active" })
  })

  it("is expired when the trial ran out and there is no subscription at all", async () => {
    mocks.rows = []

    const result = await resolveEntitlement({ id: "u1", trialEndsAt: past() })

    expect(result).toEqual({ state: "expired" })
  })

  it("is lapsed when a subscription was cancelled", async () => {
    mocks.rows = [{ status: "canceled" }]

    const result = await resolveEntitlement({ id: "u1", trialEndsAt: past() })

    expect(result).toEqual({ state: "lapsed" })
  })

  it("prefers an active row over a dead one", async () => {
    mocks.rows = [{ status: "canceled" }, { status: "active" }]

    const result = await resolveEntitlement({ id: "u1", trialEndsAt: past() })

    expect(result).toEqual({ state: "active" })
  })
})

describe("isEntitled", () => {
  it("lets trialing and active accounts spend", () => {
    expect(isEntitled({ state: "trialing", endsAt: future() })).toBe(true)
    expect(isEntitled({ state: "active" })).toBe(true)
  })

  it("stops expired and lapsed accounts", () => {
    expect(isEntitled({ state: "expired" })).toBe(false)
    expect(isEntitled({ state: "lapsed" })).toBe(false)
  })
})
```

**Verify**: `pnpm test` → exit 0, **10 tests passing, 0 failing**.

If any test fails, do not edit `lib/billing.ts`. See STOP conditions.

### Step 6: Confirm nothing else broke

**Verify all three**:
- `pnpm typecheck` → exit 0
- `pnpm lint 2>&1 | tail -3` → still exactly `3 problems (3 errors, 0 warnings)`
- `git status --short` → shows only `package.json`, `pnpm-lock.yaml`,
  `vitest.config.ts`, `lib/billing.test.ts` (and `plans/README.md` once you
  update the status row)

## Test plan

The tests written in step 5 **are** the deliverable. They cover:

- happy path: trialing, active
- the two "no longer allowed" outcomes: expired, lapsed
- input coercion: `Date` and ISO string deadlines
- the lazy trial start, including that its return value is used
- multi-row precedence: one good row wins over a dead one
- the `isEntitled` truth table, all four states

No existing test to model after — this is the first. Later plans should follow
this file's structure: `vi.hoisted` for mutable mock state, one `describe` per
exported function, one behaviour per `it`.

Verification: `pnpm test` → 10 passed.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm test` exits 0 and reports 10 passing tests
- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` reports exactly 3 problems — the same 3 as before this plan
- [ ] `lib/billing.ts` is unmodified: `git diff --exit-code lib/billing.ts` exits 0
- [ ] `git status --short` lists no files outside the in-scope list
- [ ] `plans/README.md` status row for 001 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The `pnpm lint` baseline in step 1 is not exactly 3 errors — the repo has
  drifted from what this plan was written against.
- The excerpt of `resolveEntitlement` in "Current state" does not match
  `lib/billing.ts` in the working tree.
- **Any test in step 5 fails.** Every one of them asserts behaviour the current
  code already has. A failure means either the code changed or this plan is
  wrong; both need a human. Do not "fix" `lib/billing.ts` to make a test pass —
  that file is out of scope.
- Importing `@/lib/billing` in the test throws (for example, complaining about
  `next/headers`, a missing `DATABASE_URL`, or React's `cache`). The three
  `vi.mock` calls are supposed to prevent this. Report the exact error rather
  than adding more mocks.
- `pnpm add -D vitest` pulls in a peer-dependency conflict with the installed
  `vite`/`next` versions.

## Maintenance notes

- **Plans 002 and 004 will change `lib/billing.ts` and must update this file.**
  Specifically, plan 002 changes what happens when the only subscription row has
  status `incomplete`; the test `"is expired when the trial ran out and there is
  no subscription at all"` stays, and a new one is added beside it.
- The db mock is deliberately shallow — it mirrors exactly the one call chain
  `resolveEntitlement` uses. If `lib/billing.ts` ever adds a different Drizzle
  call shape (a `limit`, a join, an `orderBy`), this mock will fail with
  "not a function" rather than a wrong answer. That is intended: a loud failure
  beats a silently wrong stub.
- `getBillingSnapshot` is **not** covered here — it depends on `getSession`,
  which is mocked out to nothing. Covering it needs the mock to return a
  session; that is deliberately deferred, and is the obvious next test to write.
- A reviewer should check that no test asserts on wall-clock timing beyond
  "past" vs "future" — these tests must not become flaky near midnight or under
  a slow CI runner.

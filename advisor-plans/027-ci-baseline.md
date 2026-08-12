# Plan 027: Make the quality gates automatic — a CI workflow that runs typecheck, lint and tests

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md` — unless a reviewer dispatched you and told
> you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 223a12d..HEAD -- package.json eslint.config.mjs hooks/use-mobile.ts components/editor/studio-preview.tsx "app/api/editor/projects/[id]/agent/route.ts" lib/editor/media.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `223a12d`, 2026-08-12

## Why this matters

The repo has 887 passing tests, a clean `pnpm typecheck`, and nothing that
runs either automatically. There is no `.github/` directory at all. Every
quality gate is voluntary and local, and the database behind the app is a
single Neon branch that **is** production — so there is no environment in
which a bad merge is caught before it is live. This plan adds the smallest
honest gate: a GitHub Actions workflow that runs install, typecheck, lint and
tests on every push and pull request.

One complication: `pnpm lint` currently **fails** with 2 errors and 3
warnings. A CI that goes red on day one teaches people to ignore it, so this
plan fixes the two errors and the fixable warnings first, then adds the
workflow. All five problems were verified by running `pnpm lint` at commit
`223a12d`; the fixes below are mechanical.

## Current state

- No `.github/` directory exists (`ls .github` → "No such file or directory").
- `package.json` has no `packageManager` and no `engines` field. The local
  toolchain is pnpm 11.5.0 on Node v22. `docs/video-ingest.md` records that
  installing with npm instead of pnpm produces an `ffmpeg-static` with no
  binary, so pinning the package manager has value beyond CI.
- `pnpm lint` output at `223a12d`:

```
app/.well-known/workflow/v1/flow/route.js
  2:1  warning  Unused eslint-disable directive
app/api/editor/projects/[id]/agent/route.ts
  210:27  warning  'isAborted' is defined but never used
components/editor/studio-preview.tsx
  60:14  error  Cannot access refs during render   react-hooks/refs
hooks/use-mobile.ts
  14:5  error  Calling setState synchronously within an effect  react-hooks/set-state-in-effect
lib/editor/media.test.ts
  6:3  warning  'FILMSTRIP_TILES' is defined but never used
```

- `hooks/use-mobile.ts` is the stock shadcn hook:

```ts
// hooks/use-mobile.ts:5-19
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}
```

- `components/editor/studio-preview.tsx:60` is `ref={player.ref}` on the
  Remotion `<Player>`. `player.ref` is a plain `React.useRef<PlayerRef | null>`
  created in `components/editor/use-player.ts:103` and carried on the returned
  `Player` object. Passing a ref object as a `ref` prop is legitimate; the new
  `react-hooks/refs` rule cannot see through the object property and flags it.
  This is a false positive, not a defect.
- `app/.well-known/workflow/**` is **not tracked by git** — it is generated
  locally by the `workflow` package's dev plugin. It will not exist in CI, but
  it makes local `pnpm lint` noisy.
- `eslint.config.mjs` already uses `globalIgnores([...])` — extend that list,
  do not add a second mechanism.
- Tests pass without any environment variables (verified:
  `env -u DATABASE_URL pnpm test` → 887 passed). The suite is pure mocks; CI
  needs no secrets.
- Repo conventions: pnpm only; commit messages are single evocative sentences
  (see `git log --oneline -5`, e.g. "The time zone was written once at signup
  and could never be corrected").

## Commands you will need

| Purpose   | Command          | Expected on success        |
|-----------|------------------|----------------------------|
| Install   | `pnpm install`   | exit 0                     |
| Typecheck | `pnpm typecheck` | exit 0, no output          |
| Lint      | `pnpm lint`      | exit 0 after this plan     |
| Tests     | `pnpm test`      | 887+ tests pass            |

## Scope

**In scope** (the only files you should modify or create):
- `package.json` (add `packageManager`, `engines`)
- `hooks/use-mobile.ts`
- `components/editor/studio-preview.tsx` (one comment + one disable line)
- `app/api/editor/projects/[id]/agent/route.ts` (remove one unused binding)
- `lib/editor/media.test.ts` (remove one unused import)
- `eslint.config.mjs` (one ignore entry)
- `.github/workflows/ci.yml` (create)

**Out of scope** (do NOT touch):
- `app/.well-known/**` — generated by the workflow package; ignore it in
  eslint config instead of editing it.
- Any behaviour change beyond the lint fixes. In particular do not
  restructure `components/editor/use-player.ts` — the ref-on-object shape is
  deliberate (its comments explain the playhead re-render loop it prevents).
- `scripts/verify-*.ts` — they run against the production database and must
  never run in CI. This exclusion is a settled decision.

## Git workflow

- Branch: `advisor/027-ci-baseline`
- One commit per step or one commit for the lint fixes plus one for the
  workflow. Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Pin the toolchain in package.json

Add to the top level of `package.json`:

```json
"packageManager": "pnpm@11.5.0",
"engines": { "node": ">=22" }
```

**Verify**: `pnpm install` → exit 0 (lockfile unchanged, no error about the
packageManager field).

### Step 2: Fix `hooks/use-mobile.ts` with `useSyncExternalStore`

Replace the state-plus-effect shape with the store subscription React
provides for exactly this case:

```ts
import * as React from "react"

const MOBILE_BREAKPOINT = 768
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    // Server snapshot: no viewport exists, so "not mobile", matching the
    // previous hook's `undefined → false` first render.
    () => false
  )
}
```

Behaviour note: the old hook returned `false` on the first client render and
corrected after the effect ran; `useSyncExternalStore` reads the real value on
first client render. That is a strict improvement (no flash), and the server
render agrees with the old behaviour.

**Verify**: `pnpm lint 2>&1 | grep use-mobile` → no output.
**Verify**: `grep -rn "useIsMobile" components app lib hooks --include="*.tsx" --include="*.ts" | grep -v use-mobile.ts` — confirm callers still compile: `pnpm typecheck` → exit 0.

### Step 3: Silence the false-positive refs error with a targeted disable

In `components/editor/studio-preview.tsx`, immediately above the
`ref={player.ref}` line (currently line 60), add:

```tsx
// `player.ref` is a plain useRef created in use-player.ts and only *passed*
// here, never read during render. The react-hooks/refs rule cannot see
// through the object property. Do not restructure the Player API for this.
// eslint-disable-next-line react-hooks/refs
ref={player.ref}
```

(The disable comment goes inside the JSX attribute list, directly above the
`ref=` line, using the `{/* */}`-free `//` form inside the props — if eslint
does not honour the placement there, wrap the two comment lines in `{/* ... */}`
above the `<Player`, and put `// eslint-disable-next-line react-hooks/refs`
as the last line before `ref={player.ref}`.)

**Verify**: `pnpm lint 2>&1 | grep studio-preview` → no output.

### Step 4: Remove the two unused bindings and ignore the generated route

- `app/api/editor/projects/[id]/agent/route.ts:210` — delete the unused
  `isAborted` from the destructuring (leave the rest of the callback exactly
  as it is).
- `lib/editor/media.test.ts:6` — delete `FILMSTRIP_TILES` from the import.
- `eslint.config.mjs` — add `"app/.well-known/**"` to the existing
  `globalIgnores([...])` array, with a one-line comment: generated by the
  workflow package's dev plugin, untracked.

**Verify**: `pnpm lint` → exit 0, zero problems.

### Step 5: Create the workflow

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
```

`pnpm/action-setup@v4` reads the version from the `packageManager` field
added in Step 1 — do not also pass `version:`.

**Verify**: `pnpm typecheck && pnpm lint && pnpm test` all exit 0 locally —
the same three commands the workflow runs, in the same order.

## Test plan

No new test files. The deliverable is that the existing suite becomes
enforced. Full-suite run is the verification: `pnpm test` → 887+ pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0 with zero problems
- [ ] `pnpm test` exits 0
- [ ] `grep -c packageManager package.json` → 1
- [ ] `.github/workflows/ci.yml` exists and names the three check commands
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `advisor-plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The `react-hooks/refs` disable in Step 3 does not silence the error — that
  means the rule is firing on something other than the prop pass, and the
  cause needs a human read, not a bigger disable.
- Step 2's rewrite breaks any caller of `useIsMobile` in a way `pnpm
  typecheck` reports.
- `pnpm lint` reports problems in files this plan does not list — the lint
  baseline has drifted since `223a12d`; report the new problems rather than
  fixing them.
- Anything asks you to run a `scripts/verify-*.ts` file. Those hit the
  production database. This plan never needs one.

## Maintenance notes

- The workflow deliberately runs no build. `next build` needs env vars and
  ~2 min; add it later as a separate job if wanted, not by widening this one.
- `scripts/verify-*.ts` must stay out of CI permanently — they mutate the
  production database. Any future "increase coverage in CI" change must not
  glob them in.
- If the `react-hooks/refs` rule later learns to see through object
  properties, remove the Step 3 disable.

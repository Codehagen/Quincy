# Plan 038: Keep voice cleaning from failing an ingest

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report; do not improvise.
> When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat c17719c..HEAD -- lib/editor/ingest.ts lib/editor/ingest.test.ts app/api/editor/assets/[id]/ingest/route.ts`
> If any of these changed, compare the excerpts below with the live code; a
> mismatch is a STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `c17719c`, 2026-11-19

## Why this matters

Ingest runs synchronously inside one serverless function with
`maxDuration = 300` seconds (`app/api/editor/assets/[id]/ingest/route.ts:65`).
Recordings may be up to 20 minutes (`MAX_RECORDING_SECONDS = 20 * 60` in
`lib/editor/ingest-limits.ts:24`). Plan 037 added a cleaned-voice step to
`runIngest`. That step decodes the original's whole audio track again and runs
`afftdn` (FFT denoise) and `loudnorm` over it. The step itself is non-fatal
(errors become warnings). But it runs before `runIngest` returns, and
`completeIngest` only writes the row after that. If the extra seconds push a
long take past 300 s, the platform kills the function. The asset then never
reaches `ready`, so a nice-to-have step can lose a whole upload. The fix is to
give the step a time budget, so it is skipped when the run is already long.
The studio's Clean sound button
(`POST /api/editor/assets/[id]/voice`) already makes the track on demand.

## Current state

- `lib/editor/ingest.ts`: `runIngest(input, ports)` is the pipeline. The voice
  step comes after the filmstrip step and before vision:

  ```ts
  // lib/editor/ingest.ts ~line 307
  if (probe.hasAudio && transcoder.voice) {
    try {
      const voiceKey = storageKeys.voice(input.contentHash)
      if (!(await storage.exists(voiceKey))) {
        await storage.put(voiceKey, await transcoder.voice(input.source), "audio/mp4")
      }
    } catch (error) {
      warnings.push(`voice: ${message(error)}`)
    }
  }
  ```

- `IngestPorts` (same file, ~line 125) is the dependency bag: `storage`,
  `transcoder`, `transcriber`, `vision?`, `peaksFromPcm`, `admit?`,
  `onProgress?`, `proxyOptions?`. Optional ports are the convention for
  behaviour a caller may leave out.
- `lib/editor/ingest.test.ts` tests `runIngest` with fake ports. Read it first
  and copy how it builds a fake transcoder and storage.
- Convention: comments explain *why*, in full sentences, and never name other
  products (the repo is open source; see AGENTS.md).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `pnpm typecheck` | exit 0 |
| Tests (this area) | `pnpm vitest run lib/editor/ingest.test.ts` | all pass |
| All tests | `pnpm test` | all pass |
| Lint | `pnpm lint` | 0 errors |

## Scope

**In scope**: `lib/editor/ingest.ts`, `lib/editor/ingest.test.ts`,
`app/api/editor/assets/[id]/ingest/route.ts` (only to pass the new port).

**Out of scope**: `lib/editor/media.ts` (the filter, see plan 039),
`app/api/editor/assets/[id]/voice/route.ts`, any queue or background-job
infrastructure. Do not move ingest to a worker.

## Git workflow

Branch `advisor/038-voice-ingest-budget`. Commit messages are a short
imperative subject plus a why-paragraph, like the existing log
(`git log --oneline -5`). Do not push unless told to.

## Steps

### Step 1: Add a deadline port

Add to `IngestPorts` an optional `voiceDeadline?: () => boolean`. It should
return true when there is no longer time to clean the voice. In `runIngest`,
skip the voice step when `ports.voiceDeadline?.()` is true. When it is
skipped, push the warning `voice: skipped, left for the Sound button`, so the
reason is on the row. Add a two-line comment saying why: the function's
deadline is shared with the steps that matter, and the studio can make the
track later.

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Pass it from the route

In `app/api/editor/assets/[id]/ingest/route.ts`, take `const startedAt =
Date.now()` just before `withWorkspace`. Pass
`voiceDeadline: () => Date.now() - startedAt > VOICE_BUDGET_MS` into the
`runIngest` ports. Use `const VOICE_BUDGET_MS = 150_000`, named and commented:
half of `maxDuration`, which leaves room for the voice pass on a long take and
for `completeIngest` after it.

**Verify**: `pnpm typecheck` → exit 0.

### Step 3: Tests

In `lib/editor/ingest.test.ts` add two tests that follow the existing style:
1. With `voiceDeadline: () => true` and a fake transcoder whose `voice` is a
   spy, `voice` is never called and `warnings` contains a string starting
   with `voice: skipped`.
2. With `voiceDeadline: () => false`, `voice` is called once and the storage
   fake received a put under a key that starts with `derived/voice/v1/`.

**Verify**: `pnpm vitest run lib/editor/ingest.test.ts` → all pass, 2 new.

### Step 4: Full gate

**Verify**: `pnpm typecheck && pnpm lint && pnpm test` → exit 0.

## Done criteria

- `grep -n "voiceDeadline" lib/editor/ingest.ts app/api/editor/assets/\[id\]/ingest/route.ts` shows both.
- The two new tests pass, and the full suite passes.

## STOP conditions

- `runIngest` no longer contains the voice step quoted above.
- The ingest route no longer calls `runIngest` inside `withWorkspace`, for
  example because ingest moved to a worker. The budget may then be wrong, so
  report back.

## Maintenance note

Any new step added to `runIngest` after the proxy competes for the same 300 s.
A reviewer should ask of each one whether it is fatal, and if not, whether it
needs a budget like this.

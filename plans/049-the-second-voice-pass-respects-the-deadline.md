# Plan 049: The second voice pass respects the ingest deadline

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report; do not improvise.
> When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 7872775..HEAD -- lib/editor/transcoder-ffmpeg.ts lib/editor/ingest.ts "app/api/editor/assets/[id]/ingest/route.ts"`
> If any of these changed, compare the excerpts below with the live code. A
> mismatch is a STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: correctness
- **Planned at**: commit `7872775`, 2026-11-19

## Why this matters

Ingest runs in one function with `maxDuration = 300` seconds
(`app/api/editor/assets/[id]/ingest/route.ts:72`). The cleaned-voice step is
gated by `voiceDeadline` (150 s after start, `VOICE_BUDGET_MS`), but the gate
is checked only once, before the step starts. Since PR #7 the step can run
two full ffmpeg passes: the speech-model pass, and then the plain chain again
when the model removed the voice or failed (`voice()` in
`lib/editor/transcoder-ffmpeg.ts`). Measured locally on a 20-minute take: 29 s
for the model pass and 22 s for the plain pass. A function CPU slower than
that can push a long take past 300 s, and then the platform kills the
function and the upload never reaches `ready` — for a nice-to-have track the
Sound button (`POST /api/editor/assets/[id]/voice`) can make later.

## Current state

- `lib/editor/transcoder-ffmpeg.ts`, `voice(source)`: runs
  `voiceDenoiseArgs`; on a refused or failed model pass it falls through to
  `run(ffmpegBinary(), voiceCleanArgs(input, output), …)` unconditionally.
- `lib/editor/ingest.ts`: `Transcoder.voice?(source): Promise<VoiceTrack>`;
  `IngestPorts.voiceDeadline?: () => boolean`; the voice step stores
  `track.bytes` under `storageKeys.voice` or `storageKeys.voicePlain`.
- The route passes `voiceDeadline: () => Date.now() - startedAt > VOICE_BUDGET_MS`.

## Steps

1. In `lib/editor/ingest.ts`, give `Transcoder.voice` an optional second
   argument `options?: { mayRetry?: () => boolean }` and let it resolve to
   `VoiceTrack | null`. Null means "the model pass did not give a track and
   there was no time for the plain one". Document both on the type.
   Add `voiceRetryDeadline?: () => boolean` to `IngestPorts`, documented as
   "true once there is no longer time for a second voice pass".
2. In the voice step, call `transcoder.voice(input.source, { mayRetry: () =>
   !ports.voiceRetryDeadline?.() })`. On `null`, push a warning
   `voice: <note>, no time to clean again, left for the Sound button` and
   store nothing.
3. In `voice()` (`transcoder-ffmpeg.ts`): before the plain-chain fallback, if
   a model pass ran (model present) and `options?.mayRetry?.() === false`,
   return `null`. A missing model is a single plain pass and is never gated.
   Make the note available: change the return to carry it (e.g. throw is not
   wanted; instead return `null` and let ingest word the warning, or return
   `{ skipped: note }` — pick `null` plus a generic warning to keep the type
   small).
4. In the ingest route add `const VOICE_RETRY_BUDGET_MS = 200_000` with a
   comment (the plain pass on a 20-minute take plus `completeIngest` fits in
   the last 100 s) and pass `voiceRetryDeadline: () => Date.now() - startedAt
   > VOICE_RETRY_BUDGET_MS`.
5. `app/api/editor/assets/[id]/voice/route.ts` calls `voice()` with no
   options and must handle the new `null` type (it cannot be null without
   `mayRetry`; narrow with a guard that throws).

**Verify after each step**: `pnpm typecheck` → exit 0.

## Tests

- `lib/editor/ingest.test.ts`, in "runIngest, the cleaned voice": a fake
  `voice` resolving to `null` stores no `derived/voice/` key and adds a
  warning starting `voice:` that mentions the Sound button. Another: `voice`
  receives a `mayRetry` that returns `false` when `voiceRetryDeadline`
  returns `true`.
- `lib/editor/transcoder-ffmpeg.test.ts`, real-binary block: with the tone
  input and `mayRetry: () => false`, `voice()` resolves to `null`; with
  `VOICE_DENOISE=off` and `mayRetry: () => false` it still returns a plain
  track.

## Done criteria

- `pnpm typecheck` exit 0; `pnpm vitest run lib/editor` all pass; `pnpm lint`
  0 errors.

## Out of scope

- The vision upload after the voice step (pre-existing, not gated).
- Changing `VOICE_BUDGET_MS`.

## STOP conditions

- `voice()` gained other callers than ingest and the voice route.

## Maintenance

Any new pass added to `voice()` must take the same `mayRetry` gate.

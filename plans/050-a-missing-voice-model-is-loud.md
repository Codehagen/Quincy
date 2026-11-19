# Plan 050: A missing voice model is caught before deploy and loud after it

> **Executor instructions**: as in plan 049.
>
> **Drift check (run first)**:
> `git diff --stat 7872775..HEAD -- next.config.ts lib/editor/voice-model.ts lib/editor/transcoder-ffmpeg.ts`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 049 (touches the same `voice()`; land 049 first)
- **Category**: correctness / DX
- **Planned at**: commit `7872775`, 2026-11-19

## Why this matters

The speech model is a file read by path (`lib/editor/models/speech.rnnn`,
resolved by `voiceModelPath()` in `lib/editor/voice-model.ts`). It reaches
the deployed functions only because `next.config.ts` lists it under
`outputFileTracingIncludes` for `/api/editor/assets/[id]/ingest` and
`/api/editor/assets/[id]/voice`. If a rename or a route move breaks that,
every upload is quietly cleaned on the plain chain and filed under the plain
key (`storageKeys.voicePlain`). Lookups then find that track, so those takes
never get the model track later. Today the only signal is an ingest warning
string on the row. Separately, with `VOICE_DENOISE=off` the note wrongly
says "speech model not found".

## Steps

1. `lib/editor/voice-model.ts`: export `voiceModelState(env, cwd)` returning
   `{ path: string } | { off: true } | { missing: string }` (the path that
   was looked for), and keep `voiceModelPath` as a thin wrapper so callers
   and tests are unchanged.
2. `transcoder-ffmpeg.ts` `voice()`: use the state. `off` → note
   `speech model turned off (VOICE_DENOISE=off), cleaned without it`.
   `missing` → note `speech model not found at <path>, cleaned without it`
   and `console.error("[voice] speech model missing", path)` so it shows in
   the platform's error logs, not only on the row.
3. New test `lib/editor/next-config.test.ts`: import the default export of
   `next.config.ts` (STOP and fall back to reading the file as text and
   checking each route's array if importing pulls in modules that fail under
   vitest) and assert that `outputFileTracingIncludes` for both routes
   contains `./${DEFAULT_VOICE_MODEL}`.
4. Update the existing transcoder test that asserts the old "not found"
   note for `VOICE_DENOISE=off`.

**Verify**: `pnpm typecheck` exit 0; `pnpm vitest run lib/editor` all pass.

## Out of scope

- Re-cleaning takes that already have a plain track (a direction item: a
  backfill script, like `scripts/backfill-filmstrips.ts`).

## Maintenance

Moving either route or the model file must update `next.config.ts`; the new
test fails if it does not.

# Plan 051: Test that finished cuts keep their sound

> **Executor instructions**: as in plan 049.
>
> **Drift check (run first)**:
> `git diff --stat 7872775..HEAD -- lib/editor/media-entry.ts "app/api/editor/assets/[id]/voice/route.ts" lib/editor/media.ts`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 049 (the voice route's handling of `voice()` changes there)
- **Category**: test coverage
- **Planned at**: commit `7872775`, 2026-11-19

## Why this matters

PR #7 stores model tracks under `derived/voice/v3/` and plain ones under
`derived/voice/v2/`, and promises that a cut finished before the model keeps
its old track: `voiceKeys(hash)` lists v3 then v2, and `firstExisting`
(`lib/editor/ingest.ts`) picks the first that exists. Two places rely on
that and neither has a test: `mediaEntryFor` (`lib/editor/media-entry.ts`),
which gives the studio its `voiceUrl`, and `POST
/api/editor/assets/[id]/voice`, which returns an existing track or makes one
and files it under v3 or v2 by `track.denoised`. While here, make
`mediaEntryFor`'s two HEADs run in parallel instead of in sequence (a page
with many takes did up to two round trips per take in a row).

## Steps

1. `lib/editor/ingest.ts` `firstExisting`: check all keys in parallel
   (`Promise.all`) and return the first, in order, that exists. Same result,
   one round trip.
2. New `lib/editor/media-entry.test.ts`: build a `VideoAssetRow`-shaped
   object (cast through `unknown`; only the fields `mediaEntryFor` reads) and
   a fake storage whose `exists` answers from a `Set` and whose `url` returns
   `url:<key>`. Cases: only v2 → `voiceUrl` is v2's; v3 and v2 → v3's;
   neither → null; `exists` throws → null and the entry still resolves;
   an audio asset (`mimeType: "audio/mpeg"`) → null without calling `exists`.
3. New `app/api/editor/assets/[id]/voice/route.test.ts`, mocking like
   `app/api/editor/assets/[id]/ingest/route.test.ts` (session, entitlement,
   assets, ingest-meter, storage-r2, transcoder-ffmpeg). Cases: an existing
   v2 track is returned without cleaning; a denoised track is stored under
   v3; a plain track is stored under v2; a failed clean answers 500.

**Verify**: `pnpm vitest run lib/editor/media-entry.test.ts "app/api/editor/assets/[id]/voice"`
all pass; `pnpm typecheck` exit 0.

## Out of scope

- Changing what the route does; this plan adds tests and one parallel lookup.

## Maintenance

A fourth voice version must be added to `voiceKeys` in order; these tests
pin the order.

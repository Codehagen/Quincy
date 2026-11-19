# Plan 048: The project API reads its media the same way the cut page does

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 80bdd94..HEAD -- "app/api/editor/projects/[id]/route.ts" lib/editor/media-entry.ts "app/(app)/cuts/[id]/page.tsx" lib/editor/placement.ts`
> If any of these changed, compare the excerpts below with the live code
> first. A mismatch is a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `80bdd94`, 2026-11-19

## Why this matters

There are two copies of "which media does this project use, and what are
their URLs". The cut page (`app/(app)/cuts/[id]/page.tsx`) now uses the
shared `mediaEntryFor` (`lib/editor/media-entry.ts`). It also includes the
project's library (`document.metadata.library`), the media kind (video,
audio or image), the thumbnail and the cleaned voice. `GET
/api/editor/projects/[id]` still has its own older copy without any of
those. Today the only callers of that GET read `revision` and `lock`
(`components/editor/use-cuts-stream.ts:160`), so nothing is broken. The
first feature that reloads media from it, such as a conflict reload, would
silently lose pictures, music, the library and the cleaned voice.

## Current state

- `app/api/editor/projects/[id]/route.ts:150-204`: `resolveMedia(document, userId)`
  walks every element with a `mediaId`, calls `getAsset`, signs `proxyKey`,
  `seekIndexKey` and `filmstripKey`, and returns
  `{ id, filename, durationUs, width, height, fps, rotation, hasAudio, proxyUrl, seekIndexUrl, filmstrip }`.
- `app/(app)/cuts/[id]/page.tsx`, its `resolveMedia`:

  ```ts
  const mediaIds = new Set<string>([
    ...referencedMediaIds(document.scenes),
    ...(document.metadata.library ?? []),
  ])
  const storage = createR2Storage()
  const entries = await Promise.all(
    [...mediaIds].map(async (mediaId) => {
      const asset = await getAsset(mediaId, userId)
      if (!asset) return null
      return [mediaId, await mediaEntryFor(asset, storage)] as const
    })
  )
  ```

- `referencedMediaIds` is exported from `lib/editor/placement.ts`.
  `mediaEntryFor(asset, storage)` is exported from `lib/editor/media-entry.ts`.
- `MediaEntry` has every field the old API shape had, plus `kind`,
  `voiceUrl`, `thumbnailUrl` and `reading`. The change only adds fields to
  the response.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | 0 errors |
| Tests | `pnpm test` | all pass |

## Scope

**In scope**: `lib/editor/media-entry.ts`, `app/api/editor/projects/[id]/route.ts`,
`app/(app)/cuts/[id]/page.tsx`.

**Out of scope**: the GET response's other fields, the PUT handler, and
`isDocument`.

## Git workflow

Work on the branch you were given. Make one commit, for example
`Cuts: one media lookup for the page and the API`. Do not push unless told
to.

## Steps

### Step 1: Move the loop into `media-entry.ts`

Export
`resolveProjectMedia(document: VideoDocument, userId: string, storage = createR2Storage()): Promise<Record<string, MediaEntry>>`.
Use the page's body exactly as quoted above.

If importing `createR2Storage` or `getAsset` into `media-entry.ts` causes a
cycle, take `storage` and a `getAsset` function as parameters instead.

**Verify**: `pnpm typecheck` → exit 0

### Step 2: Use it in both places

- Replace the page's `resolveMedia` body with a call to `resolveProjectMedia`,
  or remove the function and call it directly.
- Replace the API route's `resolveMedia` with `resolveProjectMedia`, and
  remove the old function and the imports it alone used.

**Verify**: `pnpm typecheck && pnpm lint` → exit 0, 0 errors

### Step 3: Check that the old fields are still there

Compare field by field. Every key the old API object returned (`id`,
`filename`, `durationUs`, `width`, `height`, `fps`, `rotation`, `hasAudio`,
`proxyUrl`, `seekIndexUrl`, `filmstrip`) must exist on `MediaEntry` with the
same meaning. Read the type with
`grep -n "export type MediaEntry" -A30 components/editor/studio.tsx`.

**Verify**: `pnpm test` → all pass

## Done criteria

- [ ] `pnpm typecheck` exits 0, and `pnpm lint` reports 0 errors
- [ ] `pnpm test` exits 0
- [ ] `grep -c "async function resolveMedia" "app/api/editor/projects/[id]/route.ts" "app/(app)/cuts/[id]/page.tsx"` prints 0 for both, or one thin wrapper in the page
- [ ] `git status` shows only in-scope files

## STOP conditions

- A field of the old API shape has no equivalent on `MediaEntry`.
- Any client code reads `media` from the GET response with fields that
  `MediaEntry` names differently. Check with
  `grep -rn "\.media\[" components lib`.

## Maintenance notes

Anything new a studio entry needs goes in `mediaEntryFor`, and both the page
and the API get it.

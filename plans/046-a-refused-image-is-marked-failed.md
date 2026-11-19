# Plan 046: A refused image is marked failed

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 80bdd94..HEAD -- "app/api/editor/assets/[id]/ingest/route.ts" lib/editor/image-check.ts lib/editor/assets.ts lib/editor/storage-r2.ts`
> If any of these changed, compare the excerpts below with the live code
> first. A mismatch is a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none. If 045 has landed, extend its ingest route test
- **Category**: bug
- **Planned at**: commit `80bdd94`, 2026-11-19

## Why this matters

Images skip ffmpeg. Before an image is marked ready, the ingest route checks
the stored bytes: they must exist, be at most 25MB, and have PNG, JPEG, WebP
or GIF magic bytes that match the declared type. When the check fails, the
route answers 409, 413 or 415 and returns. The asset row stays in whatever
pre-ready state it had, and the object stays in the bucket. A file that is
too large or not a picture is a final answer, so the row should say `failed`
with the reason, as a failed video ingest does. 409 (not uploaded yet) is not
final: the client may retry once the PUT lands, so leave that case as it is.

The bytes are **not** deleted. Originals are content-addressed across all
users: `storageKeys.original(contentHash)` is `assets/<contentHash>`
(`lib/editor/media.ts:494`), and the key has no user in it. Deleting it could
remove another person's file that has the same hash. Cleaning up orphaned
originals needs a reference count, and that is out of scope here.

## Current state

- `app/api/editor/assets/[id]/ingest/route.ts:108-132`:

  ```ts
  if (asset.mimeType.startsWith("image/") && asset.state !== "ready") {
    if (!options.image) {
      return Response.json(
        { error: "An image needs its width and height." },
        { status: 400 }
      )
    }
    const problem = imageProblem(await readObjectHead(asset.storageKey), asset.mimeType)
    if (problem) {
      return Response.json({ error: problem.error }, { status: problem.status })
    }
    const done = await completeImage(id, userId, options.image)
    ...
  ```

- `lib/editor/assets.ts:237-250`: `failIngest(id, userId, reason)` sets
  `state: "failed"` and `error`. It is already imported by the route.
- `lib/editor/image-check.ts`: `imageProblem` returns `{ status, error }`
  with status 409, 413 or 415.
- Do not call `deleteObject` (`lib/editor/storage-r2.ts:290`). See "Why this
  matters".

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | 0 errors |
| Tests | `pnpm test` | all pass |

## Scope

**In scope**: `app/api/editor/assets/[id]/ingest/route.ts`, and the ingest
route test if plan 045 created it (otherwise create
`app/api/editor/assets/[id]/ingest/route.test.ts` following
`app/api/editor/projects/[id]/agent/route.test.ts`).

**Out of scope**: `image-check.ts` (its statuses are right),
`completeImage`, and the upload route.

## Git workflow

Work on the branch you were given. Make one commit, for example
`Cuts: a refused image is marked failed`. Do not push unless told to.

## Steps

### Step 1: Fail the row on a final refusal

In the `if (problem)` branch, when `problem.status !== 409`, call
`await failIngest(id, userId, problem.error)` before returning the same
response as today.

**Verify**: `pnpm typecheck && pnpm lint` → exit 0, 0 errors

### Step 2: Tests

With the mocks described in plan 045, Step 2:

- The 415 case calls `failIngest` with the error.
- The 413 case does the same.
- The 409 case does not call it.

**Verify**: `pnpm test -- "app/api/editor/assets"` → all pass, 3 new tests

## Done criteria

- [ ] `pnpm typecheck` exits 0, and `pnpm lint` reports 0 errors
- [ ] `pnpm test` exits 0, with 3 new tests
- [ ] `grep -n deleteObject "app/api/editor/assets/[id]/ingest/route.ts"` returns no matches
- [ ] `git status` shows only in-scope files

## STOP conditions

- `failIngest` cannot be called on a row in the state an image is in before
  ingest.

## Maintenance notes

If image ingest ever gains a real decode step (dimensions read on the
server), its failures should go through the same branch.

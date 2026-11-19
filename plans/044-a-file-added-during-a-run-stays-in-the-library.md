# Plan 044: A file added to the library while the agent is cutting is not lost

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 80bdd94..HEAD -- components/editor/studio-library.tsx components/editor/use-studio-tools.tsx components/editor/studio.tsx`
> If any of these files changed, compare the excerpts below with the live code
> first. A mismatch is a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `80bdd94`, 2026-11-19

## Why this matters

The project's library is the list of uploaded files that have not been placed
yet. It is stored only in `document.metadata.library` and written with an
`update_metadata` edit. Every hand edit goes through the studio's `commit`,
which drops the edit while an agent run holds the document. A file that
finishes uploading during a run is shown in the library until the page
reloads, and then it is gone. The upload itself succeeded. This can happen in
two ways:

1. A file is dropped on the library panel during a run. The drop handler does
   not check `disabled`. The Add button does.
2. An upload starts before a run and finishes after the run has started.

## Current state

- `components/editor/studio.tsx:520-526`:

  ```ts
  const commit = React.useCallback(
    (ops: Parameters<typeof apply>[0]) => {
      if (running) return
      apply(ops)
    },
    [apply, running]
  )
  ```

- `components/editor/use-studio-tools.tsx:91-102`:

  ```ts
  const addToLibrary = React.useCallback(
    async (assetId: string) => {
      const response = await fetcher(`/api/editor/assets/${assetId}/entry`)
      if (!response.ok) throw new Error("The file was added but could not be opened.")
      const entry = (await response.json()) as MediaEntry
      setMedia((current) => ({ ...current, [entry.id]: entry }))
      const library = document.metadata.library ?? []
      if (!library.includes(entry.id))
        commit([{ op: "update_metadata", patch: { library: [...library, entry.id] } }])
    },
    [fetcher, setMedia, document.metadata.library, commit]
  )
  ```

  The library panel captures this callback when the upload *starts*, so after
  a long upload both `commit` and `library` can be stale.
- `components/editor/studio-library.tsx` drop handler (around line 110):

  ```ts
  onDrop={(event) => {
    const file = event.dataTransfer.files[0]
    if (!file || !onAdded || busy) return
    event.preventDefault()
    void add(file)
  }}
  ```

  The component already receives `disabled` (it is `running`, see
  `use-studio-tools.tsx:351`).
- `useStudioTools` receives `running` and `commit` as arguments.

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Typecheck | `pnpm typecheck` | exit 0              |
| Lint      | `pnpm lint`      | exit 0, 0 errors    |
| Tests     | `pnpm test`      | all pass            |

## Scope

**In scope**: `components/editor/studio-library.tsx`,
`components/editor/use-studio-tools.tsx`.

**Out of scope**: `studio.tsx`'s `commit` (the run lock is correct and must
stay), the document reducer, and the upload client.

## Git workflow

Work on the branch you were given. Make one commit, for example
`Cuts: a file added during a run stays in the library`. Do not push unless
told to.

## Steps

### Step 1: Refuse a drop while disabled

In `studio-library.tsx`, change both `onDragOver` and `onDrop` to return
early when `disabled` is true. On a drop, do not call `preventDefault`. On
`onDragOver`, also skip `preventDefault`, so the browser shows "no drop".

**Verify**: `pnpm typecheck` → exit 0

### Step 2: Hold a library add until the run ends

In `useStudioTools`:

1. Add `const pendingLibrary = React.useRef<string[]>([])`.
2. In `addToLibrary`, after `setMedia`, push `entry.id` onto
   `pendingLibrary.current` instead of committing directly. Then call a new
   `flushLibrary()`.
3. `flushLibrary` reads the **current** `running`, `document.metadata.library`
   and `commit` through a ref that is updated on every render
   (`latest.current = { running, library, commit }`). Do not use the closure.
   If running, it returns. Otherwise it commits one `update_metadata` with
   every pending id not already in the library, then clears the queue.
4. Add an effect on `running`: when it becomes false, call `flushLibrary()`.

Do not set the ref during render if lint forbids it. In that case, assign it
in a `React.useLayoutEffect` with no dependency array. That is the pattern
lint accepts in this repo.

**Verify**: `pnpm typecheck && pnpm lint` → exit 0, 0 errors

### Step 3: Check it in the browser

1. Start the dev server:
   `PORT=3100 DATABASE_URL=postgres://u:p@127.0.0.1:5432/db BETTER_AUTH_SECRET=local-dev-secret-local-dev-secret pnpm dev`
2. Open `/prototypes/cuts-mock`. It is a mock studio that needs no database.
3. If the mock has no way to start a run, or no way to upload, skip this step
   and say so in your report.

**Verify**: if the mock allows it, a file dropped during a run shows in the
library after the run ends, and `document.metadata.library` contains its id.

## Test plan

There are no component tests in this repo (`*.test.tsx` does not exist). If
you can pull the queue logic into a pure function, for example
`mergeLibrary(library, pending): string[] | null`, place it in
`lib/editor/placement.ts` and test it in `lib/editor/basics.test.ts` with
these cases: nothing pending, an id already present, and two pending ids.

## Done criteria

- [ ] `pnpm typecheck` exits 0, and `pnpm lint` reports 0 errors
- [ ] `pnpm test` exits 0
- [ ] `grep -n "disabled" components/editor/studio-library.tsx` shows the drop and dragover guards
- [ ] `git status` shows only in-scope files changed (plus `basics.test.ts`/`placement.ts` if you added the helper)

## STOP conditions

- `running` is not available inside `useStudioTools`.
- The library is written anywhere other than `addToLibrary`. Run
  `grep -rn "library:" components lib` to check, and report what you find.

## Maintenance notes

- Any future hand edit that is triggered by something asynchronous, such as
  an upload or a fetch, has the same problem. It must read the latest
  `running` and `commit`, not the ones from when it started.

# Plan 045: Test the six new agent tools and the image and music paths through the upload routes

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 80bdd94..HEAD -- lib/editor/agent.ts "app/api/editor/assets/[id]/ingest/route.ts" app/api/editor/uploads/route.ts lib/editor/agent.test.ts`
> If any of these changed, re-read them before writing tests against them.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (tests only)
- **Depends on**: 043 (it changes `style_captions`. Write that tool's test after 043 lands, or against whichever behaviour is live)
- **Category**: tests
- **Planned at**: commit `80bdd94`, 2026-11-19

## Why this matters

`lib/editor/agent.ts` gained six tools: `add_text`, `add_transition`,
`set_speed`, `correct_words`, `style_captions` and `name_speaker`. None of
them is called in a test. The pure functions behind them are tested in
`lib/editor/basics.test.ts`. What is not tested is the agent layer: clip
numbering, unit conversion, what the tool *says* when nothing changed, and
the fact that it commits as `agent`. A wrong sentence teaches the model that
an edit worked. Separately, the upload and ingest routes have new branches
that are only tested through helpers. One branch completes an image after
checking its bytes. Another skips the daily transcription allowance for
music and pictures.

## Current state

- `lib/editor/agent.test.ts` has the harness to copy. It defines `scene()`
  (one 60-second clip of `va-1`), `snapshot()`, `harness({ words, base })`
  (returns `{ run, tools, streamed }`), `call(tool, input)` and `spineOf(run)`.
  Its tests read like this:

  ```ts
  it("refuses a clip number that is not there", async () => { ... })
  ```

- `app/api/editor/projects/[id]/agent/route.test.ts` shows how this repo
  tests a route: `vi.mock("@/lib/db", () => ({ db: {} }))`,
  `vi.mock("@/lib/session", ...)` and so on, then it calls the exported
  `POST` with a `Request`. Copy that structure.
- Ingest route, image branch:
  `app/api/editor/assets/[id]/ingest/route.ts:108-132`. It reads options from
  the body, returns 400 without `image.width`/`height`, calls
  `imageProblem(await readObjectHead(asset.storageKey), asset.mimeType)`,
  returns its status, and otherwise calls `completeImage`.
- Ingest route, allowance: `options.transcribe` is
  `body.purpose !== "music"`. When it is false, `dailyVerdict` is skipped.
- Upload route, `app/api/editor/uploads/route.ts:151-152`:

  ```ts
  const transcribes = body.purpose !== "music" && !mimeType.startsWith("image/")
  const today = transcribes ? dailyVerdict({ usedSeconds }) : ({ ok: true } as const)
  ```

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| One file | `pnpm test -- lib/editor/agent.test.ts` | all pass |
| Routes | `pnpm test -- app/api/editor` | all pass |
| All | `pnpm test` | all pass |
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | 0 errors |

## Scope

**In scope (create or extend only)**:
- `lib/editor/agent.test.ts`
- `app/api/editor/assets/[id]/ingest/route.test.ts` (create)
- `app/api/editor/uploads/route.test.ts` (create)

**Out of scope**: any non-test file. If a test exposes a bug, record it in
your report and mark the test `it.todo` with a one-line reason. Do not fix
the source.

## Git workflow

Work on the branch you were given. Make one commit per file, for example
`Cuts: tests for the agent's new tools`. Do not push unless told to.

## Steps

### Step 1: The agent tools (`agent.test.ts`, new `describe("the basics tools")`)

Write at least one positive test and one "nothing changed" test per tool:

- `add_text`: `{ role: "title", text: "Hello" }` adds a text track element
  with content `"Hello"` and `author` `agent`. The returned sentence contains
  `Hello`.
- `add_transition`: on a scene with two spine clips (split first with
  `tools.split_clip`, `{ atSeconds: 20 }`), `{ clipNumber: 2, kind: "dip_black" }`
  adds a transition. `{ clipNumber: 9, kind: "dissolve" }` returns
  `"There is no clip 9 on the spine."` and streams nothing.
- `set_speed`: `{ clipNumber: 1, speed: 2 }` halves the clip's `durationUs`
  (60s becomes 30s). The same call a second time returns the "already plays"
  sentence.
- `correct_words`: with captions built from `WORDS`
  (`tools.add_captions`), `{ replacements: [{ find: "two", replace: "2" }] }`
  returns `"Corrected 1 word."`. With an unknown word, it returns the "None of
  those words" sentence.
- `style_captions`: without captions, it returns the "no captions" sentence.
- `name_speaker`: `{ speakerNumber: 1, name: "Ada" }` sets
  `document.metadata.speakers["0"]` to `"Ada"`. Repeating the call returns
  `"That speaker already has that name."`.

**Verify**: `pnpm test -- lib/editor/agent.test.ts` → all pass, at least 12 new tests

### Step 2: The ingest route's image branch

Mock `@/lib/session` (signed in as `user-1`). Mock `@/lib/editor/assets`
(`getAsset` returns a row with `mimeType: "image/png"`, `state: "uploaded"`
and `storageKey: "k"`; `completeImage` is a `vi.fn` returning
`{ state: "ready" }`). Mock `@/lib/editor/storage-r2` so `readObjectHead` is
a `vi.fn`. Do not mock `lib/editor/image-check.ts`. Exercise it for real.
Cases:

1. No `image` in the body gives 400.
2. `readObjectHead` returns null, which gives 409.
3. It returns `{ sizeBytes: 26 * 1024 ** 2, head: PNG }`, which gives 413.
4. It returns JPEG bytes for a PNG row, which gives 415.
5. It returns real PNG bytes, which gives 200, and `completeImage` is called
   with `{ width, height }`.

PNG head: `new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])`.
JPEG head: `[0xff, 0xd8, 0xff, 0xe0]`.

If the route imports modules that fail to load in the test environment (ffmpeg
paths, R2 config), mock those modules too, the way the agent route test does.

**Verify**: `pnpm test -- "app/api/editor/assets"` → 5 pass

### Step 3: The allowance skip in the uploads route

The route imports `dailyVerdict` from `@/lib/editor/ingest-limits`, which
is pure: keep it real. Mock these instead:

- `@/lib/session`
- `@/lib/entitlement`: entitled
- `@/lib/editor/assets`: `findOrCreateAsset`
- `@/lib/editor/storage-r2`: `isR2Configured` returns true, and
  `createUploadUrl` returns a URL
- `@/lib/editor/ingest-meter`: `ingestCooldown` is clear, and
  `transcribedSecondsToday` returns `10 ** 9`, so the real `dailyVerdict`
  refuses

Read the route top to bottom first, so every call it makes is mocked.

Cases:

1. `video/mp4` with no purpose gives 429.
2. `audio/mpeg` with `purpose: "music"` does not give 429.
3. `image/png` does not give 429.
4. `image/png` with `sizeBytes` over 25MB gives 400 with the images message.

**Verify**: `pnpm test -- app/api/editor/uploads` → 4 pass

## Done criteria

- [ ] `pnpm test` exits 0, with at least 21 new tests
- [ ] `pnpm typecheck` exits 0, and `pnpm lint` reports 0 errors
- [ ] `git status` shows only the three test files

## STOP conditions

- A route cannot be imported in vitest even with mocks. Report the import
  chain.
- A tool's behaviour contradicts its description in `agent.ts`, for example
  `set_speed` not changing the duration. Write it as `it.todo` and report.

## Maintenance notes

New agent tools should come with a test in `agent.test.ts` in the same
change. The `describe("the basics tools")` block is the place to add them.

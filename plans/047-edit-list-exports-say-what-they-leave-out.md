# Plan 047: Edit-list exports keep the spine's timing and say what they leave out

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 80bdd94..HEAD -- lib/editor/interchange.ts lib/editor/basics.test.ts`
> If either changed, compare the excerpts below with the live code first. A
> mismatch is a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `80bdd94`, 2026-11-19

## Why this matters

`lib/editor/interchange.ts` writes the cut as a CMX3600 EDL and an FCPXML,
so it can be finished in another editor. The file header says effects,
captions, text and music are left out on purpose. Two other things are lost
without being said:

1. **Stills.** An image placed as b-roll is an `ImageElement` (`kind: "image"`).
   `overlayClips` keeps only `kind === "video"`, so stills vanish from both
   files.
2. **FCPXML overlays that do not start inside a spine clip.** Overlays are
   written only as clips connected to the spine clip they start in. One that
   starts after the spine's last clip, or in a hole in the spine, is dropped.
   Also, an FCPXML `<spine>` is sequential: items play one after another, and
   the `offset` attribute does not create a hole. If the spine has a gap,
   every later clip lands early.

Someone who opens the file elsewhere should either get the edit as it is, or
a plain statement of what is missing.

## Current state

- `lib/editor/interchange.ts:41-53`: `overlayClips(scene)` filters tracks of
  kind `video` or `broll`, excluding the spine and hidden tracks, then keeps
  elements with `kind === "video"`.
- `lib/editor/interchange.ts:55-59`: `spineClips(scene)` is the main track's
  video elements, in their order.
- `toEdl` builds `lines` and starts with `TITLE:` and `FCM:`. In CMX3600, a
  line that starts with `*` is a comment. The file already writes
  `* FROM CLIP NAME:`.
- `toFcpxml`, around lines 134-150, maps each spine clip to an `asset-clip`
  with connected overlays whose `startUs` falls in
  `[clip.startUs, clip.startUs + clip.durationUs)`.
- Tests: `lib/editor/basics.test.ts`, `describe("interchange")` and the
  "review fixes" block ("b-roll in EDL/FCPXML"). Use those fixtures.
- Convention: comments explain why, in full sentences. Never name other
  products or companies in code, comments or exported text. The format
  names "EDL" and "FCPXML" are fine, since they are already used.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Tests | `pnpm test -- lib/editor/basics.test.ts` | all pass |
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | 0 errors |

## Scope

**In scope**: `lib/editor/interchange.ts`, `lib/editor/basics.test.ts`.

**Out of scope**: adding stills to the EDL as events (CMX3600 has no still
concept worth relying on), exporting text or captions, and the export UI in
`components/editor/use-studio-tools.tsx`.

## Git workflow

Work on the branch you were given. Make one commit, for example
`Cuts: edit lists keep spine gaps and say what they leave out`. Do not push
unless told to.

## Steps

### Step 1: Count what is left out

Add `function leftOut(scene: Scene): { stills: number; unanchored: number }`.

- `stills` is the number of `kind === "image"` elements on visible non-spine
  `video`/`broll` tracks.
- `unanchored` is the number of overlay video clips that start outside every
  spine clip.

**Verify**: `pnpm typecheck` → exit 0

### Step 2: Say it in both files

- EDL: right after the `FCM:` line, when either count is above 0, add one
  comment line, for example
  `* NOT INCLUDED: 2 stills, 1 clip after the end of the main track`. Leave
  out a part whose count is 0.
- FCPXML: add the same sentence as an XML comment (`<!-- ... -->`) right
  after `<fcpxml version="1.10">`. Strip `--` from the sentence, because it is
  not allowed inside an XML comment.

**Verify**: `pnpm test -- lib/editor/basics.test.ts` → existing tests still pass

### Step 3: Keep spine gaps in FCPXML

While writing `body`, track the end of the previous spine clip. Start it at
0. When `clip.startUs > previousEnd`, emit
`<gap name="Gap" offset="${t(previousEnd)}" duration="${t(clip.startUs - previousEnd)}"/>`
before the clip. Overlays that start inside the gap stay counted in
`unanchored`. Do not try to connect them to the gap.

**Verify**: `pnpm typecheck` → exit 0

### Step 4: Tests (in the "interchange" describe)

1. A still on a b-roll track makes the EDL contain `* NOT INCLUDED: 1 still`,
   and makes the FCPXML contain `<!-- ` with the same words.
2. A scene with no stills and no unanchored clips has no `NOT INCLUDED` line.
3. A spine with a 2-second hole between clip 1 and clip 2 gives an FCPXML
   with exactly one `<gap ` element, whose duration is `2s` worth of frames
   (`60/30s` at 30 fps).

**Verify**: `pnpm test -- lib/editor/basics.test.ts` → all pass, 3 new tests

## Done criteria

- [ ] `pnpm typecheck` exits 0, and `pnpm lint` reports 0 errors
- [ ] `pnpm test` exits 0, with 3 new tests
- [ ] `git status` shows only the two in-scope files

## STOP conditions

- `ImageElement` is not `kind: "image"` (check `lib/editor/types.ts`).
- The existing FCPXML tests assert an exact full string that the new comment
  breaks in a way you cannot fix by updating the expectation in the same
  test. Report it.

## Maintenance notes

If stills are ever exported properly (an FCPXML asset with a still duration),
remove them from `leftOut` in the same change.

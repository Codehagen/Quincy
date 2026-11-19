# Plan 043: Restyling captions groups the words the same way from the panel and from the agent

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 80bdd94..HEAD -- lib/editor/presets.ts lib/editor/agent.ts components/editor/use-studio-tools.tsx lib/editor/correct-words.ts lib/editor/basics.test.ts lib/editor/agent.test.ts`
> If any of these files changed since this plan was written, compare the
> "Current state" excerpts against the live code first. A mismatch is a STOP
> condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `80bdd94`, 2026-11-19

## Why this matters

Captions are stored as caption *elements*, and each element is a group of
words shown together. Grouping is structural: the renderer shows one element
at a time and never reads `style.wordsPerSegment`. Some caption looks change
the grouping. The "bold" look shows one word at a time (`wordsPerSegment: 1`).
The studio panel handles this by rebuilding the caption elements. The agent's
`style_captions` tool only patches `style`. So when someone asks the agent for
bold captions, they get four-word groups whose style claims one word per
group, and the agent reports success. The two paths must produce the same
document for the same request.

## Current state

- `lib/editor/presets.ts:98-117`: `applyCaptionPreset(scene, key)` patches
  `style` on every caption element and nothing else.
- `lib/editor/presets.ts:120-131`: `needsRegroup(scene, key)` is true when the
  preset sets `wordsPerSegment` and the first caption element's
  `style.wordsPerSegment` differs.
- `components/editor/use-studio-tools.tsx:260-294`: the panel's
  `onCaptionPreset`. When a regroup is needed, it rebuilds:

  ```ts
  const words = captionWords(scene, clip.mediaId)
  if (words.length > 0) {
    commit(
      keepCorrections(
        scene,
        addCaptions(scene, words, {
          mediaId: clip.mediaId,
          author: "user",
          rules: 1,
          style: { ...first.style, ...preset.style },
        })
      )
    )
    return
  }
  ...
  commit(applyCaptionPreset(scene, key))
  ```

  `clip` is the first `VideoElement` on the spine (`findMainTrack(scene)`).
  `first` is the first caption element in the scene.
- `lib/editor/agent.ts:1045-1056`: the agent tool:

  ```ts
  style_captions: tool({
    ...
    execute: async ({ look }, options?: CallOptions) =>
      run(
        { toolCallId: options?.toolCallId, toolName: "style_captions" },
        (scene) => applyCaptionPreset(scene, look),
        () => `The captions are ${look} now.`,
        "There are no captions to style. Add them first."
      ),
  }),
  ```

- Helpers that already exist and must be reused, not copied:
  `captionWords(scene, mediaId)` and `keepCorrections(scene, ops)` in
  `lib/editor/correct-words.ts`, and `addCaptions(scene, words, options)` in
  `lib/editor/tools.ts`, which returns `EditOp[]`.
- Convention: pure scene functions in `lib/editor/*` return `EditOp[]`. UI
  and agent code only commit them. Comments are full sentences that explain
  *why*. Never name other products or companies in code or comments.

## Commands you will need

| Purpose   | Command                                   | Expected on success |
|-----------|-------------------------------------------|---------------------|
| Typecheck | `pnpm typecheck`                          | exit 0              |
| Tests     | `pnpm test -- lib/editor/basics.test.ts lib/editor/agent.test.ts` | all pass |
| Lint      | `pnpm lint`                               | exit 0, 0 errors    |

## Scope

**In scope**:
- `lib/editor/presets.ts`
- `components/editor/use-studio-tools.tsx` (only `onCaptionPreset`)
- `lib/editor/agent.ts` (only `style_captions`)
- `lib/editor/basics.test.ts`, `lib/editor/agent.test.ts`

**Out of scope**:
- Choosing which recording to caption when the spine holds several takes.
  That is a separate design question, so keep using the first spine clip's
  media exactly as today.
- `applyLookPreset`, transitions, and any other preset.

## Git workflow

- Work on the branch you were given. One commit, in the style of
  `git log --oneline -5`, for example
  `Cuts: the agent's caption looks regroup like the panel's`.
- Do not push unless told to.

## Steps

### Step 1: Add `restyleCaptions` to `lib/editor/presets.ts`

Add this function:

```ts
export function restyleCaptions(scene: Scene, key: CaptionPreset["key"], author: Author): EditOp[]
```

1. If `needsRegroup(scene, key)` is false, return `applyCaptionPreset(scene, key)`.
2. Otherwise, find the first spine video clip and the first caption element,
   the same way `onCaptionPreset` does today.
3. Compute `words = captionWords(scene, clip.mediaId)`. If it is empty, fall
   back to `applyCaptionPreset`.
4. Return
   `keepCorrections(scene, addCaptions(scene, words, { mediaId, author, rules: 1, style: { ...first.style, ...preset.style } }))`.

Import `addCaptions` from `./tools`. If that import creates a circular import
error at test time, see the STOP conditions.

**Verify**: `pnpm typecheck` → exit 0

### Step 2: Use it from both callers

- In `onCaptionPreset`, keep `setCaptionPreset(key)` and replace the rest of
  the body with `commit(restyleCaptions(scene, key, "user"))`.
- In `style_captions`, use `(scene) => restyleCaptions(scene, look, "agent")`.
- Remove imports that are now unused.

**Verify**: `pnpm typecheck && pnpm lint` → exit 0, 0 errors

### Step 3: Tests

- In `lib/editor/basics.test.ts`, `describe("presets")`, add
  "bold regroups to one word per caption and keeps a correction". Use the
  `scene()` fixture (one caption element of 30 words, token 4 is `"quinsy,"`).
  First correct token `t4` with `correctWords`. Then apply
  `restyleCaptions(base, "bold", "user")`. Expect the caption track to have 30
  elements and the text `"Quincy,"` to survive.
- Add "clean on clean only restyles". Applying the preset the captions
  already use should produce only `update_element` ops.
- In `lib/editor/agent.test.ts`, add "style_captions bold regroups". Build a
  harness, call `tools.add_captions` with the existing `WORDS`, then
  `tools.style_captions` with `{ look: "bold" }`. Expect every caption element
  to have exactly one token.

**Verify**: `pnpm test -- lib/editor/basics.test.ts lib/editor/agent.test.ts` → all pass, 3 new tests

## Test plan

These are the three tests in Step 3. Model them on the existing
`describe("presets")` block and the `harness()` and `call()` helpers in
`agent.test.ts`.

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits with 0 errors
- [ ] `pnpm test` exits 0, and the 3 new tests exist
- [ ] `grep -n "applyCaptionPreset" lib/editor/agent.ts components/editor/use-studio-tools.tsx` returns no matches
- [ ] `git status` shows only in-scope files changed

## STOP conditions

- Importing `./tools` from `presets.ts` causes a circular-import runtime
  error. Report it rather than moving functions between modules.
- `addCaptions` no longer accepts `rules` or `style`.
- The fixture's caption track is not found by id `"captions"`.

## Maintenance notes

- Any new caption look that changes grouping should go through
  `restyleCaptions` automatically. Review that `needsRegroup` still covers it.
- When per-recording captions are designed, `restyleCaptions` is the one
  place where "the first spine clip" has to change.

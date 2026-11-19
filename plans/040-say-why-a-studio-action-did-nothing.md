# Plan 040: Say why a studio action did nothing

> **Executor instructions**: Follow each step and verify it. On a STOP
> condition, stop and report. When done, update this plan's row in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat c17719c..HEAD -- components/editor/studio.tsx components/editor/studio-transcript.tsx`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (UX)
- **Planned at**: commit `c17719c`, 2026-11-19

## Why this matters

Three new studio actions fail silently. A press that does nothing reads as a
broken button:

1. **Clean sound** (`toggleVoice` in `components/editor/studio.tsx`, ~line
   1040). When `POST /api/editor/assets/[id]/voice` answers 402 (paywall), 429
   (cooldown, with a server-written `error` sentence), 422 (no sound) or 500,
   the code does `if (!response.ok) return` and the button just stops
   spinning.
2. **Restore** on a struck-through stretch, and **Remove N** in the clean-up
   review. Both call `commit(...)`. When the builder returns `[]` (for example
   because the stretch is now inside another clip), nothing changes and
   nothing is said.
3. The transcript panel's fetch of the recording's transcript
   (`/api/editor/assets/${id}/transcript`) fails silently. It is then fetched
   again on every reopen of the panel, because nothing records the failure.

## Current state

```ts
// components/editor/studio.tsx ~1046
if (!voiceUrls[mainMediaId] && !media[mainMediaId]?.voiceUrl) {
  setVoicePending(true)
  try {
    const response = await (harness?.fetch ?? fetch)(`/api/editor/assets/${mainMediaId}/voice`, { method: "POST" })
    if (!response.ok) return
    ...
```

How the codebase already shows a refusal: `components/editor/upload-drop.tsx`
renders the server's sentence in ink with `<Text variant="small"
role="alert">`, and links `/settings?section=plan` on 402. Its comment says
red is kept for destructive actions, and that a limit reached is not a
failure. Match that. Look for an existing toast or announcer in
`components/kit` (`announcer.tsx` exists). Use it if it fits a transient
message, and do not add a new dependency.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | 0 errors |
| Tests | `pnpm test` | all pass |

## Scope

**In scope**: `components/editor/studio.tsx`,
`components/editor/studio-transcript.tsx`, and a small pure helper plus its
test if you need one (e.g. `components/editor/refusal.ts`).

**Out of scope**: the API routes (their responses are already right), the
kit's components (use them, do not change them), styling outside these
components.

## Steps

### Step 1: A notice slot

Add `const [notice, setNotice] = React.useState<string | null>(null)` in
`Studio`. Render it through the kit's announcer if that suits a transient
line. Otherwise render it as a `role="status"` line in the transport area,
cleared after 4 s. Ink, not red.

### Step 2: Clean sound

On a non-OK response, read `{ error }` from the JSON and set the notice to it.
Fall back to "The sound could not be cleaned right now." On 402, include a
`/settings?section=plan` link, the way `upload-drop.tsx` does.

### Step 3: Restore and Remove

In `restoreCut` and `cleanUp`, when the built ops are empty, set the notice to
"That stretch could not be put back here." or "Nothing left to remove.". Do
not commit.

### Step 4: Transcript fetch

Store a failed fetch as `{ mediaId, words: null, failed: true }` so it is not
retried on every open. In the transcript panel, when it failed, show one muted
line under the header: "Cut words cannot be shown: the recording's transcript
did not load."

**Verify (all steps)**: `pnpm typecheck && pnpm lint && pnpm test` → exit 0.

### Step 5: Manual check

Run `pnpm dev` and open the mock studio (`app/prototypes/cuts-mock`). Point
the harness fetch at a 429 for `/voice` if the harness supports it. Confirm
the sentence appears and clears.

## Done criteria

- `grep -n "if (!response.ok) return" components/editor/studio.tsx` no
  longer matches inside `toggleVoice`.
- Typecheck, lint and tests pass.

## STOP conditions

- `toggleVoice`, `restoreCut` or `cleanUp` no longer exist as described.
- The kit has no way to show a transient, non-alarming message, and adding
  one would mean editing `components/kit`. Report back instead.

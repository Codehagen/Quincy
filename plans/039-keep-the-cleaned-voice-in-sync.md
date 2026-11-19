# Plan 039: Keep the cleaned voice in sync with the picture

> **Executor instructions**: Follow this plan step by step and verify each
> step. On a STOP condition, stop and report. When done, update this plan's
> row in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat c17719c..HEAD -- lib/editor/media.ts lib/editor/media.test.ts`

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW (changes a derived file's key; nothing stored is rewritten)
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `c17719c`, 2026-11-19

## Why this matters

With Clean sound on, the editor plays the video from the proxy and the sound
from a separate cleaned track. Both are read over the same source window in
microseconds (`components/editor/composition.tsx`, `Clip`). So the two files
must start at the same instant and keep the same clock. The proxy is encoded
with `-af aresample=async=1` (`lib/editor/media.ts`, `proxyArgs`). That
filter fills gaps and corrects drift against the timestamps, which phone
recordings with audio offsets and dropped packets need. The voice track is
not: `voiceCleanArgs` runs only `highpass,afftdn,loudnorm`. On a take where
the proxy needed that correction, the cleaned voice drifts or sits a fixed
offset from the lips. That looks like a broken edit, and only on the takes
that are hardest to debug. Confidence is medium: this follows from the
filters and has not been measured on a real phone file.

## Current state

`lib/editor/media.ts`:

```ts
export const VOICE_FILTER =
  "highpass=f=80,afftdn=nf=-25,loudnorm=I=-16:TP=-1.5:LRA=11"

export function voiceCleanArgs(input: string, output: string): string[] {
  return ["-i", input, "-vn", "-af", VOICE_FILTER, "-ac", "1", "-ar", "48000",
    "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "-y", output]
}
```

`proxyArgs` (same file) ends its audio options with `"-af", "aresample=async=1"`.

`storageKeys.voice` (same file): `` `derived/voice/v1/${contentHash}.m4a` ``. Its
comment says that a change to the filter is a new key.

`lib/editor/media.test.ts` asserts on argument arrays for the other builders.
Copy that style.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Tests | `pnpm vitest run lib/editor/media.test.ts` | all pass |
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | 0 errors |

## Scope

**In scope**: `lib/editor/media.ts`, `lib/editor/media.test.ts`,
`docs/video-ingest.md` (the "The cleaned voice" section names the filter and
the key).

**Out of scope**: `proxyArgs`, `audioExtractArgs` (the transcript's audio has
the same property, but changing it moves every word timing; that is a
separate decision), and the composition.

## Steps

### Step 1: Put the resampler first

Change `VOICE_FILTER` to start with `aresample=async=1:first_pts=0,`, followed
by the existing chain. `first_pts=0` pads a late-starting audio stream with
silence so sample 0 is source time 0, which is what the composition assumes.
Extend the comment above it with one sentence on why the resampler leads.

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Bump the key

Change `storageKeys.voice` to `derived/voice/v2/...`. A v1 track made with the
old filter must not be served as if it were in sync. Old objects stay where
they are and are simply no longer read.

**Verify**: `grep -n "derived/voice/v2" lib/editor/media.ts` → one match.

### Step 3: Tests

In `lib/editor/media.test.ts` add:
- `voiceCleanArgs("in", "out")` contains `-af`, and the value after it starts
  with `aresample=async=1:first_pts=0,` and ends with the `loudnorm` term.
- `storageKeys.voice("h")` equals `derived/voice/v2/h.m4a`.

**Verify**: `pnpm vitest run lib/editor/media.test.ts` → pass.

### Step 4: Docs

In `docs/video-ingest.md`, section "The cleaned voice", update the filter
string and the key to match.

**Verify**: `grep -n "v2" docs/video-ingest.md` shows the voice key.

### Step 5: Manual check (report the result; do not block on it)

If `ffmpeg` and a phone recording are available, run the proxy and voice
commands on it. Then compare `ffprobe -show_entries stream=start_time` on
both outputs. Their audio start times should match to within 1 ms.

## Done criteria

`pnpm typecheck && pnpm lint && pnpm test` → exit 0, and the new tests exist.

## STOP conditions

- `VOICE_FILTER` or `storageKeys.voice` no longer exist as quoted.
- Something other than the ingest step, the voice route and the page reads
  `derived/voice/v1` (`grep -rn "voice/v1" app lib components`). Report it.

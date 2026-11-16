# /cuts and /cuts/[id] — performance plan

Reviewed 2026-08-11.

## Finding 1 — the playhead re-renders the whole editor per frame (P1, effort M)

`components/editor/use-player.ts:87-89`: the Remotion `frameupdate` event
calls `setPlayheadUs` on every frame. That state is consumed by the Studio
root (`studio.tsx`, 1,182 lines), the entire timeline
(`studio-lanes.tsx`, 1,532 lines) and the transcript's word highlight
(`studio-transcript.tsx:140`, which recomputes the active word across all
words). During playback the heaviest component tree in the app re-renders
30–60 times per second. The hook already knows this is a hazard — it keeps
`playheadRef` precisely so callbacks do not rebuild per frame — but the
render path still pays it.

**Fix, in three parts (no behavior change):**

1. **Needle**: make `Playhead` (studio-lanes.tsx:513) self-subscribing —
   listen to `frameupdate` inside it and write `style.transform` via a ref.
   Per-frame motion never enters React.
2. **Word highlight**: derive a `currentWordIndex` that only calls setState
   when the *word* changes (a few Hz), not the frame. Compare against the
   previous index inside the frame handler before setting.
3. **Everything else** (`clipAtPlayhead`, split/zoom actions, the time
   readout): these are event-driven reads — take `playheadRef.current` at
   call time. Keep a coarse `playheadUs` state updated on pause/seek/scrub
   end for the parts that render from it at rest.

**Verify:** React DevTools profiler during playback — studio-lanes and the
transcript should be silent between word boundaries; the needle still moves
every frame; scrubbing, split-at-playhead, and caption highlight behave
identically.

**Implemented 2026-08-11.** `playheadUs` no longer exists as React state:
the player exposes `readPlayhead()`/`subscribePlayhead()`, the needle
(`LivePlayhead`) and the clock (`PlayheadClock`) write the DOM directly, the
transcript renders from a word-boundary `liveWordId`, and the effects panel
from a clip-boundary `clipAtPlayheadId` (both via `usePlayheadSelector`).
Deviation from the Verify step: this run had no browser to profile in, so
the verification was structural instead — after the change, zero render-path
consumers of a per-frame value remain (`grep playheadUs` finds none), which
is the property the profiler would have shown. Typecheck and 874 tests
green. Profile in DevTools on the next manual session to confirm by
observation.

## Finding 2 — resolveMedia is an N+1 on assets (P3, effort S)

`app/(app)/cuts/[id]/page.tsx`: one `getAsset` per media id, in parallel.
Parallel means wall time is one round trip, so this is cheap today — but it
is N queries and N pool connections for one page. Batch with a single
`inArray(videoAsset.id, mediaIds)` select filtered by userId, then sign URLs
per row. Do it when touching the file; not urgent.

## Explicitly fine — do not touch

- `@remotion/web-renderer` is already `await import(...)`ed only on export
  (`use-export.ts:77`) — the heavy renderer never loads for viewing/editing.
- `@remotion/player` is statically imported, and correctly so: it IS the
  editing surface; deferring it would delay the page's purpose.
- The /cuts list page imports only UploadDrop — no editor code on the list.
- Document + signed URLs resolved server-side in one pass (the page comment
  documents why) — keep.

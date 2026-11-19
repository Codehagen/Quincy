# Plan 052: A cold open that repeats the strong line

> **Executor instructions**: as in plan 049.
>
> **Drift check (run first)**:
> `git diff --stat 688a9e7..HEAD -- lib/editor/timeline.ts lib/editor/tools.ts lib/editor/hooks.ts`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MEDIUM
- **Depends on**: the hook templates (lib/editor/hooks.ts)
- **Category**: feature
- **Planned at**: commit `688a9e7`, 2026-11-19

## Why this matters

The hook templates open a cut on speech and put the hook on screen, but the
strongest opening in a vlog is often a flash-forward: the best line of the
take, played first, then the story from the start. Today that cannot be cut,
because the cut assumes each moment of a recording sits on the spine once.
`sourceToTimelineUs` returns the first clip that holds a source instant, and
`remapCaptions` builds every caption from it, so a repeated line would carry
its captions only at the front and lose them in the body. Pause tightening
(`cutSourceRanges`) and `restoreSpeech` make the same assumption.

## Steps

1. Give a spine clip an optional `repeatOf` (the id of the clip it repeats),
   and teach `sourceToTimelineUs` to take an element filter, so captions can
   be placed per clip rather than per source instant.
2. Build captions for a repeat from the words inside its own window, as
   their own caption elements, tagged with the clip they belong to.
3. Make `cutSourceRanges` and `restoreSpeech` skip clips that are repeats
   (a tighten acts on the body; the cold open is a deliberate copy).
4. Add `cold_open` as a hook option: insert a copy of the strong line's
   source range at the front, on a hard cut,
   then the hook text over it.
5. Tests: a repeated line keeps captions in both places; a tighten after a
   cold open leaves the copy alone; undo removes the copy in one step.

## Not in scope

Re-ordering whole sections of a take (story restructuring). That is a
different tool with a different gate question.

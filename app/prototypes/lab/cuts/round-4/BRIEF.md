# Cuts, round 4 — motion

## Picks

The owner kept **02, 06, 07, 09, 10, 12, 14, 16, 21, 22, 24, 30, 31, 32, 38,
40, 41, 43, 48** (2026-11-17). In his words:

> "Jeg liker at cursor faktisk gjør det slik at det ser ut som at Quincy
> faktisk gjør dette."

In English: he likes that the cursor makes it look as if Quincy is really
doing the edit. He asked for the motion to follow two sets of animation
rules: one about how moving parts relate to each other, and one about
motion in interfaces. Both are written out below as this round's rules.

From round 3 he kept 41 (the name-tag cursor), 43 (the highlighter at
speed) and 48 (three cuts in the desk). Discarded: 42, 44, 45, 46, 47. The
gate is still open (10 and 30 are kept, none of 44–46), so this round uses
30's behaviour: just go, with Stop and Esc always there. There are no gate
variants.

## The idea: the cursor operates the desk; it does not just touch it

Each op is done the way a person would do it, compressed:

- **A pause:** the cursor lands on the pause's left edge and drag-selects
  across it (the selection grows with the cursor, at the same speed). A ⌫
  key cap shows in its tag, and the pause closes.
- **The "um":** drag-select, ⌫, gone.
- **Captions:** the cursor clicks the real "+ Captions from the transcript"
  button. The button takes its own pressed state at the same instant, as
  it would for a pointer. In the last 40 ms of every glide, the target
  takes its hover.
- **The push-in:** drag-select the strong line, then click the Zoom control
  that appears over the selection.

**The contract holds.** Every gesture belongs to one tool part.
`input-available` starts the approach (glide, hover, selection);
`output-available` is the press (or ⌫) and the change. The press never
comes before the output. If the output arrives first, the press waits for
the gesture, so the change always lands with the press. The lanes, the
preview, the margin's ticks and the length all read what the cursor has
pressed (`round-4/director.ts`).

## Cast

- **Lead:** the cursor and its target, as one object at the press.
- **Support:** the margin's step line, the lane change (a gap closing), the
  length counter.
- **Decoration:** the press ring, the ⌫ cap.
- **Static:** the chat chrome, untouched lanes, and the preview frame until
  the change lands.

## Timeline per op

| Element | Role | Starts | Duration | Motion | Relationship |
| --- | --- | --- | --- | --- | --- |
| cursor glide | Lead | input-available | clamp(110 ms, distance / 4, 220 ms) | `translate`, cubic-bezier(0.23, 1, 0.32, 1); a transition, so a new target retargets | — |
| target hover | Support | glide end − 40 ms | 100 ms | opacity of a hover layer (the row-hover token) | Together with arrival |
| drag selection | Lead | glide end | 90–160 ms by width | `scale` X from the left edge (transform only), the selected tone | Carried by the cursor |
| press | Lead | output-available | 90 ms | arrow scale 1 → 0.92 → 1 | — |
| real button pressed | Support | press | 120 ms | scale 0.96 | Together with the press |
| ring / ⌫ cap | Decoration | press | 220 ms | ring: opacity + scale 0.6 → 1.4; cap: opacity only | Together with the press |
| gap closing | Support | press | 200 ms | the removed box leaves layout at once; the boxes after it `translate` in, ease-in-out | Together with the press |
| step tick + length | Support | press | none | the tick and the new number swap in place, tabular-nums | Lands with the press, not with the glide |
| next glide | Lead | press + gap | — | — | Overlaps: leaves while the ring is still out |

The gaps shrink through the run: about 140 ms after the first press, and
60 ms by the last; never uniform. The whole tighten run takes 2.5–3.5 s in
49 and about 2 s in 50 (49 runs every duration × 1.3, 50 × 0.95;
measured in the browser: 2.0 s at × 1).

**Captions are a wave, not N presses.** After the button press the caption
chips appear left to right, 25 ms apart, 300 ms at most, and the cursor
rides above the leading chip.

**End of the run.** The cursor parks: it moves about 24 px toward the
margin and fades out in 160 ms (the exit is faster than the entry). The
steps fold into the one summary line with one `grid-template-rows`
transition (200 ms, ease-in-out). The receipt and the checkpoint appear
with that fold, with no stagger. "Read-only while Quincy cuts" fades in
over 120 ms when the run starts, and out with the fold.

**Undo.** No cursor: the lanes revert as one crossfade, 150 ms.

**51, three cursors.** They never move in lockstep. They start 0, 90 and
170 ms apart, at slightly different paces (×1, ×1.08, ×0.94). The
recommended cut's cursor leads, with its name tag and its ring. The other
two support: a smaller tag ("B", "C"), no ring, 70% opacity. In the
self-check, the three frames appear together as one entrance (opacity and
a 4 px rise, 180 ms). The caption fix is then one press on the lead cut.

## Interruption and reduced motion

- Replay, Stop or Undo mid-run cancels every pending wait (the director
  bumps a generation, so nothing stacks), and the stream is aborted. Stop
  mid-glide retargets to the park, because the glide is a transition. An op
  whose input started but whose output never came stays visibly undone in
  the margin ("skipped").
- Your own pointer is never covered: everything Quincy draws takes no
  pointer events.
- Reduced motion: no cursor and no drag boxes. Targets change in order,
  60 ms apart, with an opacity-only highlight. The fold is instant.
- Only transform and opacity animate. The fold's `grid-template-rows` is the
  one exception, allowed for expansion. Every transition names its
  properties; none uses `transition-all`.

## Pieces

- **49** = 41 rebuilt to this choreography.
- **50** = 43 rebuilt to the same choreography at the faster pace, with the
  highlighter's yellow as the target tone.
- **51** = 48 rebuilt: three cuts in the desk, three cursors, as above.

## Shared fixes (rounds 2–3 benefit too)

- After a run, the starters are replaced by next steps: a request whose
  edits are all in the cut is never offered again.
- Pause labels sit in the ruler row, and a tick gives way to them, so they
  no longer overlap before the run.
- Trace lines wrap instead of truncating ("Tran…").
- The "Run undone · Redo" marker clears when a new message is sent.

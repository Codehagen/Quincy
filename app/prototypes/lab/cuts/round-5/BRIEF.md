# Cuts, round 5 — ready

## The owner's words

> "for motion gjør det du anbefaler. Jeg ønsker at vi skal gjøre dette klart
> nå."

In English: for the motion, do what was recommended. Make it ready now.

And on the clips: "Vi bør vel også ha det som på [a reference] at vi ser
bildene med waveform under". In English: we should see the frames with the
waveform under them.

## Decided

- **Cursor:** 49's ink name tag. 50's yellow is an optional target tone.
- **Gate (changed after 52 was shown):** Quincy edits without asking unless
  the change is very big. In the owner's words: "jeg ønsker at vi skal
  edite uten at de aksepterer hvis det ikke er veldig store ting" (edit
  without them accepting, unless it is very big). This replaces 46's "ask
  once per project".
  - Never ask on the first run, or for pauses, fillers, captions,
    push-ins, looks, fades or reframes.
  - Ask only when a run would remove more than 30% of the take's length, or
    remove whole spoken sentences (not fillers or pauses). The question
    says which of the two applies.
  - Stop and Esc are always there, and a run is still one undo.
  - In 52: "Tighten the edit" and "Add captions" go straight through.
    "Make it under 20 s" removes three sentences and 40% of the take, so it
    is the one that asks, and it says both reasons.
- **Several cuts:** 48/51's layout. One large preview of the recommended
  cut, three spines in the lanes panel, three cursors that never move in
  lockstep.

## Pieces

- **52 The cut, ready:** the whole first run with the decisions, plus a
  tune panel. The panel is harness chrome, top right: speed, glide min/max,
  press, the first and last gap, tone, ring, and Copy config. It writes the
  timing ref the director reads at every use, and CSS variables on the
  piece. It never re-renders the desk.
- **53 Three cuts, ready:** 51 with the same fixes.

## Fixes (in the shared round 4 code, so 49–51 have them too)

1. **Hydration.** The waveform's bars come from an integer hash and are
   rounded to two decimals; the filmstrip is fixed-decimal arithmetic.
   Server and client draw the same.
2. **The captions stayed in their lane but were invisible.** `Target` put
   `relative` before the caller's `absolute`, so the lane collapsed to zero
   height. A target now positions itself only from its caller's class.
3. **One scale.** Time → px is the lane over the cut's current length, so
   the ruler and the clips end together after every change.
4. **No slivers.** Speech on both sides of a removed box joins into one
   clip. A clip narrower than its label shows no label; its name is in its
   aria-label.
5. **One time on screen.** No badge on the picture. The header shows tenths
   (0:32.5), as the transport does, in tabular figures.
6. **The friend once.** It stays on the author line while Quincy works; a
   running step shows a still ring.
7. **The receipt in words only.** The numbers live once, on the run's
   summary line. "One run, one undo" is the checkpoint's job.
8. **Step rows are two columns:** the label wraps and the duration sits
   right, muted, in tabular figures.
9. **Next steps sit under the checkpoint;** the composer stays at the foot.
10. **Empty lanes are quiet:** no dashed border, a faint name.
11. **Nested radii derive:** the sample drop (18, inset 6) holds its card
    at 12, and the card (inset 6) holds its thumbnail at 6. The Zoom
    toolbar (12, inset 4) holds its button at 8. A clip's filmstrip and
    waveform are square-cornered, clipped by the clip's one radius.
12. **Depth from elevation:** the lanes panel and the sample card use
    `shadow-kit-*`. Borders stay only for separation and the drop target.
13. **One spacing scale in the margin:** gaps only. 4 between a step and its
    lines, 12 between groups, 20 between turns. The desk's left column
    aligns the lanes panel with the preview's left edge.

## The filmstrip

It follows the real editor's model (`components/editor/studio-parts.tsx`):

- Tiles are a fixed width (30 px) and keep their shape; a narrow clip shows
  fewer of them.
- Each tile shows the frame from the middle of its stretch of source; tiles
  in the push-in range show the pushed-in framing.
- The waveform is the clip's own slice of the source, in a 16 px strip under
  the 36 px of frames.

The lab has no frames, so a tile is the preview's grey founder, reframed a
little from second to second.

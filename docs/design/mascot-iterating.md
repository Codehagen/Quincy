# Mascot: how to change it

Steps for changing the friend without breaking it. Usage is mascot.md; the
beats each step must respect are mascot-timing.md. After every change run
`npx vitest run components/mascot` (231 tests on 2026-11-15) and look at
`/prototypes/mascot` at ¼× on both grounds.

## Edit a pixel frame

Frames are not typed out. `compose(eyes, sash)` in `engine.ts` cuts eye
glyphs out of `BODY` and paints the sash, so a frame is one line:
`f(compose({ glyph: LOW, dx: 1, dy: 1 }), 240)`.

Bitmap legend (`Bitmap`, 16 strings of 16): `.` empty, and an eye is a hole
that shows the ground · `#` ink, `currentColor` · `y` the sash yellow, the
same on both grounds · `k` keep-ink, ink on both grounds (a mark drawn on
the yellow). Glyph legend: `o` cuts a hole, a space leaves ink.

| To change | Edit | Unit |
| --- | --- | --- |
| an eye's shape | a glyph: `OPEN`, `HALF`, `SHUT`, `WIDE`, `LOW`, `HAPPY` | whole pixels |
| where it looks | `dx`, `dy` on the frame (both eyes move together) | whole pixels |
| the sash | `{ kind: "full" \| "dark" \| "in" \| "pen" }` | — |
| how long | the frame's `hold` | ms, integer, ≥ 50 |

The tests reject a frame that breaks the character. Each failure is a rule,
not a nuisance; fix the frame, never the test:

- the silhouette outside the sash rows (9–11) differs from `MARK`: the body moved;
- a hole outside x 3–12, y 2–7: an eye left the face;
- two consecutive frames are equal: that is one frame with a longer hold;
- `k` outside `found` and `writing`, or off the sash rows.

**Idle's first frame is the mark.** `MARK` is `idle.frames[0]`, and the test
"idle's first frame is the mark the owner chose" holds it to lab piece 31
(`LAB_31` in `engine.test.ts`). Changing it changes the favicon, the app icon
and the lockup. That is the owner's call: change `LAB_31` only after he has
said yes, then regenerate the icons (below).

## Add a state, end to end

A state needs a product moment first (a row in mascot.md's table). A face
with no moment behind it is decoration, and mascot.md forbids it.

1. **Name it.** Add it to `MascotState` in `engine.ts`. `STATES`, `SMOOTH`
   and the board's `MEANING` are `Record<MascotState, …>`, so the build
   fails until each has it. That is the checklist.
2. **Pixel.** Write a `StateDef`: `play` `loop` | `once`; a one-shot that
   passes gets `then: "idle"`, one that holds has no `then` (only `stuck`).
   Frames from `compose` and `f`. Add it to `STATES`; its place there is its
   place on the board.
3. **Smooth.** Write a `SmoothDef` in `smooth.ts`: one key per pixel frame
   start, at the same ms, with a time constant from the closed set; `still`
   (the reduced-motion moment); `from` for a one-shot. Add it to `SMOOTH`.
4. **Tests.** The `it.each` checks cover the new state on their own. Add a
   beat test under "the beats match the pixel engine" (`smooth.test.ts`) and,
   if the state has a signature move, a pixel test in `engine.test.ts`.
5. **Board.** Write its `MEANING` line in `app/prototypes/mascot/board.tsx`,
   in product words.
6. **Docs.** A row in mascot.md (table and flowchart) and mascot-timing.md.

## Change the favicon and app icon

```
npx tsx scripts/mascot-icons.ts
```

It writes two files from `MARK`; never edit either by hand:

- `app/icon.svg` — `iconSvg()`: crisp 16-grid paths; ink is `#111110`, and
  `#F2F2F1` under `prefers-color-scheme: dark`, because a tab has no
  `currentColor`. A test fails if the file drifts from the engine.
- `app/apple-icon.png` — 180×180, 10px per grid pixel, 10px margin, on
  paper: iOS paints a transparent icon black. Nothing tests this file, so
  run the script after any change to `MARK` or `HEX`.

`app/favicon.ico` is gone on purpose. Next serves it as `/favicon.ico`
beside `icon.svg`, it held the old mark, and the script has no ICO encoder,
so it would be a second icon that never follows the engine. Do not add one.

`HEX` in `engine.ts` holds the sRGB of four kit primitives (`--kit-gray-178`,
`-961`, `-994`, `--kit-yellow-910`) for files that cannot read a variable.
If one moves in `app/globals.css`, update `HEX` and rerun the script.

## Export from the board

Each state's row on `/prototypes/mascot` has SVG, PNG and GIF. Pause and set
¼× to land on a frame; Replay restarts a one-shot.

| Button | What | Size | Ground |
| --- | --- | --- | --- |
| SVG | the pixel frame on screen (`toSvg`) | 256, crispEdges | transparent |
| PNG | the same frame | 256 (16px per grid pixel) | transparent |
| GIF | the whole state, holds as delays (rounded to 10ms) | 128 (8px per grid pixel) | transparent; loops if the state loops |

Exports are the pixel drawing in light-ground ink. On a dark ground the ink
vanishes: export for paper, or paint the ground first. The smooth drawing
has no export; a still of it is a screenshot of the board at 128.

## Never borrow another company's avatar design

Every feature of the friend comes from Quincy's own materials: the page it
writes on, the highlighter, the editor's pen. Never take a shape, an eye
style, a blink or a gesture from another product's character, and never
name one in the repo. Why: the friend is the product's face in a tab, on a
phone and beside every send. A borrowed face makes Quincy read as a copy of
that product to anyone who knows it, and it is not ours to ship. Landing
lab pieces 05, 10 and 30 drew Quincy as a small ink blob, after a
reference's dotted-eye avatar. The owner kept the idea of a small character
and replaced the blob in round 3 with icon piece 31, drawn from the page
and the sash (decisions.md).

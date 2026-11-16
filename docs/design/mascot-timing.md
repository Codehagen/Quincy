# Mascot: the timing contract

How the two drawings stay one character. Read it before you change a hold,
a key or a still pose. Usage is mascot.md; the steps to change things are
mascot-iterating.md.

## The contract

The pixel engine (`engine.ts`) owns time. Every state is a list of whole
frames with a `hold` in ms; `duration(state)` is their sum. The smooth engine
(`smooth.ts`) owns shape and borrows the time:

- **Same length.** `smoothDuration(s)` is `duration(s)`, by construction. A
  smooth state never has its own length.
- **Same beats.** Every smooth key starts at the time its pixel frame starts:
  a blink key at 2800 because the pixel blink frame starts at 2800.
- **Same hand-over.** `locate` and `locateSmooth` hand a one-shot over to its
  `then` at the same ms and carry the remaining time into the next state.
- Why: `Friend` swaps drawings at 32px. If the beats differed, resizing a
  window would change what a state says and when it says it.

`smooth.test.ts` "the beats match the pixel engine" holds this per state.
Change a pixel `hold` and the smooth test for that state fails until the
smooth key moves with it. That failure is the contract working.

## Per state

| State | Pixel: frames · pass | Smooth beats (ms into the state) |
| --- | --- | --- |
| `idle` | 13 · 12.6s loop | blink at 2800 and 8200; gaze 1 left 5000–6400, 1 right 10800–12000 |
| `listening` | 5 · 4.6s loop | eyes 1 up; blink at 2600 |
| `reading` | 10 · 2.5s loop | 3 lines × 3 saccades (0, 240, 480 into each 800ms line); shut at 2400 |
| `found` | 5 · 1.02s once → idle | eyes 4 tall, sash lifts 0.5 and tilts −2°; flash at 90 and 250 (70ms each); settles from 600 |
| `writing` | 16 · 2.27s loop | nib 90ms per column, 160ms over a gap (lifted); eyes follow at columns 6 and 11; nib lifts at 1470; words clear at 2070 |
| `waiting` | 9 · 4.88s loop | glance 2 right, 1 down at 1600; back at 2590; blink at 4080 |
| `sent` | 3 · 1.12s once → idle | eyes bend into carets (τ 50); shut at 1000; ⅔ open at 1060 |
| `resting` | 2 · 4.8s loop | eyes shut; tails draw in 1 unit at 2600, out at the loop (τ 500) |
| `stuck` | 1 · held | eyes ⅔ open, 2 left, 1 down; no motion |

Geometry, in units of the 16 box: the page is x 2–14, y 1–15, corners 3; the
eyes are 2×3 holes at x 5–7 and 9–11, y 4–7; the sash is y 9–12, edge to
edge. An eye may sit only inside `EYE_BOX` (x 3–13, y 2–8), one unit in from
the body and above the sash.

## How each drawing moves

- **Pixel: whole frames, cut.** No tweening, easing or opacity. A frame is
  on screen for its `hold` and then the next one is. A hold is a whole ms and
  at least 50 (a test): under 50ms a frame is a flicker, not a pose.
- **Smooth: eased, never bounced.** Each key sends some channels (an eye's
  x, its lid, the sash's lift) toward a value with an exponential ease-out of
  time constant `tau`, or a linear move over `linear` ms (the pen only). No
  overshoot, no spring: a bounce is the body moving, and the body never does.
- **Channels are independent.** An eye can blink while it travels. Each
  channel leaves from where it is, so a key that lands mid-move never jumps.
  `smooth.test.ts` "never jumps" samples every 5ms through two passes.
- **The time constants are a closed set** (`smooth.ts`): `CLOSE` 22 (a lid
  shutting), `REOPEN` 40, `SACCADE` 45, `GLANCE` 70, `SETTLE` 120. A lid
  closes faster than it opens; that asymmetry is what reads as a blink. Add
  a constant only with a reason a reader would notice.
- **A change of state blends** from the pose on screen to the new state over
  `BLEND_TAU` 90ms (`smooth-friend.tsx`). The pen and its words cut.

## Reduced motion

| Drawing | Holds | Why |
| --- | --- | --- |
| Pixel | the state's first frame | frame 0 is drawn to be the state's face |
| Smooth | `stillPose(state)`, at `SMOOTH[state].still` ms | the most telling moment: found 500 (wide eyes), writing 1300 (half-written line), waiting 2200 (the glance), sent 500 (carets); the rest 0 |

A one-shot under reduced motion still cuts to `idle` once, when it would have
ended. Without that cut, `found` would claim new ideas for good.

## The engines are pure

`sample(state, t)` and `sampleSmooth(state, t)` read only their arguments.
Never `Date.now()`, never module state in `engine.ts` or `smooth.ts`. The
clock belongs to the renderer (rAF, capped at a 250ms step). Purity is what
makes `frozenAt`, the board's one clock, the exports and DOM-less tests
possible. `SmoothFriend` writes its paths to the DOM from rAF instead of
re-rendering React every frame; `PixelFriend` re-renders only when the frame
index changes.

# The lab

A numbered grid for deciding a look from zero. The agent makes many pieces,
the owner keeps few, and the next round is made from only what was kept.
What the labs decided is recorded in `docs/design/decisions.md`; read it
before starting a round, so a settled question is not asked again.

## When not to lab

```
What kind of question is it?
 ├── Already decided (decisions.md, a plan)        → build it; no lab
 ├── An open question with 2–3 clear options       → 3 variants behind a picker
 │     on one prototype route (app/prototypes/<page>/harness.tsx and
 │     picker.css)
 └── The direction itself is unknown               → a lab round of 20
```

A lab round costs 20 pieces and an afternoon of looking. Spend it only when
nobody can yet name the options.

A new direction for a surface always starts here, never as a build, and a
reference gives one idea carried by something Quincy owns, never its layout
(`docs/design/decisions.md`, top).

## The tracks

Each track is a route, a `rounds.ts` and its own picks, so a tick in one never
shows in another.

| Track | Route | Rounds | Picks key | Each piece |
| --- | --- | --- | --- | --- |
| visual style | `/prototypes/lab` | `rounds.ts`, `round-N/<group>/` | `quincy-lab-picks` | one surface in a 4:3 frame |
| icons | `/prototypes/lab/icons` | `icons/rounds.ts`, `icons/round-N/<group>/` | `quincy-lab-icons-picks` | a mark on `icons/sheet.tsx`: large, 32, 16, a tab, light and dark, an app icon |
| landing | `/prototypes/lab/landing` | `landing/rounds.ts`, `landing/round-N/` | `quincy-lab-landing-picks` | a hero or a whole page, scaled into the frame |
| cuts | `/prototypes/lab/cuts` | `cuts/rounds.ts`, `cuts/round-N/<group>/` | `quincy-lab-cuts-picks` | an editor surface or a decisive part of one, at 960×720 on the kit, scaled into the frame |

## The loop

1. The agent makes the round (20 pieces in four groups of five, unless the
   brief says otherwise).
2. The owner ticks pieces and presses **Copy picks**. It copies one line,
   `Keep: 03, 07, 12`, and falls back to a prompt when the clipboard is
   blocked. Picks persist per track in `localStorage` (memory only in a
   private window).
3. He pastes the line into the chat, with his reasons if he has them. Write
   the reasons into the next brief in his words: they are the only record of
   why.
4. The next round is made from only the kept pieces: keep what they share,
   drop everything not picked. Earlier rounds stay on the page.
5. When the style holds, write it down: a plan (`plans/029` is the shape),
   then `docs/design/decisions.md`, with what lost and why.

## Add a round

1. **Brief.** `round-N/BRIEF.md`, after `round-2/BRIEF.md`: the picks and the
   owner's words; what the kept pieces share (keep all of it); what was
   discarded (leave it out, with numbers); the round's asks, one line per
   group with its number range. When groups must agree on values, add a
   shared kit beside it (`round-2/KIT.md`, `round-2/kit.tsx`,
   `round-2/tokens.ts`).
2. **Pieces.** `round-N/<group>/NN-slug.tsx`, one component each. Groups are
   folders `a`, `b`, `c`, `d`; a round of one direction may be flat
   (`landing/round-3/`).
3. **Index.** Each group's `index.ts` exports `pieces: Piece[]` (`types.ts`):
   `n`, `title`, `take` (what it took and where it pushed, one sentence),
   `Component`. Order is display order.
4. **Register.** Add the round to the track's `rounds.ts`, newest first:
   `id`, `title` ("Round 3 — narrow"), `note` (made from which picks, the
   groups and their ranges, the brief's path), `pieces` sorted by `n`.

**Numbers are permanent.** `n` continues from the track's last piece and a
discarded number is never reused: the owner says numbers out loud ("keep 04
and 17"), and a reused number makes an old pick point at a new piece.

## Rules for a piece

- **Owns its whole 4:3 frame**, background included.
- **What it may inherit depends on the track's stage.** Visual round 1
  inherited nothing from `components/` or the app's tokens; finding a new
  system was the point. Visual round 2 used its own shared kit. Icon pieces
  use the sheet and the kit primitives as hex values. Landing pieces came
  after the kit was decided, so they build from `@/components/kit`,
  `@/components/showcase` and `@/components/mascot`. Cuts pieces are app
  surfaces, so they build from the kit and the mascot, and share one
  fixture and one drawing in `cuts/round-1/fixture.ts` and `parts.tsx`.
- **One accent colour per piece.** Everything else is neutral.
- **Real Quincy subjects**: a voice note becoming ideas, a draft, a number
  against your own baseline, the week, Approve. Never lorem.
- **Motion**: CSS transitions that name their properties for state,
  keyframes only for one-shots and loops, and a `prefers-reduced-motion` path.
- **No other product's names** in a piece, a take or a note. Describe a
  reference by what it does ("a SaaS landing with inline chips").

## Scaling a landing piece into the frame

A page is designed at 1200px; the frame is a 4:3 tile. Two patterns, both
hidden until the first measure so a piece never paints at full size and jumps:

| Helper | Use | How |
| --- | --- | --- |
| `landing/round-1/a/canvas.tsx` | a hero, seen whole | designed at 1200×900; `scale = min(w/1200, h/900)` |
| `landing/round-2/a/sheet.tsx`, `landing/round-2/b/scroll.tsx` | a whole page | 1200 wide, any height; CSS `zoom = w/1200`; the frame scrolls |

Use `zoom`, not a transform, for a page: the zoomed page keeps its real
scroll height, so in-view reveals fire as the reader scrolls inside the
frame. The icon sheet does the opposite: fixed 560×420, it scales down on a
phone and never up, so 16 and 32 stay real pixels.

## Fonts

Load each Google font once in the whole app, then import it from there.
Turbopack fails the build when the same font is loaded from two modules with
different options. Inter and Caveat live in `fonts.ts` at the lab root and
every group re-exports them. A face only one group uses (Newsreader and
Instrument Serif in `landing/round-1/a/fonts.ts`, Literata in
`landing/round-1/c/fonts.ts`) may load in that group; the moment a second
module needs it, move it to the root `fonts.ts`.

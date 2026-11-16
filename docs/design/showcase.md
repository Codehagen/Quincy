# Showcase

Faux product UI for the landing page and docs, ported from Stageshow (MIT,
`components/showcase/NOTICE.md`). It draws pictures *of* Quincy: a scripted
stage, a cursor, window and phone frames, feature cards, a bento grid. Every
`--ss-*` token points at a `--kit-*` token (`theme.css`), so a picture and the
app it advertises share one ground and one ink.

**Being rebuilt (2026-11-16).** The pictures still paint Approve in the old
blue (`--kit-action`), and their buttons are spans. The app's action is now
the ink pill. Plan 029 (revision, step 3) rebuilds the pictures from the
real kit components, so a picture of Approve is the app's Approve. Until
then, do not copy a picture's colours into the app, and do not add new
`--kit-action` reads to a picture.

## The one rule

**Showcase is for marketing and docs pages only. Never inside the real app.**
The app is built from `components/kit`. A product screen made of showcase
parts is a picture of a product: its buttons are spans, its text is filler,
its cursor is scripted.

The two systems share names on purpose (Stageshow's), so check the import:

| Name | In the app | In a marketing picture |
| --- | --- | --- |
| `Stage` | `@/components/kit` (grey frame, lead, one object) | `@/components/showcase` (scaled canvas that runs a script) |
| `Window` | kit (`address`, one per view) | showcase (`url` / `title` / `sidebar`, chrome kinds) |
| `Text`, `Button`, `Count` | kit | showcase (`Text` turns into a bar at low fidelity; `Button` is a `span`) |

A file under `app/` that is not a marketing or docs route never imports
`@/components/showcase`. Render showcase pictures inside `<KitRoot>` so
Inter and Caveat resolve.

## Which frame

```
What does the picture show?
 ├── A screen of the product on a desktop          → Window inside a showcase Stage
 ├── Something that happens on the phone (recording, a notification) → Phone
 ├── One claim with one picture                     → FeatureCard
 ├── Four to six claims as one picture              → Bento of Tiles
 └── A number or a statement with no UI             → a type Tile (no picture)
```

- **Window** — browser chrome with `url="hirequincy.com/…"`, or an app window
  with `title` / `sidebar`. One per picture; a second window only `receded`.
  `chrome` stays `native` (the kit's three quiet dots); never `lights="color"`.
- **Phone** — `width`, `frame` `pro` (default) | `bezel` | `soft` | `bare` …,
  `time`, `dark`, `wallpaper`; `LockScreen` and `Notification` inside. Use
  `pro`; `photo` needs a bezel image nobody has supplied.
- **FeatureCard** — `lead` (one sentence), `rest`, `height` (default 420),
  `children` (one showcase Stage, width from `usePictureWidth`). The copy is
  page text above the picture; the picture pins to the bottom edge and is
  cropped by it.
- **Bento** + **Tile** — `Tile` takes `area`, `lead`, `rest`, `picture`,
  `pictureFit` `edge` | `center`. Each picture is its own Stage at 1:1, never
  one Stage around the grid (it would scale every tile's type down with it).
  Two of five tiles show product UI at most; only one has window chrome.

Bento is a marketing layout. Inside the app, bento splits were discarded
(lab 12, 14): one stage, one object.

## The Stageshow rules

- **Simplified.** Real words only on what the story is about; everything else
  is `Bar` or `Text filler`. The picture is a calmer version of the product,
  not a screenshot.
- **Framed.** The product sits low and is cut by the frame (a corner or a
  bottom bleed), the way kit Cards crop. Never a product floating whole in
  the middle, except with `unframed` when a page asks for it.
- **Every motion has a cause.** A cursor presses Approve, then the draft
  flies into Thursday. When the system acts on its own (the median card),
  the cause is the story's first line, and there is no cursor.
- **Data never rewinds in view.** `play="once"`: it plays when first seen and
  holds its ending. A loop that drains a number back to zero in front of the
  reader says the result was fake. To show it again, remount it with an
  explicit Replay button (`app/prototypes/showcase/replay.tsx`): the click is
  the cause of the return. `Stage` plays once by default and has no `loop`
  mode; `hover` is the only other value.
- **Reduced motion shows the poster frame.** Every scripted Stage passes a
  `poster`: the held ending, with every beat on screen. Under reduced motion
  (and with no script) the Stage shows it and runs nothing. The poster is
  also what a thumbnail should show, so it must tell the whole story alone.
- **No second colour system.** Never pass `accent`, `ground`, `tokens`,
  `theme` other than `light`, `greys="cool"` or `palette`: they are
  Stageshow's look switches, and each one is a second colour system next to
  the kit's.
- **Quincy's marks.** `Note` (graphite Caveat, optional 1px leader) and
  `BeatMark` (the pen) are the showcase's annotations. Same limits as
  editor-marks.md: one relationship per mark, it arrives with its cause and
  never covers the result it explains. On one marketing page, marks sit on
  two or three pictures, never all: a mark says "this one", and on every
  picture none of them is (decisions.md).

```tsx
// Correct — plays once, holds, poster is the ending
<Stage<S> width={width} height={300} initial={initial} poster={POSTER} play="once" script={script}>
  {(s) => <Window url="hirequincy.com/studio">…</Window>}
</Stage>

// Incorrect — no poster: reduced-motion readers and crawlers get the empty opening frame
<Stage<S> width={width} height={300} initial={initial} script={script}>…</Stage>
```

```tsx
// Correct — the app uses the kit
import { Window } from "@/components/kit"

// Incorrect — a marketing frame inside a product page
import { Window } from "@/components/showcase"
```

## The demos

`components/showcase/demos/` holds the finished pictures: the hero, the
thread, the stills, the feature cards and the bento. Which one tells which
story, the motion rules they share, and the copy-leak rule for screen-reader
text are in showcase-demos.md.

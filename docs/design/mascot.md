# Mascot: the friend

The friend is Quincy's face: a soft-cornered page with two eyes, wearing the
highlighter as a sash that runs past both sides. One character, two drawings,
nine states, one set of beats. Code: `components/mascot/`. Live board, both
drawings side by side on one clock: `/prototypes/mascot`.

To change the character (a frame, a state, the favicon, an export), read
mascot-iterating.md. For the beats per state and the reduced-motion poses,
mascot-timing.md.

## Which component

Use `Friend` from `@/components/mascot` for the character, everywhere. Use
`QuincyMark` (friend + "Quincy" in Inter 560) wherever the product names
itself: the marketing header (`components/marketing/header.tsx`), a
sign-in page.

`Friend` picks the drawing from `size` (`SMOOTH_FROM = 32`, `friend.tsx`):

```
How big is the box?
 ├── under 32px → PixelFriend: the 16×16 bitmap, whole frames, cut
 └── 32px and up → SmoothFriend: vectors, eased keys, the same beats
```

- **Never import `PixelFriend` or `SmoothFriend` at a call site.** A call
  site that names a drawing keeps it when its size changes: a 20px rail
  grown to 40 stays a blurred 16-grid bitmap. Three places are allowed to:
  `lockup.tsx` (the lockup is the pixel friend at both sizes, lab 38),
  the board at `/prototypes/mascot` (it compares the drawings), and the
  icon pipeline, which reads the engine (`MARK`, `iconSvg`), not a component.
- `render="pixel" | "smooth"` exists for the board. A product call site
  never passes it.
- Lab pieces under `app/prototypes/lab/landing/round-3/` use `PixelFriend`
  at 48 and 64. They predate `Friend` and are frozen records. Never copy a
  call from them.

Props (both drawings): `state` (default `idle`), `size` in px (default 32),
`paused`, `frozenAt` (ms into the state, no clock), `speed` (board only),
`label`, `className`. `QuincyMark`: `size` `sm` (friend 16, 14px type) | `md`
(friend 32, 28px type), `state`, `still`.

- **Pixel size snaps.** It draws at the largest multiple of 16 that fits and
  centres in the box: at 20 it draws 16 with 2px around it. Ask for 16 under
  32. Smooth fills any box.
- **Decorative by default** (`aria-hidden`). Pass `label` only when nothing
  beside it names Quincy; then it is `role="img"`. Never announce the state.
- **Ink is `currentColor`.** Set it with `text-kit-ink` on the friend or a
  parent. The sash (`--kit-mascot-sash`) and the pen (`--kit-mascot-keep`)
  are the same on both grounds; the eyes are holes and show the ground.
- **The mark as an icon is frozen.** A favicon, an app-icon tile, a
  notification's icon: `frozenAt={0}`. Icons do not blink, and a frozen
  mark is the logo, not the character.

## The nine states

| State | Means | Product moment | Where used today |
| --- | --- | --- | --- |
| `idle` | nothing is running | every resting mark | sidebar (`components/quincy/shell/app-sidebar.tsx`), `QuincyMark`, `median-picture.tsx` |
| `listening` | a recording is on | beside the recorder while it records | nowhere yet |
| `reading` | Quincy works through material | where the ideas will land, beside the LiveDot line | `reads-and-posts.tsx`, `desk-and-pocket.tsx` (wide) |
| `found` | ideas just arrived (once → idle) | the moment ideas arrive | `quincy-texts.tsx` note 1, `ideas-picture.tsx` |
| `writing` | a draft is streaming | while a draft streams in | `quincy-texts.tsx` typing dots |
| `waiting` | a draft waits for Approve | a ready DraftCard | `quincy-texts.tsx` note 2, `held-picture.tsx`, `desk-and-pocket.tsx` (compact), `never-list.tsx` |
| `sent` | you approved it (once → idle) | right after Approve | `quincy-texts.tsx` note 3 |
| `resting` | quiet hours | outside the rhythm's hours | the marketing home's last section, "Quiet until there is something." |
| `stuck` | it failed or refused | beside a refusal or failure (states.md) | nowhere yet |

```
What is Quincy doing that the person can see the result of?
 ├── Recording                       → listening
 ├── Working on material             → reading (with the LiveDot line, never instead of it)
 ├── Ideas just arrived              → found, once
 ├── A draft is streaming            → writing
 ├── A draft is ready, unapproved    → waiting
 ├── The person just pressed Approve → sent, once
 ├── Outside the rhythm's hours      → resting
 ├── It failed or refused            → stuck
 └── None of these                   → idle
```

## Rules

- **A state must mean something, never decoration.** The friend shows the
  state; a sentence beside it says it. A state with no sentence or no
  product moment behind it teaches the reader that the eyes mean nothing,
  and then `stuck` beside a failure means nothing either.
- **The friend may appear more than once on a page; the limit is one
  friend per object.** One card, one picture, one window: one face. The
  sidebar's mark, an EmptyState and a reply beside each other are three
  objects and three friends. A frozen icon does not count.
  Why: two friends in one object read as two characters, but a friend in
  every object reads as one character that is everywhere, which is the
  point.
  <!-- 2026-11-15: "Jeg liker speiselt godt at figurene er overalt" -->
- **The body never moves.** Life is blinks, gaze and the sash. No bob,
  bounce or scale: a bobbing page reads as a toy, and a test holds every
  frame's silhouette to the mark (`engine.test.ts`, `smooth.test.ts`).
- **One-shots hand back to idle.** `found` and `sent` play once and the
  engine carries the time on into `idle`. Set `state` back when the event
  passes; never hold `found` on screen.
- **Loops are the second motion exception** after `LiveDot pulse`
  (motion.md), for the same reason: a state that lasts. They are slow (a
  change every 1–3s at rest) and hold a pose under reduced motion.

```tsx
// Correct — the state comes from the event, at 32 the size picks smooth
// (components/showcase/demos/quincy-texts.tsx)
<span className="grid size-11 place-items-center rounded-full bg-kit-ink text-kit-ground">
  <Friend state={state} size={32} />
</span>

// Incorrect — a drawing named at the call site (what the old sidebar did; components/quincy/shell/app-sidebar.tsx now uses QuincyMark):
// if the rail ever grows past 32, it stays a 16-grid bitmap
<PixelFriend state="idle" size={20} />

// Incorrect — a state as decoration, announced twice
<Friend state="found" size={50} label="Quincy found an idea" />
<Text>Quincy found an idea</Text>
```

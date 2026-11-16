# Motion

Motion the person causes. Press Approve and the post moves into the week;
record and the riff card rises in; a rule slides into the brain. Every motion
has a cause the person made. Nothing moves on a timer, on load for its own
sake, or in a loop.

**Motion is held to an iOS-native bar: arrivals push up and settle. When
asked for "better animation", change only the motion — never the content or
the component.**
Why: the owner judges motion against Apple's own apps. A request about
motion is about how a thing moves; rewriting what moves answers a question
nobody asked and loses the version that was approved.
<!-- 2026-11-15: "Slik som denne ser jo ikke ut som apple" / "Jeg mente bare at du skulle gjøre animation bedre på det som var" -->

## Durations and curves

Closed set. Name them by token, never as numbers in a class.

| Token | ms | For |
| --- | --- | --- |
| `--kit-duration-press` | 140 | press, to `--kit-press-scale` (0.96) |
| `--kit-duration-state` | 200 | hover, colour, dim, a tab swap |
| `--kit-duration-shift` | 220 | rows trading places (Reorderable, FLIP) |
| `--kit-duration-enter` | 320 | something arrives (Arrive, a margin note) |
| `--kit-duration-travel` | 520 | an object crossing the surface (a draft into its slot) |
| `--kit-duration-sweep` | 700 | the highlighter |
| `--kit-delay-note` | 620 | a note waits for the sweep under it |

| Curve | Value | For |
| --- | --- | --- |
| `ease-kit-out` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | enters, sweeps, presses, state. The default |
| `ease-kit-move` | `cubic-bezier(0.45, 0, 0.2, 1)` | travel only: slow start, soft landing |

```
What is moving?
 ├── A control under the finger         → press, ease-kit-out (Button does it)
 ├── A colour or opacity changing state → state, ease-kit-out
 ├── Something appearing because of an action → Arrive (enter, ease-kit-out)
 ├── An object moving from A to B       → travel, ease-kit-move
 └── Nothing caused it                  → nothing moves
```

## Rules

- **Transitions for state, keyframes only for one-shots.** A transition
  retargets when the person reverses it (Undo mid-way); a keyframe restarts.
  `Highlight`, `MarginNote` and `Arrive` are all transitions for this reason.
- **Name the properties.** `transition-[opacity,translate]`, never
  `transition-all`, which animates layout you did not mean to move.
- **Every motion has a reduced-motion path.** Kit components carry
  `motion-reduce:transition-none` and land in their end state. Write the same
  on anything you add. Use `useReducedMotion()` only for motion driven from JS,
  or for logic that waits on a transition reduced motion removes.
- **No loops, no autoplay demos.** The discarded pieces 06, 09 and 10 waited
  for a loop before anything happened. The one exception is
  `<LiveDot pulse>`: a ring leaves the dot every 1.8s while something is
  actively happening (recording, publishing), because "running" is a state
  that lasts. A standing state ("Rhythm on") is a still dot. Under reduced
  motion the ring is gone and the dot stays.
- **A number that changes counts.** `Count` runs 320ms from the old value to
  the new one, so a change the person caused reads as caused.
- **In view, once.** `useInView` fires at 40% visible, once by default. 35%
  fired on a sliver.

## Arrive

Use when the person caused something to appear or go: an action swapping for
its consequence, a row joining the list after a recording, a dismissed item
folding away. Use plain conditional rendering when nothing should move (a
filter result list). Never hand-roll a mount animation (an `Appear` with
`requestAnimationFrame`): `appear` is that.

Props: `show`, `from` `above` (default, a row joining a list) | `below` (an
object rising into place), `appear`, `onExitComplete`, `children`. Hidden
content is `inert` and `aria-hidden`. Only the vertical axis is clipped while
it moves, so a MarginNote inside an Arrive is never cut.

```
What is the content doing?
 ├── It is always mounted and swaps with something (Approve ↔ Undo) → show
 ├── It mounts because of an action (a new row, an Undo bar)        → show + appear
 └── It is being removed from your data (a dismissed item)
      → keep it mounted with show={false}, drop it in onExitComplete
```

- `appear` — animates in on mount via `@starting-style`. Only for content that
  mounts because of something the person did, never for what is there on
  page load. It is interactive from its first frame, so it can take focus at
  once.
- **Presence.** While leaving, Arrive keeps showing the children it had when
  last shown, so `<Arrive show={undo != null}>{undo && …}</Arrive>` folds
  the old content away instead of collapsing an empty box. `onExitComplete`
  fires when the fold ends (at once under reduced motion): remove the item
  from your data there.

```tsx
// Correct — the item folds away, then leaves the data; Undo arrives and takes focus
<Arrive show={!item.leaving} onExitComplete={() => purge(item.id)}>…</Arrive>
<UndoBar show={undo != null} onUndo={restore}>{undo?.sentence}</UndoBar>  // an Arrive inside, focus built in

// Incorrect — no cause: it arrives on a timer
useEffect(() => { const t = setTimeout(() => setShow(true), 1200); return () => clearTimeout(t) }, [])
```

**Inside a Stage**, an Arrive stretches to the Stage's width (the object in
it sets its own `width`), and a closed one costs no stack gap. Never wrap one
in `self-stretch`.

**Focus.** When the pressed button goes inert inside a closing Arrive, move
focus to its counterpart in an effect (Approve → Undo, Draft → Open Drafts).
Dismiss → Undo needs no effect: UndoBar focuses its own Undo. Otherwise keyboard focus is lost to `body`. A Menu command
that removes its trigger is the same problem (menus.md).

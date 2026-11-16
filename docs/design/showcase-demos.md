# Showcase demos: which picture tells which story

The finished pictures in `components/showcase/demos/`. Each tells one story
from the onboarding example (decisions.md, `the-post.ts`). Frames, Stage and
the Stageshow rules are showcase.md; the friend's states are mascot.md.

## Which demo

| Story | Demo | Kind |
| --- | --- | --- |
| Your work on the desk, Quincy's note in your pocket (the hero) | `DeskAndPocket` (`desk-and-pocket.tsx`), cropped by `HeroPicture` | showcase Stage, Window + Phone, plays once, no cursor |
| Quincy comes to you: three notes, each ending in your choice | `QuincyTexts` (`quincy-texts.tsx`), on a stage by `TextsPicture` | scripted thread, plays once |
| What it reads and where it posts | `ReadsAndPosts` (`reads-and-posts.tsx`) | still; rows passed in from `lib/sources.ts` and `lib/channels.ts` |
| What you said, then the post in three beats | `BeatsPicture` | still, `role="img"` |
| Three ideas from one merge, the one with a number picked | `IdeasPicture` (in `Crop`) | still, friend `found` |
| The held draft, waiting for your read | `HeldPicture` | still, friend `waiting` |
| The number against your own median | `MedianPicture` | still, friend `idle` |
| On your own vs with Quincy | `ComparePile`, `CompareCalm` (`compare.tsx`) | two stills |
| A voice note becomes a post in the week (docs and the kit page) | `HeroDemo` (`hero.tsx`) | Window, corner bleed, one cursor |
| Every number against your own median | `MedianCard` (`median-card.tsx`) in a FeatureCard | scripted, no cursor |
| One idea, a different first line per channel | `ChannelsCard` (`channels-card.tsx`) in a FeatureCard | scripted, no cursor |
| You ship; Quincy finds the idea | `IdeasCard` (`ideas-card.tsx`) in a FeatureCard | scripted, no cursor |
| Five claims as one grid | `BentoDemo` (`bento.tsx`) | Bento, five tiles |

Helpers: `Perched` (`perched.tsx`, the friend on an object's top edge,
lower body behind it), `Crop` (`crop.tsx`, a grey stage cropping its object
at the foot, `role="img"`), `useArrival` (`use-arrival.ts`, one more item
every `gapMs` once seen, first item in the server HTML), `POST`
(`the-post.ts`).

```
Does the story need something to happen?
 ├── No: the difference or the state is the story → a still (role="img", one sentence label)
 └── Yes
      ├── The person causes it (Approve, a pick)  → showcase Stage with a cursor (HeroDemo)
      ├── Quincy does it on its own               → no cursor; the cause is the story's first line
      └── Things arrive one by one, nothing moves → useArrival
```

## The motion rules, as quincy-texts applies them

`QuincyTexts` is the reference for any thread or arrival picture. Copy its
choices, not its numbers alone:

- **Typing dots before a note.** Three dots, 160ms apart, pulsing on a 1.2s
  cycle, for 1600ms after a 700ms pause. The friend shows `writing` while
  they type. Why: a note that appears with no typing reads as a notification
  the reader missed, not as someone writing to them.
- **A new bubble grows from its avatar corner.** `origin-bottom-left`,
  scale 0.9 → 1 with opacity, 240ms `cubic-bezier(0.23, 1, 0.32, 1)`; the
  time stamp and chips fade in after it, 120ms apart. Rows already there
  slide to their new place (FLIP, 360ms `cubic-bezier(0.32, 0.72, 0, 1)`).
  Transform and opacity only, through WAAPI.
- **The chip press.** The picked chip scales to `--kit-press-scale` (0.96) for 160ms, then fills
  in ink (140ms on background, colour and scale). The choice stays filled:
  it is on the record.
- **Plays once, holds the ending.** It starts when first seen and stops on
  the last note. Data never rewinds in view (showcase.md).
- **Sized to its final frame.** An invisible, `aria-hidden`, `select-none`
  copy of the last frame holds the height, so nothing below moves while it
  plays.
- **Reduced motion: the whole thread at once.** No dots, no growth, no
  slide. The first note is in the server HTML either way.
- **One face.** The friend is beside the newest note only, in that note's
  state: `found`, then `waiting`, then `sent`, which hands back to `idle`.
- **It never ends on "done".** The last note still offers two choices.

## The copy-leak rule

Text a screen reader needs and the page does not show goes in an element
with the `hidden` attribute, wired by `aria-describedby` (or
`aria-labelledby`). Never an `sr-only` span.

```tsx
// Correct — quincy-texts.tsx: the picked chip is described as "Your choice"
<span aria-describedby={you}>Read it first</span>
<span id={you} hidden>Your choice</span>

// Incorrect — the words are in the text flow
<span>Read it first<span className="sr-only">, your choice</span></span>
```

Why: `sr-only` text is still in the page's text. It is copied with a
selection, read by crawlers into the search snippet, and shown in reader
mode, so "Read it first, your choice" leaks into everything that quotes the
page. A `hidden` element is out of the text and still a valid description
target. The same reason puts `select-none` on the invisible sizing copy and
on every `role="img"` picture: a picture's words are its label, once.

## A new demo

Start from the closest demo. Write the story as numbered beats in the header
comment before any code, keep the copy in three beats with the number on its
own line, take the words from `POST`, and give it a reduced-motion ending
that tells the whole story alone.

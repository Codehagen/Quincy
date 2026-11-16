# Decisions: the landing page

What the three landing lab rounds kept and threw away. The summary is
decisions.md. Pieces: `/prototypes/lab/landing`. The result is the homepage
(`components/marketing/`); its rules are marketing.md.

## References, in words

Names of other products stay out of the repo. Each reference is described by
what was taken from it:

- **A docs page about faux UI** — the register for everything (decisions-visual.md).
- **An agent product's landing with a dark ground**, a centred two-beat
  headline, and the agent's checked list of work. Taken: the receipt that
  ends on "held for your read" (02, 07, 11, 18). Left: the dark ground.
- **A product shown as an app window on a landscape wallpaper.** Taken into
  greys only: 05, 06, 16, 21's hills. Left: a photograph behind the product.
- **A SaaS landing with inline chips** in a big heading, hairline guides, and
  an "on your own vs with us" card pile. Taken: the comparison
  (`components/showcase/demos/compare.tsx`).
- **An agent product whose avatar is a dotted-eye blob.** Taken: the idea of
  a small character (05, 10, 30). Left: its design, replaced by the friend
  (mascot-iterating.md, "Never borrow").
- **A competitor whose agent texts you first.** Taken: Quincy reaches out
  (round 3's "Quincy comes to you"). Left: the chat app as the only surface.

## Round 1 — wide (01–20)

Hero plus the first section, 20 ways. The first prototype was too close to
its reference, so each piece takes one thing from a reference and pushes it
somewhere of Quincy's own. Four directions: the editor's page (01–05), the
product as hero (06–10), the argument first (11–15), the week as structure
(16–20).

**Kept: 02, 05, 07, 09.** The real product is the picture, Quincy's editor
marks sit on it, and a work receipt ends on "held for your read".

"Reading" is what the picks suggest, not the owner's words.

| Not kept | Pieces | Reading |
| --- | --- | --- |
| a serif for the person's words or the page | 01, 04, 15, 17 | the type stays Inter; the editor is the marks, not a typeface |
| the argument at display size (a big number, an essay) | 11–15 | the product was not in the picture |
| the week as the page's structure | 16, 18–20 | a calendar is a tool, not the reason to sign up |
| a centred quote as the headline | 03 | the person's words belong in the product picture |
| the other product-as-hero takes | 06, 08, 10 | the direction survived through 07 and 09 |

## Round 2 — whole pages (21–30)

Made from 02, 05, 07, 09. Each piece is a full page at 1200px wide, scrolled
inside the frame. 21–25 light (wallpaper, phone); 26–30 dark.

**Kept: 26, 28, and the favourite, 30.** 26 merged on Friday (the marked PR
and receipt as a wide hero, then the PR in steps). 28 the receipt as the
page's spine. 30 Quincy as a small character that peeks over each close-up
and is asleep by the final call. Not kept: 21–25, 27, 29. No reason was
recorded; the light pages came back in round 3 as the ground.

## Round 3 — one direction (31–35)

Made from 02, 05, 07, 09, 26, 28 and 30. The brief, decided by the owner:

- **Light theme.** 30 was dark; round 3 is not (decisions.md, "Light first").
- **The Pixel friend is the character**, perched on pictures in the state
  that picture is about (mascot.md).
- **Editor marks in two or three places only.**
- **Connectors two-sided:** what Quincy reads and where it posts, from
  `lib/sources.ts` and `lib/channels.ts`, so the page cannot promise a
  source that does not work (`reads-and-posts.tsx`).
- **Quincy comes to you:** the thread of notes (`quincy-texts.tsx`).

Five variants of one page: 31 on the desk, 32 it texts first, 33 the desk
dense, 34 desk and pocket, 35 a few lines.

**Built: 31's page, with 34's phone over the desk window as the hero and
35's thread at reading size under it** (the owner's pick, 2026-11-15). The
hero is `desk-and-pocket.tsx`, the thread `texts-picture.tsx`.

| Kept from the variants | From |
| --- | --- |
| airy centred page, connectors straight after the hero | 31 |
| the phone standing over the window's edge, notes landing on the lock screen | 34 |
| the thread itself at reading size, no device | 35 |
| the friend as the sender's avatar | 32, 35 |

Not kept: 33's left-aligned dense page with two-column sections, and 32's
friend at 64 as the hero. No reason was recorded for either.

## Cuts hero (2026-11-16)

**Built: (a) Ask**, the editor window with the prompt and the receipt
arriving line by line (`app/prototypes/video/hero.tsx`, the owner's pick).
It shows the claim the page leads with: you say the edit in a sentence and
the editor reports each change as it lands. Not kept: (b) Timeline, the lanes
closing up from 1:58 to 0:42, because it shows one tool and hides the
sentence that drives it; (c) Phone, the finished vertical cut beside the
reply, because it puts the result first and reads like a posting product,
which Cuts is not yet. The video frame is a dark take of an out-of-focus desk
with caption and waveform, never a drawn person or a photo.

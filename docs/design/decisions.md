# Decisions: what the labs chose, so nobody re-argues it

The kit, the friend and the landing page came out of curation labs on
2026-11-15 (`app/prototypes/lab/`): the agent made many, the owner kept few,
the next round was made from what was kept. This file is the record, like
colour.md's "the four that lost". The rounds in detail: decisions-visual.md
(visual style, icons) and decisions-landing.md (landing).

**To reopen a decision, run a lab round, not an argument.** A decision here
was made by looking at the alternatives side by side. A paragraph against it
has not looked at anything (lab README, "When not to lab").

## Final decisions

| Decision | What it means | Why | Lives in |
| --- | --- | --- | --- |
| **The Stageshow register** | near-white ground `#FDFDFC`, one white object, Inter 14/20 at 460, hierarchy by weight and grey, one colour per job | the owner found the old app (warm beige cards, Geist, brass) generic; this register reads as a real product, calm | plans/029, README.md, colour.md |
| **The landing is the reference** (2026-11-16) | the app follows `/`: objects on the white ground, grey `--kit-stage` only as a recess, `Stage backdrop="ground"` by default; more air (object pad 28 × 24, page top 64, page gap 56); a 28px/600 page title | the owner likes the landing; the app should read as the same product | plans/029 revision, surfaces.md, spacing.md |
| **Ink is the action** (2026-11-16) | the one action is an ink pill (`--kit-primary*`); picked rows and segments are the well grey or ink; blue is only the pen | the landing's CTA is ink, and one blue doing two jobs (your next step, Quincy's hand) was one job too many | colour.md, buttons.md |
| **ui-sdk for new behaviours** (2026-11-16) | existing kit components stay on Base UI; a new component whose behaviour Base UI does not cover well uses `@ui-sdk/react` + `@ui-sdk/core`. One component never mixes both | reorder, virtual lists, a command palette, date-time are real needs Base UI does not cover well | plans/029 revision, controls.md |
| **Quincy is a human editor** | margin notes (Caveat), the yellow highlighter, blue-pen beat brackets | the owner kept every piece that marked up a page; it makes the product feel like a person, not a dashboard | editor-marks.md |
| **Ideas, never riffs** | an angle is an *idea*; a riff is named by its source ("3 ideas from your voice note"); the page is **Ideas** | "riff" is a word nobody outside the codebase uses. Code and schema keep `riff` until a planned rename (one database) | plans/029 "Words", quincy-riffs.md |
| **Ideas is a working surface — Table** (2026-11-16) | Ideas is a workspace: two toolbar rows (page, filters with counts), a dense DataList with columns (glyph · idea · source · shape · for · age), and the open idea Marked up in a fixed Panel beside it, worked by key (j k D N L U /). Under ~900px of workspace it folds into one column of rows that open in place | the owner, on the three layouts side by side in /prototypes/workspace-lab: "Jeg liker egentlig table veldig godt". Ideas is a queue worked daily; columns read down as well as across, and the open idea sits beside its row without the list moving. Rejected: Three panes (a third scroll region, no columns; the grouped view covers "what did I say in that call?"), Inline (kept as the narrow fold) | workspace.md, `app/prototypes/workspace-lab/DECISION.md` |
| **Cuts, not Studio** | the video editor is **Cuts** in visible copy (route `/cuts`) | "Studio" is the chat page; one word for two pages makes both unclear. The component is still `Studio` in code | `app/prototypes/video/name.ts`, plans/031 |
| **Pixel friend, smooth from 32** | the mark is icon piece 31; under 32px the pixel drawing, from 32 the vector one (piece 20), same beats | whole pixels are the sharpest drawing at 16 (why 31 won); from 32 there is room for curves, and eased moves read as alive where cut frames read as jumps | mascot.md, `components/mascot/friend.tsx` |
| **Quincy comes to you** | Quincy writes first, a few lines, and every note ends in the person's choice | an agent that only answers is a tool; one that reaches out reads as staff. Ending on a choice keeps "Quincy drafts, you send" | `components/showcase/demos/quincy-texts.tsx` |
| **Editor marks in 2–3 places per marketing page** | a highlight or margin note on two or three pictures, not all of them | a mark says "this one". On every picture, none of them is this one | landing round 3, showcase.md |
| **Light first** | marketing pages are designed and judged on the light ground; dark is the token remap | the dark pages of landing round 2 (26–30) were not carried into round 3 | landing round 3 note |
| ~~**Base UI stays the one behaviour layer**~~ | a behaviour library looked at on 2026-11-15 was not adopted | it does Base UI's job; two would mean two ways to build a menu. Revisit per missing behaviour (reorder, virtual lists) | plans/029 |

### Superseded

- **2026-11-16 — "one grey stage" in the Stageshow register.** The grey frame
  behind every section is now only a recess; the landing showed the object
  reads better on the white ground.
- **2026-11-16 — the blue action** (plans/029 "Colour roles": `action` is
  blue, selected is a blue tint). Replaced by the ink pill and the well grey,
  after the landing. Blue is kept only as the pen.
- **2026-11-16 — "Base UI stays the one behaviour layer".** Replaced by the
  ui-sdk rule above: Base UI keeps every existing component, ui-sdk takes the
  behaviours Base UI lacks.

## The onboarding story

Every marketing picture tells one example, so the page is one story and not
five. It is three beats with the number on its own line:

> We cut our onboarding from nine screens to three.
> People who finished signup, the week before and since:
> **41% → 68%**
> Every screen we removed was a question we never needed to ask.

The words live once, in `components/showcase/demos/the-post.ts` (`POST`:
`did`, `happened`, `figure`, `meant`). Import `POST`; never retype it, or the
hero and the held draft drift apart. It is a plain module on purpose: a
const imported from a `"use client"` file into a server component arrives
as a reference proxy and every field reads empty. The receipt around it
(`desk-and-pocket.tsx`: read #212, 6 screens removed, 41% to 68%, 2 posts
held) and the idea title "41% → 68% in a week" must agree with `POST`.

`isFigureLine` (`lib/draft-beats.ts`) accepts "41% → 68%" as one figure
since 2026-11-15, so a real `DraftCard` showing this post brackets it
(quincy-drafts.md, "A before-and-after figure").

## Never

Tried in the labs, looked at, and thrown out. Do not bring them back.

- **Dark stat tiles**, the big number on black (visual 03, 11, 15). A number
  is stated against the person's own median in a line of text, not shouted.
- **Bento splits and grids of tiles in the app** (12, 14). One stage, one
  object; a split stage divides the attention the page exists to focus.
  Bento is allowed on marketing pages only (showcase.md).
- **A window waiting on a loop** (06), and **auto-looping cursor demos** where
  nothing happens until it plays (09, 10). Every motion has a cause.
- **Strikethrough diffs** (04). Quincy marks up a draft; it does not grade it.
- **Stand-alone control demos with no page around them** (16, 18). A
  control is shown inside the surface it belongs to.
- **The live-ritual pill** (20). Live is a dot, never a pill or a fill.
- **A borrowed character** (landing 05, 10, 30's ink blob). mascot-iterating.md.
- **A follower chart, or a metrics/vanity dashboard** (tiles of counts, a
  chart of items per week, a bare total). `docs/vision.md`. A dense working
  surface (toolbar, table, panels; workspace.md) is allowed: it is where
  the work is done, not a wall of numbers about it.

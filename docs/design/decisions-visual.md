# Decisions: visual style and icons

What the visual and icon labs kept and threw away, round by round. The
summary and the never-list are decisions.md. Pieces live at `/prototypes/lab`
(visual) and `/prototypes/lab/icons`; numbers are permanent.

## Visual style, round 1 — wide (01–20)

Reference, in words: a docs page for a kit of faux product UI (Stageshow,
MIT, credited in `components/showcase/NOTICE.md`): near-white ground, quiet
grey stages, Inter 14px with hierarchy by weight and grey, real UI cropped
by the frame, one accent, every motion with a cause. Nothing was inherited
from the app. Four axes: reading and annotation (01–05), hero demos with a
window and a cursor (06–10), feature tiles and bento (11–15), single
controls (16–20).

**Kept: 01 02 05 07 08 13 17 19.** In the owner's words: the three-beat copy
makes the product feel human, and he likes how the cards look.

| Discarded | Pieces | Why |
| --- | --- | --- |
| dark stat tiles | 03, 11, 15 | a shouted number; Quincy states a number against your own median in a sentence |
| bento grids of tiles | 12, 14 | split stages divide attention |
| a window waiting for an animation | 06 | empty space that promises something |
| auto-looping cursor demos | 09, 10 | nothing happens until it plays; the motion has no cause |
| a diff with strikethrough | 04 | grading, not editing |
| stand-alone control demos | 16, 18 | a control with no page around it says nothing about the product |
| the live-ritual pill | 20 | live is a dot, never a pill |

## Visual style, round 2 — narrow (21–40)

Brief: `app/prototypes/lab/round-2/BRIEF.md`; shared kit:
`round-2/KIT.md`. Stop making pictures of the product; make its own surfaces
in the style: writing (21–25), planning (26–30), capture (31–35), chrome
(36–40).

**Kept: 21 22 23 26 28 29 31 32 36 38** (plans/029). They became the Quincy
cards (plans/030): 21 and 23 the DraftCard, 22 AngleTabs, 23 QuincyReply, 26
and 28 the week and SlotCell, 29 the waiting list, 31 the recorder at the
head of Ideas, 32 the paste field, 36 the shell, 38 EmptyState.

Not kept: 24, 25, 27, 30, 33, 34, 35, 37, 39, 40. No reason was recorded.
They are open, not banned: a later round may bring one back with a reason.

## Numbers the kit kept from the lab

From `round-2/KIT.md`, where four groups' values were reconciled. The kit
tokens are in plans/029 and colour.md, type.md, surfaces.md, motion.md.

| Value | Kept | Why |
| --- | --- | --- |
| stage | `#F2F2F1` | all four groups agreed. *Since 2026-11-16 a recess only, never behind every section* |
| ink | near-black `#111110` | all four groups agreed |
| muted text | lab `.48` alpha (3.3:1) → L moved to ≥ 4.5:1 | the kept look failed AA; plans/029 moves L only |
| body | Inter 14/20, 460, −0.006em, `cv11 ss01` | every group |
| strong | 560 | three of four groups (one used 580) |
| figure | 18/22, 600, −0.02em, tabular | 02's number on its own line |
| mono | 12, system mono, tabular | 10.5 is 6.7px on a 360 frame |
| hand | Caveat, weight 500, −2° | 400 goes thin in graphite on small frames |
| radii | object 12, control 8, chip 6 | measured across the groups. *Superseded 2026-11-15/16: the kit is object 18, control 12, inner 8, chip 6, and buttons are pills (surfaces.md)* |
| press · state · enter · travel | 140 · 200 · 320 · 520ms | press over 07's 120; enter from 320–420 |
| sweep · note delay | 700 · 620ms | 01: the note writes in as the sweep ends |
| curves | out `(.2,.8,.2,1)`, move `(.45,0,.2,1)` | the shared out curve; travel lands soft (08) |
| one blue | Approve and the pen share a hue | 07 and 02's blues were near; one counts as one accent. *Superseded 2026-11-16: Approve is the ink pill; blue is only the pen (decisions.md)* |

## Icons, round 1 — wide (01–20)

The mark and favicon. Each piece showed the mark large, at 32 and 16, in a
tab, on light and dark, and as an app icon. Four directions: letterform
(01–05), editor's marks (06–10), voice and speech (11–15), abstract and
stamp (16–20).

**Kept: 04 and 20.** 04 Grid Q: whole pixels, sharper at 16 than at 120. 20
the marked friend: a page with eyes, wearing the highlighter as a sash.
Everything else was not kept: the letterforms that are not on the grid, the
editor's marks, the voice marks, the stamps and slots.

## Icons, round 2 — narrow (21–40)

21–25 pushed 04 (weight, a round counter, a highlighter tail, one eye);
26–30 pushed 20 (squat, a glance, a wink, a dog-ear, a tilted sash); 31–40
crossed them, with lockups at 38–40.

**Chosen: 31 Pixel friend, and 38 its lockup** with "Quincy" in Inter 560
(`QuincyMark`). 31 keeps 20's figure, eyes and full-width sash, drawn in
04's whole pixels with one-pixel notched corners: no curve is left to blur
at 16. The owner wanted a living avatar whose states mean product states;
a letter cannot look, and a character can (mascot.md).

The right column is a reading of the pick, not the owner's words; a later
round that disagrees should test it.

| Not chosen | Pieces | What it tells a later round |
| --- | --- | --- |
| a heavier or rounder Q | 21–25, 35, 39 | the letter alone carries no character |
| a changed silhouette | 26 squat, 29 dog-ear, 33 Q-shaped | the page's outline is the mark; states move only eyes and sash |
| a slanted sash | 30, 32 | at 16 a slant is steps or blur |
| a wink at large sizes | 28 | a mark must say the same at 16 and 128 |
| a hollow or yellow-faced friend | 36, 37, 40 | the solid ink page is what holds in a row of tabs |

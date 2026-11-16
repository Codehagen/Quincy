# Ideas — decided from /prototypes/ideas-lab

The decision log for this lab (the prototype skill, Phase 7). The owner fills
in **Picked**; the rest is what was on the table. When it is filled in, copy
the result into `docs/design/decisions.md`, build the pick in
`components/riffs/`, and delete this folder (and its line in
`.oxlintrc.json`'s showcase override).

## Picked

- Direction:
- Values (paste from "Copy config"):
- Why:

## On the table

| # | Direction | Axis | When it is the right choice | Its cost |
| --- | --- | --- | --- | --- |
| 1 | Beside (today) | list beside detail; the source is the unit | you pick material first and want the whole queue in view while you read one | the idea is two clicks deep; the split needs a ~1330px window with the sidebar, so a 1280 laptop gets one column |
| 2 | One at a time | triage inbox; the idea is the unit; D / N / L | deciding is the job and the queue is long; keyboard users | no side-by-side choice between ideas from one source; working and failed sources become a footnote |
| 3 | From the source | one reading column after the landing picture; the idea is the row | the landing promised this page; every idea is visible and the action is on the one you chose | your words hide behind "What you said"; a row holds a Button (page.md exception); no cap |
| 4 | Marked up | material first; ideas in the margin, sentences marked | Quincy-as-editor is the product's voice; provenance shown as the sentence itself | needs `Angle.line` from lib/adapt.ts; the longest page per source; a filler-heavy voice note is read first |

## Rejected, and why

(For the owner: one line per direction not picked, so the question is not reopened in three weeks.)

- Beside:
- One at a time:
- From the source:
- Marked up:

## Not built, and why

- **A board or card grid** (by source or by day). A grid of idea cards is the
  dashboard docs/vision.md rules out, and "bento splits in the app" is on the
  kit's Never list (docs/design/README.md). It would also put several Draft
  buttons on one screen.

## Found while building

- At the defaults, today's split (`--container-kit-split`, 66rem) is reached
  only from a window of about 1330px with the 13rem sidebar open. A 1280
  window shows the single column. Check with the "Desktop window" control on
  direction 1.

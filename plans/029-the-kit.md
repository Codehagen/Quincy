# 029 — The kit: from the lab to a design system

Decided 2026-11-15 by Christer after two lab rounds (`app/prototypes/lab/`).
Reference: https://benji.org/stageshow — its ground, its type, and the kind of
components it showcases (windows, cursors, feature cards, phones, annotations,
grids). Picks: round 1 kept 01 02 05 07 08 13 17 19; round 2 kept
21 22 23 26 28 29 31 32 36 38.

## What this replaces, and how

The current system (brass/sand ramps, ink `--primary`, Geist) stays in place for
the pages that still use it. The kit is built **beside** it, under new token
names, so no page changes look until it is migrated on purpose. Each page moves
to the kit as a whole — never half a page. When the last page has moved, the old
ramps and shadcn tokens are deleted and `docs/colour.md` is rewritten.

## Decisions

- **Ground** is Stageshow's `#FDFDFC` (oklch ≈ 0.995 0.001 100). **Stage** is
  the quiet grey `#F2F2F1`. **Object** (card, window) is white with a hairline
  ring and a soft shadow, no border.
- **Type** is Inter, 14px / 20px, weight 460, −0.006em. Hierarchy by weight
  (460 / 560 / 600) and grey, almost never by size. Caveat for margin notes
  only. System mono for times, file names, counts.
- **Colour roles** (one hue per job, nothing else is colour):
  - `action` — blue. The one action on a view (Approve, Send, Draft it).
  - `highlight` — yellow. The highlighter on the one sentence that matters.
  - `pen` — the blue of the beat brackets (did / happened / meant). Same hue as
    action, so the page has one blue.
  - `live` — a dot only, for "this is running". Green.
  - `danger` — red, destructive only.
- **Controls are tactile objects**, as in Stageshow's hero collage: white,
  pill or large radius, hairline ring + soft shadow, generous padding. Selected
  state is a soft blue tint with blue text (segmented), switch is a blue track
  with a white shadowed knob, stepper is label − n + in one pill, checks are
  filled green circles, menus are white panels with a grey hover row. Stages
  may carry a faint square grid.
- **Muted text passes AA.** The lab's muted grey was 3.3:1; the kit moves L
  only until it is ≥ 4.5:1 on both ground and stage.
- **Quincy is a human editor.** Margin notes, the highlighter and beat
  brackets are first-class components, not decoration.
- **Discarded, never to return:** dark stat tiles, bento splits in the app,
  windows waiting on a loop, strikethrough diffs.

## Order of work

1. Tokens + core components (`components/kit/`), with `/emil-color` and
   `/emil-component-design`.
2. App controls and showcase components, in parallel.
3. Docs (`docs/design/`, `/emil-design-system-docs`) and the component lab at
   `/prototypes/kit`, laid out like the Stageshow page.
4. Verify: one-sentence prompt builds a real screen from the kit;
   `/emil-ui-review` reads the drift; fix the docs, not the output.

## Behaviour layer

*Superseded 2026-11-16 (see the revision below): ui-sdk is adopted for new
behaviours Base UI does not cover well.* Base UI stays the one behaviour
layer (focus, keyboard, popups, aria). A behaviour library such as
https://ui-sdk.dev was looked at on 2026-11-15 and not adopted: it does the same job as Base UI, so two would mean two ways to
build a menu. Revisit it per behaviour Base UI lacks — drag-to-reorder for the
Lineup week (`createReorder`), virtualised long lists — when that page is built.

## Words

Decided 2026-11-15 by Christer: the product word **"riff" never appears in
anything a person reads.** An angle is an **idea**; the riff (raw material
plus its ideas) is named by its source: "3 ideas from your voice note". The
page and nav item are **Ideas**; the action is **Draft this idea**; empty is
"No ideas waiting". Code and schema keep `riff` / `Riff` / `Angle` until a
separate rename is planned (one production database — see AGENTS.md), so docs
may map the two once: "riff (shown as 'ideas')".

## 2026-11-16 revision

Decided 2026-11-16 by Christer. Where this section and "Decisions" above
disagree, this section wins; the code in `components/kit/` and the kit block
of `app/globals.css` already follow it.

- **The landing is the reference.** `/` (`components/marketing`,
  `components/showcase/demos`) is what the app should look like. The kit was
  rebuilt to match it.
- **White ground.** Objects sit on `--kit-ground` (#FDFDFC). The grey
  `--kit-stage` is only a recess inside an object (a Well) or the frame of a
  picture; `Stage` defaults to `backdrop="ground"` (`recess` and `grid` on
  purpose only).
- **Ink primary.** The one action is an ink pill (`--kit-primary`,
  `-hover`, `-disabled`, `-on`), as the landing's call to action. Blue is
  only the pen (the beat brackets). Selected rows and segments use the well
  grey (`--kit-selected`) or ink, never a blue tint. `--kit-action*` stays
  only because the showcase pictures still read it; it goes when they are
  rebuilt.
- **More air.** Object padding 28 × 24 from 40rem (`--spacing-kit-pad-x/y`),
  page top 64, page gap 56, page title 28px/600 (`--text-kit-title`).
- **Behaviour libraries.** Existing kit components stay on Base UI. New
  components whose behaviour Base UI does not cover well use ui-sdk
  (`@ui-sdk/react` + `@ui-sdk/core`, Apache-2.0, beta, https://ui-sdk.dev):
  command palette, token input, calendar and date-time, number input,
  reorder, tree, virtualised lists. One component never mixes both.
- **Docs.** `docs/design/` was rewritten to this state; the brass/sand
  argument moved to `docs/design/history-brass-sand.md` and `docs/colour.md`
  is a superseded pointer.

Order of work, revised:

1. Tokens and core components to the landing's look. Done 2026-11-16.
2. App controls and the app shell on the new tokens. In progress.
3. **Rebuild the showcase pictures from the real kit components**, so a
   picture of Approve is the app's Approve, then delete `--kit-action*` and
   its `--ss-*` mappings in `components/showcase/theme.css`.
4. Verify as before: a one-sentence prompt builds a real screen from the
   kit; `/emil-ui-review` reads the drift; fix the docs, not the output.

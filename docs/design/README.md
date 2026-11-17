# The kit

Quincy looks like a page someone has marked up, not a dashboard. The landing
page (`/`) is the reference (2026-11-16): a white ground, one white object
under a bold lead, Inter 14px with hierarchy by weight and grey, an **ink
pill** for the one action, and plenty of air. Quincy is a human editor: it
writes in the margin, highlights the one sentence that matters, and names
the three beats in blue pen, the only blue in the app.

Decided in `plans/029-the-kit.md` (read its 2026-11-16 revision). Tokens: the
"The kit — plans/029" section of `app/globals.css`, which is the source when a
doc and the code disagree. Components: `components/kit/` (`@/components/kit`)
and `components/quincy/` (`@/components/quincy`). Live examples:
`/prototypes/kit`.

## Rules

- **Kit utilities only**: `bg-kit-*`, `text-kit-*`, `shadow-kit-*`,
  `rounded-kit-*`, `p-kit-*`, `duration-(--kit-duration-*)`, `ease-kit-*`.
  Never a primitive (`--kit-gray-530`: dark mode re-points the semantic
  token, not the primitive), never a raw value (hex, `oklch()`,
  `text-[13px]`, `shadow-[…]`). A missing value is a kit gap: add the token.
- **Never the old system in a kit page**: no `--primary`, `bg-background`,
  `--brass-*`, `--sand-*`, `--signal*`, the role scale (`text-body` …),
  Geist, or `components/ui/`. The old system is history
  (history-brass-sand.md); it stays only on pages not moved yet.
- **Never `--kit-action`** (the old blue) in new code. It remains only for
  the showcase pictures until they are rebuilt (showcase.md).
- **A page moves whole**: `<KitPage title="…">`, then Stages, inside the app
  shell. Never half a page, never a hand-made page column (page.md). A
  queue worked through by key is a workspace instead (workspace.md).
- **Behaviour**: existing kit components are on Base UI. A new component
  whose behaviour Base UI does not cover well is on ui-sdk. One component
  never mixes both (controls.md, "Behaviour libraries").
- Icons are `hugeicons`, never `lucide`.
- **A new direction is a lab round**, and a reference gives one idea, never
  its layout (decisions.md, top).
- **Motion is held to an iOS-native bar**; "better animation" changes only
  the motion (motion.md).
- **Every EmptyState shows the friend** above the words (quincy-chat.md);
  the friend may appear more than once on a page, one per object
  (mascot.md).
- **A tool's sidebar row opens the most recent work**; the index is one
  click behind it (app-shell.md).
- **Reorderable rows travel**, keyboard moves too (controls.md).
- **DraftCard brackets sit in the margin from 32rem**, under the lines when
  narrow; the text never shifts (quincy-drafts.md).
- **Examples are what a user would get**: a before→after number from their
  own work, one story, never a currency example (marketing.md).
- **Page titles are `${title} · Quincy`** (Copy, below).
- **Quincy's handwriting lives on working surfaces too**: a few short graphite
  notes on the spot they are about ("next open slot", "close behind 09:00"),
  at most 3 a screen, one per object, gone when resolved (editor-marks.md ›
  Notes on working surfaces; the Lineup calendar is the model).
- **The friend is a participant**: every EmptyState, the chat avatar, the
  working line, the lockup; in films it turns into the product (mascot.md).
- **Work in progress is the friend's working state plus words**, never a
  pulsing green dot; green is not a status colour (states.md › Working).
- **Never a side stripe on anything selected**: rows are the grey plus an
  ink 560 title, objects the grey plus a 1px ink ring (colour.md › Rows).
- **The open draft is the post, in the platform's own look**, edited in
  place; everything outside the feed column stays kit (quincy-drafts.md).

## Never

Dark stat tiles, bento splits in the app, windows waiting on a loop,
strikethrough diffs, stand-alone control demos, the live-ritual pill, a
borrowed character, a follower chart, a blue button. Reasons in decisions.md.

## Index

| File | Read it when |
| --- | --- |
| [colour.md](colour.md) | picking any colour: ink action, selected, highlight, pen, live, danger, contrast |
| [type.md](type.md) | any text: `Text` (incl. `title`), `Muted`, `Lead`, `Mono`, `Code`, `Count`, `Tag` |
| [surfaces.md](surfaces.md) | ground, object, recess, elevation, radii |
| [spacing.md](spacing.md) | any gap or padding; `Well`, `Rule`, `Skeleton`, `Avatar` |
| [layout.md](layout.md) | `Stage` (backdrops, no lead), stacking, `Card`, `Window` |
| [page.md](page.md) | `KitPage`, `searchParams`, list and detail, `useRevealOnNarrow` |
| [app-shell.md](app-shell.md) | `AppShell`, the sidebar, the bar, the phone sheet |
| [buttons.md](buttons.md) | `Button`, `ButtonLink`, `TextLink`, `TextButton`; pending, toggles, the same button per item |
| [actions.md](actions.md) | which button is the action: underway, open, standing; per item; a form's submit |
| [removing.md](removing.md) | Undo, hold or plain; `danger`, `UndoBar`, `HoldButton` |
| [controls.md](controls.md) | any choice: Segmented, Tabs, Switch, Stepper, Slider, Checklist; Base UI or ui-sdk |
| [menus.md](menus.md) | Select vs Menu, menu rows, focus after a command, IconButton |
| [lists.md](lists.md) | `List`, `ListHeading`, `ListRow`, `NavRow`, `GlyphTile`, `FileChip`, `SourceMark` |
| [workspace.md](workspace.md) | a page worked through by key: `Toolbar`, `FilterMenu`, `DataList`, `Panel`, `KeyBar`, `StatusPill`, `Announcer`; `StatTile` and `Sparkline` (Numbers only) |
| [forms.md](forms.md) | `Field`, `Input`, `Textarea`, `SearchField`, validation |
| [states.md](states.md) | working (LiveDot + words), empty, refused or failed |
| [motion.md](motion.md) | `Arrive`, durations, curves, reduced motion; the iOS-native bar |
| [editor-marks.md](editor-marks.md) | `Highlight`, `MarginNote`, `Beats`, `BeatBracket` |
| [quincy-drafts.md](quincy-drafts.md) | `DraftCard`, `ScheduledPost`, `SlotCell`, `PostResult`, `AgainstMedian` |
| [quincy-riffs.md](quincy-riffs.md) | `RiffCard` + `AngleTabs` (shown as "ideas"), `ProvenanceMark` |
| [quincy-chat.md](quincy-chat.md) | `QuincyReply`, `YourTurn`, `QuincyAsks`, `EmptyState`, kit markdown |
| [marketing.md](marketing.md) | a public page: `MarketingShell`, `Section`, display type, `MarketingButton`, `WaitlistForm`; demo and fixture examples |
| [showcase.md](showcase.md) | marketing and docs pictures only; never in the app |
| [showcase-demos.md](showcase-demos.md) | which picture tells which story; thread motion; the copy-leak rule |
| [mascot.md](mascot.md) | the friend: `Friend`, `QuincyMark`, which state means what |
| [mascot-timing.md](mascot-timing.md) | the beats both drawings share, per-state timing, reduced motion |
| [mascot-iterating.md](mascot-iterating.md) | changing the friend: a frame, a new state, the favicon, exports |
| [decisions.md](decisions.md) | before proposing a look or a new direction (a reference gives one idea, never its layout; a new direction is a lab round): what was chosen, what was superseded; [visual](decisions-visual.md), [landing](decisions-landing.md) |
| [history-brass-sand.md](history-brass-sand.md) | why the old app looked as it did (superseded 2026-11-16) |

## Copy

- First person, short lines, three beats: what I did / what happened / what
  it meant. The number goes on its own line (`<Text variant="figure">`).
- Every number is against the person's own baseline: "Your median is 6.",
  never a bare total.
- "Quincy drafts, you send." Nothing reads as if it already went out.
- Nothing salesy: no exclamation marks, no "unlock", no "supercharge".
- Never "riff" in visible copy. An angle is an **idea**; name the group by
  its source ("3 ideas from your voice note"). The page is **Ideas**. Code
  keeps `Riff` / `Angle` (plans/029, "Words").

**Page titles are always `${title} · Quincy` — never an em dash.**
Why: an em dash breaks the writing rules, and a page title is visible copy:
it is the tab, the history and the shared card. `constructMetadata`
(`lib/metadata.ts`) writes the suffix; pass `title`, never a whole string
with the brand in it.
<!-- 2026-11-16: "Jeg er enig med « · Quincy»" -->

## Checks

The rules a machine can hold. `pnpm lint` and `pnpm test` run them; a check
that fails names the doc it came from.

- **A. Never "riff" in visible copy.** ESLint `quincy-design/no-riff-copy`
  (eslint.config.mjs): JSX text matching `riff`/`riffs` in `app/(app)`,
  `app/(marketing)`, `app/(auth)`, `app/(welcome)` and `components/`. Error.
- **B. No ramp steps, one ground.** ESLint `quincy-design/no-kit-primitive`:
  a string with `kit-gray|blue|yellow|green|red-<L>` outside
  `components/kit/`, or `bg-kit-ground` outside `components/kit/root.tsx`.
  Warn until the hits below are gone, then error.
- **C. No old blue.** ESLint `quincy-design/no-kit-action`: `kit-action` in a
  string outside `components/showcase/` (`data-kit-action` is a name, not the
  colour, and passes). Error.
- **D. Every nav row has an icon.** `components/quincy/shell/nav.test.ts`.
- **E. Every EmptyState shows the friend.** `components/kit/empty-state.test.ts`
  (quincy-chat.md, "EmptyState").
- **F. Titles end in " · Quincy", never an em dash.** `lib/metadata.test.ts`.
- **G. No pulsing live dot.** ESLint `quincy-design/no-live-pulse`: a `pulse`
  prop on `LiveDot` outside `components/showcase/` (states.md › Working).
  Error.
- **H. No side stripe on a selected thing.** ESLint
  `quincy-design/no-side-stripe`: `SELECTION_BAR` or `kit-selection-bar`
  outside `components/showcase/` (colour.md › Rows). Error.

A, B, C, G and H skip `app/prototypes/` (frozen lab records) and test files.

Open hits for B (2026-11-16), each a warning: `bg-kit-ground` in
`components/editor/studio-chat.tsx`, `components/editor/studio-frame.tsx`
(twice), `components/kit/data-list.tsx`, `components/kit/panel.tsx`,
`components/marketing/never-list.tsx` and
`components/quincy/shell/app-shell.tsx`; a ramp step (`--kit-gray-450`,
`--kit-gray-300`) in `components/showcase/demos/desk-and-pocket.tsx`.

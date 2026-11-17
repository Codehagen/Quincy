# Decisions: what the labs chose, so nobody re-argues it

The kit, the friend and the landing page came out of curation labs on
2026-11-15 (`app/prototypes/lab/`): the agent made many, the owner kept few,
the next round was made from what was kept. This file is the record, like
colour.md's "the four that lost". The rounds in detail: decisions-visual.md
(visual style, icons) and decisions-landing.md (landing).

**A reference gives one idea, carried by something Quincy owns — never its
layout. A new direction for a surface always starts as a lab round
(several directions behind a picker), never as a build.**
Why: a near-copy of a reference is not ours. A page that copies another
product's layout says nothing about Quincy, and a direction built before it
was compared with others was never chosen, only accepted.
<!-- 2026-11-15: "Også var denne landingpagen nesten 100% copy av …? skulle ikke vi kjøre en labs som vi gjorde også på denne?" -->

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
| **Lineup is a calendar — a working surface** (2026-11-16, moved to /lineup 2026-11-17) | a Mon–Sun week of continuous time (00:00–24:00, 15-minute snap), posts as blocks at their exact minute, a slot's occurrence that nothing fills as a dashed block, the approved posts with no time in a tray over the grid, the open post drawn as its feed beside it; moved by pointer or by keys (Enter picks up, arrows, Enter drops, Esc puts back, U undoes); Quincy's handwritten notes on a control; the now line in ink, no green and no blink; touch and phones get the Feed. No counts on a block, a day or the week | the owner, on the Board in /prototypes/lineup-lab: "make this into a calendar that we also can have all the times between also"; "fjern den grønne blinken". A picked block is the well grey and a 1px ink ring all round, never a side bar: "på calender kan du også fjerne det helt til venstre?" (2026-11-17) | `components/kit/week-calendar.tsx`, `components/lineup/`, `app/prototypes/lineup-lab/DECISION.md` |
| **Settings is a working surface — Desk** (2026-11-17) | /settings is a workspace in the house frame: a toolbar with the title and one sentence from the account, search on `/`; a filter row (Show: All · Needs you, Hide notes, the tally); every setting, browser and agent as a row of one grouped DataList (Profile · Sign-in · Plan & billing · Agents · Account); the open row in a pane in Drafts' order (a strong sentence, a muted provenance line, the object, the verbs); Quincy's graphite notes on the group lines and beside the pane's object. Billing is the "Plan & billing" section; `/settings/billing` forwards to `/settings?section=plan`. Under 900px of workspace a row opens in a Sheet | the owner, on the directions side by side in /prototypes/settings-lab: "Jeg liker desk", and "Jeg ønsker mer grafitt kanskje slik at det ser mer playful ut". Rejected: Today (the old page, prose to read), Sections (right structure, "feels very flat"), Overview, Ledger, Stage, Window, Annotated, Desk by section (below) | `components/settings/`, "Settings, decided" below |
| **Cuts, not Studio** | the video editor is **Cuts** in visible copy (route `/cuts`) | "Studio" is the chat page; one word for two pages makes both unclear. The component is still `Studio` in code | `app/prototypes/video/name.ts`, plans/031 |
| **Pixel friend, smooth from 32** | the mark is icon piece 31; under 32px the pixel drawing, from 32 the vector one (piece 20), same beats | whole pixels are the sharpest drawing at 16 (why 31 won); from 32 there is room for curves, and eased moves read as alive where cut frames read as jumps | mascot.md, `components/mascot/friend.tsx` |
| **Quincy comes to you** | Quincy writes first, a few lines, and every note ends in the person's choice | an agent that only answers is a tool; one that reaches out reads as staff. Ending on a choice keeps "Quincy drafts, you send" | `components/showcase/demos/quincy-texts.tsx` |
| **Examples are what a user would get** (2026-11-15) | every demo, fixture and showcase picture shows a relatable before→after number from the person's own work (41% → 68% from a merged PR); never a contrived finance or currency example; all pictures tell one story | the owner found the currency example "veldig dårlig": an example has to look like what the person actually gets | marketing.md, "Example content"; "The onboarding story" below |
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

## Settings, decided (2026-11-17)

Copied from `/prototypes/settings-lab/DECISION.md` when the lab was promoted
and its folder deleted. Built in `components/settings/` and
`app/(app)/settings/page.tsx`.

**Picked: Desk.** <!-- 2026-11-17: "Jeg liker desk" --> And then: more
graphite, so it reads as more playful.
<!-- 2026-11-17: "Jeg ønsker mer grafitt kanskje slik at det ser mer playful ut" -->

### The brief

"The settings page doesn't look right. Prototype the new one based on my
taste, do it the way we do, best practice, bring in more if needed, look at
the shell otherwise." Then, during the build: "follow the kit we have". Read
against the record: airy single-column white cards were what to move away
from, towards app-grade working surfaces (toolbar, lists, panels).

Found while building the baseline: the old page always said "with a
password", also to an account that signs in with Google and has none. Desk
says "Google" there and offers no password form.

### What was on the table, and why each lost

| Round | Direction | Axis | Why it lost |
| --- | --- | --- | --- |
| 1 | Today | the old page (KitPage, three Stages, the value in a sentence as the control) | the baseline, never a direction: prose to read, not values to scan; billing and usage were two more pages |
| 1 | Sections | a section nav beside rows, billing folded in | the best structure: "Sections was the best, but it feels very flat. It doesn't feel like the showcase we have elsewhere or the labs we used before." Kept as the structure the later rounds riffed on |
| 1 | Overview | six tiles, a Sheet per tile | every edit a sheet away; the nearest thing to a dashboard the product has |
| 1 | Ledger | a dense DataList of every setting | cut with Overview in round 1; Desk is its idea brought back in the house frame |
| 2 | Stage | the landing's recess as the frame, lifted objects | "doesn't feel like the rest": two depths on one screen, the recess framing working controls like a picture |
| 2 | Window | the page as a product picture with chrome | chrome around the app inside the app reads as a picture, not a page |
| 2 | Annotated | a Card and a margin note per row | the airiest; notes had to stay true per state; still not the house frame |
| 3 | Desk, by section | Desk with the section as the row | a nearly empty list pane on a tall screen; no search across browsers and agents |

The round 2 verdict that set the frame: "Look at Drafts and Lineup, how we
use the marks, how we use graphite, and do Sections that way."

### What Desk is

- **The frame** is Drafts' and Lineup's: Toolbar with `ToolbarSummary`
  ("Paying, renews 3 Dec. 4 browsers, 2 agents."), FilterMenu with counts and
  Clear, the tally in mono, a DataList with column heads (Setting · Value ·
  fact · State) grouped under Lineup's day label (the name at 560, a muted
  qualifier, the count in mono), `Panel edge="start"` with a 32 band, the
  KeyBar (j k Move · Enter Open · E Edit · / Search · Esc Back), the fold
  under 900px into a Sheet.
- **Rows are one height**: titles, values and facts truncate to one line;
  the full text is in the cell's title and the pane. Facts are Drafts' Age
  forms in mono ("07:52", "Yesterday", "12 Nov", "19/20", "$8.46").
- **State is a still glyph and a word** (`StatusMark`), ink only when it
  needs you (Read-only, Payment needed); the word folds to assistive tech
  under 36rem of list. No green, no blink.
- **The pane in Drafts' order**: one strong sentence ("Quincy calls you
  Christer."), one muted provenance line, the object (a kit `Field` whose
  `meta` carries the mono fact, "Display name 14/80"; or `Facts` in a
  `Well`), then one row of verbs: the ink pill, a ghost Reset, a hold
  pushed to the end. Save is disabled until the value differs.
- **Plan & billing** keeps the billing page's copy word for word; "$49" as
  the figure in a Well; Manage billing quiet on a healthy plan so the
  page's one ink stays an edit, Subscribe and Update your card ink; Cancel a
  hold, Keep my plan in its place; the friend perched on the Well only on
  stuck or resting; the confirmation after Checkout in the pane, never a
  Subscribe while Stripe confirms. This month is one sentence against last
  month.
- **Holds** for removing an agent, cancelling the plan and signing every
  other browser out; one browser is a plain button (signing in again
  undoes it). The Account pane has "Write to us" and a disabled "Delete the
  account" hold, the shape plans/035 fills in.
- **Only what the rows store.** The lab showed browser versions, a place
  from the IP and an agent's scopes on fixtures; the product shows the
  user agent as `describeUserAgent` reads it, the session's sign-in and
  last-used dates, and how an agent came (registered here or introduced
  itself).

### Quincy's pencil on a settings page

| Mark | Where | Rule it follows |
| --- | --- | --- |
| A graphite `Hand` on a group's line ("fix the card first", "writing has stopped", "keep it before it ends?", "one has no name", "others still signed in", "almost full", "some never connected") | the list, at the group's line, hidden under 36rem of list | editor-marks.md › Notes on working surfaces: graphite, on the spot, 2–4 words, leads to an action, never a count, gone when resolved |
| At most two list notes | the list | at most 3 on a screen: two in the list plus the pane's one |
| One `MarginNote` beside the pane's object | the pane | one per object |
| "all quiet here" beside the friend when Needs you is empty | the empty state | the list notes are gone then |
| Hide notes / Show notes | the filter row | a page that uses them gives them a control |

Asked for and not done, because the docs forbid it: a note in the toolbar
(never on chrome), a second note in the pane (one per object), counts in
notes ("3 others still signed in" is said "others still signed in").

### What the pick asked of the kit

| Gap in the lab | Verdict | API |
| --- | --- | --- |
| `TimeText` (lineup-marks.tsx, the lab's copy) | not a new component | `Mono` gains `size?: "md" \| "sm"` |
| A state mark, glyph and word | `StatusPill` renamed and opened | `StatusMark`: a preset `status`, or `icon`, or `glyph` (never two); `children` is the word; `tone`; `hideWord` |
| Label and value facts in a pane | new, compound | `<Facts><Fact label="Where">…</Fact></Facts>`, a `<dl>` that draws no surface; place it in a `Well` |
| The toolbar's summary sentence | new part of `Toolbar` | `ToolbarSummary` beside `ToolbarTitle`: meta style, truncation, the 40rem fold |
| A Field with a mono fact beside the label | extend `Field` | `meta?: React.ReactNode` at the end of the label row |
| Focus back to a row from a pane | change the option | `revealDataListRow(key, scope, { focus: "follow" \| "recover" \| "take" })` |
| The friend on an object's edge | promote as is | `Perched` in `components/kit/perched.tsx` |

Deliberately not proposed: a `SettingsRow` or `DeskPane` component (the pane
is one page's composition of Panel, Field, Facts, Well, MarginRoom and
HoldButton, and stays in `components/settings/` until a second page needs
it), and a config-driven settings schema (every row edits differently).

### The shell

The account menu keeps its Billing row, a familiar door, now pointing at
`/settings?section=plan`; Credits stays its own page for the charge list.
The billing banner and Stripe's return addresses point at the same place.

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
  Bento is allowed on marketing pages only (showcase.md). **One exception:
  Numbers** (2026-11-16), whose job is the glance, so a row of four tiles
  and a grid of panels stand there and nowhere else. It holds because each
  tile is a sentence against the person's own usual, not a shouted count
  (`app/prototypes/numbers-lab/DECISION.md`). Every other page keeps the
  rule.
  <!-- 2026-11-16, the owner on /prototypes/numbers-lab: "Så jeg liker Dashboard og table." -->
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
  the work is done, not a wall of numbers about it. **Numbers is the one
  dashboard** (2026-11-16, the owner's pick of Dashboard with Table): every
  number on it is a sentence against the person's own usual, Depth
  (replies, who came back) comes before Volume (posts, views per post),
  and there is no follower count, no bare total and no colour for good or
  bad. A tile or a row opens the posts behind it in a Table. No other page
  gets tiles or a metrics grid, and a follower chart stays out everywhere.
  <!-- 2026-11-16, the owner: "Så jeg liker Dashboard og table." -->

# Drafts as a workspace — decided from /prototypes/drafts-lab

The decision log for this lab. The owner fills in **Picked**; the rest is
what was on the table. When it is filled in, copy the result into
`docs/design/decisions.md`, move what the pick asks of the kit (the table
at the end), rebuild /drafts on it, and delete this folder (and its line in
`.oxlintrc.json`'s showcase override).

The brief (2026-11-16): rebuild Drafts the way Ideas was rebuilt. Ideas
became a working surface (Table, with Marked up beside the row; "Jeg liker
egentlig table veldig godt"). Drafts is where a person reads, edits and
approves what Quincy wrote, then it goes out on a slot or now. Quincy
drafts, you send. The open draft must show the editor marks.

Route: `/prototypes/drafts-lab` (`?v=1..3` picks the layout, `?clean` hides
the picker and the panel, `?state=loading|empty`, `?queue=real`). It renders
at true size in the real app shell, on one local store, so an Approve in one
layout shows in the next. Keys: j k move, A approve, E edit, P preview, U undo, /
search; 1–3 switch layouts.

## What the data says (read-only aggregates, 2026-11-16)

| Fact | Live | What it decides |
| --- | --- | --- |
| Drafts, accounts with drafts | 110, 1 | |
| Waiting (a version in `writing`) | 109 versions in 109 drafts; 1 approved | the queue is deep: a list of 6 rows with "Show more" (today) hides 103 of it |
| Versions per draft | 1 for all 110 | the open draft is one post, usually; stacking versions is the rare case |
| Channels | X 110, LinkedIn 0 | "For" is a filter of one value today; kept for the LinkedIn case |
| Adapted from a saved post | 98 (90 handles), 98 with a URL | "From" is the most useful filter; the post's text is not stored |
| From your own work | 12 (GitHub 10, voice 1, notes 1) | |
| `riff_hook` / `kind` set | 12 / 12 | "From the idea …" and the kind are empty on 98 real drafts |
| Body length | p10 168, p50 203, p90 232, max 295 chars | a post fits a 32px row's opening line, and four lines of prose |
| Paragraphs per body | 2: 2, 3: 51, 4: 53, 5: 4 | |
| Bodies `readBeats` brackets | **0 of 110** (no number on its own line in any) | without a fallback mark, no real draft shows a single mark |
| Scheduled posts, slots | 0, 2 (both X) | Lineup's "Going out" groups are empty today |
| Drafts per week (last 10 weeks) | 3–15, about 10 | the queue grows faster than one approval a week drains it |
| Oldest waiting | 24 Aug | today's order (`getDrafts`, oldest first) opens on a three-month-old draft |
| Edited after drafting | 2 | rule offers have had almost nothing to learn from |

The fixtures (data.ts) are fictional text in these shapes: 27 drafts, most
X-only adaptations of three or four paragraphs with no number line, four
three-beat stories, one LinkedIn twin, one hook-only fallback, one over the
limit, and one of each decided state. `?queue=real` repeats older ones up to
110 for the density check.

## Picked

- Layout: **1 · Table**, with **3 · Lineup as its fold** (owner, 2026-11-16:
  "Så table var kanskje best her også"). Desk and Lineup stay in the lab
  until /drafts moves.
- Asked with the pick: "should the right side show how the X post actually
  looks?" Answered with a **feed preview per version**, not a second layout
  (below, "Preview").
- Values, settled by the surfaces, hierarchy and spacing pass and the polish
  pass that followed (2026-11-16):
  - **Frame, from workspace-lab:** page row 52 and filter row 44 as one band;
    column heads and the pane's source strip as one 32 band; rows 36 with
    1px gaps; foot 36 (KeyBar or the note, never both). One left edge at 20
    in every region. Selected row is grey with the 3px ink bar and a 560
    title. The panes are split by a hairline, never a Card or a shadow.
  - **Columns:** glyph 16 · opening line `minmax(0,1fr)` · From 136
    (wide-only, from a 46rem list) · For 40 · Next 88 · Age 52, right
    aligned, mono 11 tabular. Waiting rows have no pill in Next (waiting is
    the default). Decided rows say it in two words with the kit's four
    marks: a clock and the day, a tick and "No time" or "Sent", the live
    dot and "Sending", the alert and "Didn't go".
  - **Pane:** `clamp(440px, 46cqi, 720px)` of the workspace. At 1440 it is
    567, so the beat brackets stand in the margin (they need 512 of content).
    At 1280 it is 493: the brackets sit under the lines and the title
    column keeps 282.
  - **Fold:** a workspace under 900, or a title column under 280 →
    Lineup. At the defaults that is a workspace under ~1070px. 1280 stays a
    table; a tablet and every phone get Lineup, with the same store and keys.
  - **Inside the pane:** strip 32 (glyph · "Adapted from @handle" · age ·
    kind at the end). Then 20 down to the idea (14/560), with what prompted
    it 12px under it as one block. 20 to each version: its header (glyph,
    "Draft for X" 12/560, the length in mono 11 tabular, the view switch at
    the end), then the post at 14/24, then the notices at 12, then the verbs
    (Approve sm 32 ink, Edit ghost, Discard as a hold at the far end).
    Versions are split by a hairline.
  - **Type:** post prose 14/24, the reading leading Marked up uses. Chrome
    stays on the kit's steps (15/600 page, 13 rows, 12 meta, 11 mono).
  - **Notices:** over the limit in ink (Approve is the press it should
    stop); the hook fallback, the fold and the twin muted, as
    `DraftCardNotice` is.
  - **Marks:** three beat brackets when `readBeats` finds them. Otherwise,
    while the draft is waiting, one handwritten note on the missing beat
    (proposed; on the control, default on). There is never a note on a
    decided draft.
- Still on the control panel: row title (opening line or idea), the
  missing-beat note (note or plain), the pane's floor, share and ceiling, and
  Desk's type.

## Round 2: the post is the thing on the right (2026-11-16)

The owner, on the picked Table: "Men posten står jo ikke på høyre side. Bør
vi se på en helt ny metode … Hvordan gjør X drafts?" The right pane showed
prose with a toggle to a preview; he wants the post itself there. Round 2
keeps Table's left side as picked and replaces only the right pane. Round 1
(1–3) stays selectable; round 2 is 4–6 on the picker.

### Round 2 › Picked

- **C · Feed** (owner, 2026-11-16: "So the feed, but we need to make it look
  more of the actual UI that they have"). This overrides round 2's rule that
  the post must not copy the platform's look: **inside the feed column** the
  post now reads as a real X post, and a LinkedIn version as a real LinkedIn
  post. Everything outside the column stays the kit: the pane, the strip
  above, the marks, the buttons, the table. parts/feed-pane.tsx; the
  platform styles live only in candidates.css's "C · Feed, picked" block.
- **X, as measured:** a 598 column with a hairline on each side and a small
  "For you | Following" strip. Each post has 12 / 16 padding, a 40 round
  avatar, a 12 gap, the name at 15/700, then @handle and "· now" in X's
  secondary grey, and "⋯" at the right. The body is 15/20 with real line
  breaks, and a blank line between paragraphs. The action row has reply,
  repost, like, views, and bookmark with share at the end, in secondary
  grey, 18.75 icons, and **no counts**. Posts are split by a hairline. A
  thread uses the grey connector from avatar to avatar. Colours track our
  theme (light: white / #0f1419 / #536471 / #eff3f4; dark: black / #e7e9ea /
  #71767b / #2f3336; blue #1d9bf0; thread line #cfd9de / #333639). The font
  is the system stack, not Inter. The icons are drawn here as paths of the
  same form, with no logo.
- **LinkedIn, as measured:** a card (radius 8, a 1px ring) on the grey feed
  (#f4f2ee light, black dark, card #1b1f23). It has a 48 avatar, the name at
  14/600, a headline from fixture data ("Founder at Fernwood Software"), and
  "now · globe". The body is 14/20, truncated with "…more" at the existing
  fold rule. The action bar is Like, Comment, Repost and Send, with no
  counts.
- **Neighbours:** one skeleton post above and one below, in the platform's
  look: an avatar circle, grey bars for the name and the text, and the real
  action row. There is never fake text.
- **The cut:** X's blue "Show more" (at the 280 limit) or LinkedIn's
  "…more" (at the fold), then a dashed line drawn for you only ("The feed
  cuts here"), then the rest at half strength. The fold notice under the
  column reads the same `feedCut`.
- **Editing in place:** the body is the field, set exactly like the post's
  text, with the caret at the end (X's blue caret). The focus ring is ours,
  round the post. **The counter is our small mono readout under the
  column, and only while editing.** X's ring belongs to its composer, not to
  a post in the feed, and the column must read as the feed. Everything we
  add stays outside it.
- **Width, picked: the pane takes the whole column** (option 1):
  598 + the 150 mark column + 10 + 40 = 798. At 1440 the list keeps 433 as
  Opening line, a marks cell (channel marks and the status mark, with the
  words to assistive tech) and Age, with a title column of 253. Scale-to-fit
  (option 2) was rejected: at 1440 it would draw the post at about 0.75,
  15px text at about 11px, which defeats "looks like the real thing" and
  makes editing at that size poor.
- **1280** folds into Lineup (the title column would be 93 beside a 798
  pane; the fold is a title column under 200, a workspace under ~1180). The
  open row there holds the 598 column and its margin at true size.
- **390:** Lineup, the column at full width, the marks under their lines.
- Rounds 1 and 2 (A and B) stay in the lab until /drafts moves.

Proposed with the pick: **14. The feed rendering** of a draft (X and
LinkedIn), read-only around an editable body, with the account's real name,
handle and headline from the connected channel (the lab uses fixture
values).

How a composer does it, and what we take from it: what you edit looks like
the post (the account line over the words, the words in place, a counter in
the corner). What we do not take: its UI, logo or colours. The object is the
kit's (`bg-kit-object`, `shadow-kit-object`, `rounded-kit-object`), the type
is the kit's, the platform is the existing small glyph.

| # | Layout | Axis | When it is the right choice | Its cost |
| --- | --- | --- | --- | --- |
| A | Post | the post object in the pane, edited in place, the fold drawn inside it, the marks outside in the margin | you want to read and edit the thing that will go out, as it will look, with Quincy's reading beside it | at 1440 the post is ~450 wide, not the feed's 598 (the list keeps 580); at 1280 the marks fall under the lines inside the post |
| B | Stage | the same post, centred on a grey recess at feed width, the marks in the stage margin | the post as a picture of itself, like the showcase | the recess spends 64px of a pane that is already narrower than the feed: the post is ~390 at 1440; true width plus marks needs a ~840 pane, which leaves the list a 100px title column |
| C | Feed | the post between two blank skeleton posts (no text, no counts), edited in place | judging whether the first line stops a scroll | two placeholders push the verbs a screen down; the blanks say "a feed" and nothing else |

What all three share (parts/post-pane.tsx):

- **One post object per channel version**, stacked, each with its glyph in
  the account line. **A thread is stacked posts joined by a 2px connector**
  under the account circle. A three-post thread whose middle post holds the
  number is bracketed one beat per post (fixture d22).
- **Edited in place.** A click on the words, E, or Edit puts the caret at
  the end of the words, which are now the real field (a textarea set as the
  post's body, growing with the text). The focus ring goes round the post,
  not a box inside it. One field per post of a thread. Cmd/Ctrl+Enter
  saves, Escape cancels, and focus goes back to Edit. The marks step away
  while the words move.
- **The fold inside the post**, from the same `feedCut` as round 1: the
  words the feed shows, "…more", a dashed muted line ("The feed cuts here"),
  then the rest in muted ink. On X, the only cut is the 280 limit.
- **The marks outside the post**: the beat brackets and the missing-beat
  note beside the lines they mean, in the margin column. The post sets
  `--kit-card-pad` to its own padding inside a `kit-stage` room, so the
  kit's BeatBracket and MarginNote stand past the post's edge with no new
  mark component. Under 32rem of room they sit under their lines, inside
  the post: at 1280 (pane 492) and at 390.
- **Under the post, one quiet row**: Approve (the ink action, A), Edit
  (ghost, E), and Discard as a hold at the far end. Decided versions get the
  status line, Give it a time and Post now, as in round 1.
- **The length is the post's counter**, in its bottom corner, the same
  place while reading and editing, one per post of a thread. The brief put
  it in the row under the post. In B the row wrapped (Approve, Edit, the
  length and Discard need ~430px; the column there is ~390), and a counter
  in the corner is where a composer keeps it.
- **No Marked up | Preview toggle, and no P**: the post is both.
- Every number is a control: what the list keeps (580), the feed width (X
  598, LinkedIn 555), the avatar (40), the mark column (150), the stage
  padding (32).
- **Pane and fold**: round 2's pane takes what the list leaves,
  `clamp(440px, 100cqi − 580px, 860px)`: 652 at 1440, 492 at 1280. The list
  keeps a title column of 283, so both stay a table. Under the fold (a
  workspace under ~1020) it is Lineup, whose open row unfolds into the same
  post at full width with the marks inline.

Proposed in round 2 (none is a server action):

11. **The post as the editor** (A, B, C), replacing the DraftCard and the
    round 1 sheet. It edits the same local text and approves with it, as
    today.
12. **A thread shape.** Nothing in lib/ holds a thread (a version is one
    body). The lab splits a body on a line that is only `---`. A real
    thread needs a decision in the schema (rows per post, or a separator
    the publisher understands).
13. **Beats across a thread**: one bracket per post when three posts make
    the three beats.

Recommendation for round 2: **A**. It is the owner's ask exactly (the post
on the right, edited where it stands), it keeps the Table's list readable
at 1440 and 1280, and it is the landing's own register: the product as the
picture, with the editor's marks on it. B is A with a recess that costs
width the pane does not have; C answers a real question (does the first
line stop a scroll) but spends the screen on placeholders, and could be a
one-press view of A later.

## On the table

| # | Layout | Axis | When it is the right choice | Its cost |
| --- | --- | --- | --- | --- |
| 1 | Table | toolbar (2 rows) + dense table + the open draft marked up in a wide pane | Drafts is a queue worked through daily by key, like Ideas; you scan by where it came from, what happens next and age; one pattern across both queues | the pane is a share of the screen: at 1440 the brackets stand in the margin, at 1280 they fall under the lines; under ~1050px of workspace it folds into Lineup |
| 2 | Desk | one draft at a time, large, centred; position "4 of 27" and the next four openings; A and the next is there | a draft is read like a proof, not scanned; 109 waiting is worked through, not browsed | no overview and no columns; filtering is a menu, not a glance; a decided draft is found by search or filter, not by eye |
| 3 | Lineup | one column grouped by what happens next (waiting · didn't go · approved, no time · going out by day · sent), the draft opening in place | the outcome is the question ("what is stuck, what goes Thursday"); the same page on every screen; it is Table's fold | no side-by-side reading; an open draft pushes the rest down; with today's data it is one group of 109 and four of nearly nothing |

## Controls (the undecided numbers)

| Control | Range | Default | Today |
| --- | --- | --- | --- |
| Row title | opening line · idea | opening line | the idea (`ListRow` two lines) |
| Unbracketed drafts | note · plain | note (proposed) | plain (no mark) |
| Table pane, min · share · max | 440–640 · 36–56cqi · 560–800 | 440 · 46 · 720 | — (a Stage under the list) |
| Desk reading type | 14 · 15 · 16 | 15/26 | 14/20 |
| State | live · loading · empty | live | |
| Queue | fixtures (27) · real (110) | fixtures | |

The pane default is chosen so the brackets reach the margin at 1440 and
1280 stays a table. The margin column needs 512px of content (32rem), so the
pane needs 552. At 1440 (workspace 1232) 46cqi is 567 and the title column
keeps 368. At 1280 (workspace 1072) it is 493 and the title column keeps
282. The first round's 520 floor folded 1280 into Lineup (title 239), which
the screenshots caught.

## Preview (2026-11-16, with the pick)

Each version's header holds a `Segmented size="xs"` view switch: **Marked up**
(the default) or **Preview**. P switches the open draft's versions. Marked up
stays the default because the brackets and the margin note need the margin,
and editing happens there: E from Preview goes back to Marked up and opens
the field. Preview is read-only. Approve and Discard stay under it.

Preview draws the post as it reads in its feed, in the kit and not in the
platform's UI. It is a lifted object (`bg-kit-object`, `shadow-kit-object`,
`rounded-kit-object`, 16 padding) with a 40px initials circle (the well and
the inset ring, as `Avatar` does), the name at 13/560, the handle and "not
posted" muted, and the body at 14/24 with its real line breaks. A number on
its own line stays on its own line, set as text, as the feed sets it. The
small platform glyph stays in the version header and is not repeated. No
counts of any kind: a post that has not gone out has none, and a fake one is
a vanity number.

The cut is drawn where the feed stops showing the post: the text, a muted
"…more", a dashed muted line with "The feed cuts here", then the rest in
muted ink, for you only. One function (`feedCut`, parts/feed-preview.tsx)
makes both the drawing and the "N characters sit behind the fold" notice, so
they cannot disagree.

- **LinkedIn:** it folds at the lib's 140 characters (CHANNEL_RULES: "roughly
  210 on desktop and nearer 140 in the app; the lower number is the safer")
  or after three lines, whichever comes first, backed up to a word boundary.
  The brief said about 210 characters; the lab keeps the lib's number so the
  notice the page already shows and the line agree. Changing it is one
  number in lib/post-length.ts.
- **X:** it has no fold, and a post renders whole. The only cut is the
  limit, when the text is over 280: "X stops at 280. The rest won't post",
  with the over-limit notice in ink under it.

## Every action /drafts has, and where it is in the lab

All of these are real server actions (app/(app)/drafts/actions.ts); the
lab answers the way each does and calls none.

| Action | Server | In the lab |
| --- | --- | --- |
| Approve one version, with the text as edited | `approveVersion` → next free slot, or `no-slot` / `slots-full` | ink button + A; the foot says where it went, with Undo (U); finishing a draft moves to the next waiting |
| Edit the text | local until Approve (the diff makes rule offers) | Edit + E; Textarea counting against the channel; Cmd/Ctrl+Enter saves, Escape cancels |
| Undo an approval / Reopen a failed post | `reopenVersion` (drops a queued or failed post) | Undo in the foot (U) and on the version; Reopen on a failed one |
| Discard a version (the piece goes with its last) | `discardVersion` | `HoldButton` at the row's far end; no key, no undo (the server has none) |
| Give it a time (approved before the slot existed) | `placeApprovedVersion` | button, the ink action when nothing else is |
| Post now | `postNow` (may fail with the platform's words) | button behind the AlertDialog; the ink action only when the version is stranded |
| Add to voice / Not now | `answerVoiceRule` | `QuincyAsks` under the approved version (the lab offers on the first edit; the server on the third in 30 days) |
| View the post | `sent.url` | link on a sent version |
| States | `GoingOut` (lib/going-out.ts) | writing, editing, scheduled, no-slot, slots-full, slot-came-later, sending, published, failed: all on fixtures |
| Notices | over the limit, hook-only fallback, the fold, identical twin | all four, under the text (draft-piece.tsx's words) |
| Empty, all decided, filtered empty, loading | | the Friend in each empty; DataList's static skeleton rows; a LiveDot line in Desk |

## Proposed (not on /drafts today)

None of these is a server action. Each is marked so it is not mistaken for
something the product already does.

1. **The saved post's sentence, highlighted.** The open draft shows the
   sentence of the saved post it leans on, with the one Highlight. Needs
   data: a draft keeps `adapted_from_url` and `_handle`, not the text, and
   no `source_item` id. 98 of 110 drafts would show it. Until then the lab
   shows "Read @handle's post", as every real draft would.
2. **A note where the beats are not.** `readBeats` brackets 0 of 110 live
   drafts, so a page that only marks clean three-beat posts never marks
   anything. The proposal: on a draft still waiting, one handwritten note
   naming the missing beat ("what happened? no number yet", "4 paragraphs.
   one too many?", "where's the middle beat?"). It never fills a beat in.
   Needs a rule in editor-marks.md beside "three or none".
3. **Keys A, E, P, U on Drafts.** Today the page binds j and k only.
4. **Newest first** inside each group. `getDrafts` is oldest first, so the
   first open draft today is from 24 August.
5. **Filters with counts** (Status, From, For) and search, from existing
   fields.
6. **The opening line as the row title** (control). Today the row is the
   idea (p50 145 characters, p90 228), which says what the post is about,
   not what the feed will show.
7. **"The oldest from 2 Nov" in the summary**, from `createdAt`.
8. **Lineup's day groups** read the day out of `goingOut`, which is a
   formatted string. Building it for real wants the day carried as data.
9. **Desk's "Up next"**: the next four openings under the draft.
10. **The feed preview** (Marked up | Preview, P). It is read-only and draws
    from the fields a version already has. The account's display name and
    handle need data: the lab uses the shell's stand-in account. The real
    page would read the connected channel's name and handle.

## Not built, and why

- **Approve all / bulk approve.** Approval is per version on purpose
  (lib/drafts.ts): approving writing you have not read.
- **Later / snooze.** No column holds it (the same reason Ideas has no L).
- **Pick a time.** Approve takes the next free slot the person made; the
  server has no "this time" path. Times are Lineup's.
- **Rewrite / steer.** It belongs upstream on Ideas (page.tsx's header).
- **A key for Discard or Post now.** Discard is a hold (removing.md); Post
  now is irreversible and keeps its confirmation.
- **A metrics strip.** The summary is one sentence about what is still a
  decision, against nothing invented.

## The review of this diff, and what changed because of it

- 1280 folded into Lineup (the fold maths used the real column widths). The
  pane floor went 520 → 440, Next 100 → 88 and For 44 → 40.
- The foot note was a second `role="status"`, and each decided version held a
  third. The note is now said once through the workspace's Announcer
  ("… Press U to undo."), and the version status lines are plain text.
- `dismissNotice` was a new function each render, which would have
  restarted the foot's timer on every render. It is now stable.
- Save, Cancel and Escape unmounted the field and dropped focus to the
  body. Focus now goes back to Edit.
- The fold cut mid-word ("say…more | ing so."). It now backs up to a space.
- "Story" showed twice (strip and title block), and "Adapted from @handle"
  showed twice (strip and body). Each is now said once.
- The fold, hook and twin notices were in ink. They are now muted; only
  over the limit is ink.
- The idea and what prompted it were 20 apart, read as two groups. They are
  now one block, 12 apart.
- The approve note ended "…attention.”." It now drops the quoted stop.
- The margin note on a sent or scheduled draft was moot. It now shows only
  while the draft is waiting.
- Kept: `Discard` is the kit `HoldButton` at its one size (36) beside sm
  (32) buttons. Fixing that is a kit change (below), not a lab one.

## What moving the pick into /drafts asks of the kit

No kit file changed in this lab; every control is the promoted workspace
set (Toolbar, FilterMenu, DataList, Panel, KeyBar, FootBar, StatusPill,
SearchField, Announcer, WorkspacePage).

- **A flat DraftCard.** The open draft is `DraftCard`'s parts without the
  Card (a pane is not a Card per workspace.md): `DraftCard look="flat"`, or
  the lab's `DraftSheet`. The margin room works outside a Card when the
  prose sets `--kit-card-pad: 0` inside a `kit-stage` container.
- **A reading step.** Post prose at 14/24 (Marked up's leading), and 15/26
  if Desk is picked: `--text-kit-read`.
- **StatusPill words for drafts.** The four marks fit (clock: a day, tick:
  no time / sent, dot: sending, alert: didn't go); the words are passed as
  children. A `scheduled` / `sent` status would name them.
- **SourceGlyph has no mark for `notes`** (one live draft). The lab draws
  the pen.
- **`HoldButton size="sm"`** (32), so Discard lines up with Approve and Edit
  in a dense pane.
- **`FeedPreview`** (parts/feed-preview.tsx) into `components/quincy`, with
  `feedCut` beside `splitAtFold` in lib/post-length.ts, and the fold notice
  in draft-piece.tsx reading it.

## Found while building

- `SourceGlyph id="notes"` renders nothing; one live draft has it.
- 0 of 110 live drafts bracket, so `DraftCard` on /drafts today shows no
  mark on any real draft.
- Zero scheduled posts with two X slots and 109 waiting: the bottleneck is
  approval, not placement.
- The edit stays local until Approve (as today), so a reload loses it.
  `saveVersionBody` exists (Studio uses it) but would erase the diff that
  rule offers read.

## Recommendation (the lab author's, for the owner to overrule)

Table, with Lineup as its fold. The queue is 109 deep and 98 of it came
from saved posts, so scanning and filtering by where it came from is the
daily job, and it is the same pattern the owner picked for Ideas. The wider
pane (46cqi) gives the draft the reading room Desk argues for at 1440.
Desk is the stronger reader and could come back as a focus view on the
same store; Lineup's outcome axis is right for Lineup itself, and is thin on
today's data.

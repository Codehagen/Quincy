# Numbers as a dashboard — decided from /prototypes/numbers-lab

The decision log for this lab. The owner fills in **Picked**; the rest is
what was on the table. When it is filled in, copy the result into
`docs/design/decisions.md` (it reopens a "Never" there, see below), rebuild
/numbers on it, and delete this folder (and its line in `.oxlintrc.json`'s
showcase override).

The brief (2026-11-16): "La oss også gjøre det på numbers på samme måte. Vi
trenger det mer som en dashboard for numbers." Build Numbers the way Ideas,
Drafts and Lineup were rebuilt: several directions behind a picker, decided
from real data. The real `/numbers` page is untouched.

Route: `/prototypes/numbers-lab` (`?v=1..3` picks the direction, `?clean`
hides the picker and the panel, `?state=loading|empty|disconnected|thin|failed`,
`?period=7|30|90`, `?data=yours` reads the signed-in account's own rows).
It renders at true size in the real app shell. Keys: 1–3 switch
directions; in Table, j k move.

## The reading

**Dashboard form, vision content:** a dense surface you scan in one glance
(period switch, tiles, panels), where every number is a sentence against
your own usual, Depth (replies, who came back) comes before Volume (posts,
views per post), and there is no follower count.

This reopens two "Never" rows in `docs/design/decisions.md` ("grids of
tiles in the app", "a metrics dashboard: tiles of counts") on purpose.
The tiles here are light objects that say a sentence, not dark shouted
counts; if A is picked, the decision row must say why the rule moved.

### Left out on purpose

- **Follower count and follower growth.** docs/vision.md: a vanity number
  with a story attached. Not on any tile, chart or sentence.
- **A bare total of views.** Views appear per post (a median) and per post
  against your median, never as "38,400 views this month".
- **Engagement rate, likes as a headline.** Likes, bookmarks and reposts are
  in the open post (B) as a line of facts, never a tile: they are the
  cheapest signal and the one that demos best.
- **Comparison to other accounts, benchmarks, "top 10%".** Every baseline
  is the person's own.
- **Colour for good and bad.** Above or below your usual is position and
  words. Blue stays the pen (the beat brackets in B).
- **Charts of Quincy's own volume (drafts per week) as a chart.** "What I
  did" is a list with the usual beside each line; a chart of items per
  week is the dashboard the vision warns against.

## Real numbers (read-only aggregates, 2026-11-16)

One account has data. Every figure is from SELECTs only (no writes, no X
call).

| Fact | Live | What it decides |
| --- | --- | --- |
| `post_metric` | 1,976 readings of 90 posts, Aug 29 – Nov 16, every day of the last 30 | a daily series exists: tiles, trends and "how it climbed" are real |
| Readings with no `source_item` | 1,607 of 1,976 | most measured posts have **no text** in Quincy (the corpus import stopped Aug 20); the real view says "first measured …" instead of a hook |
| Posts first measured on the first day | 41 | already out when readings began: no publish day, so they count toward the median and not toward a week |
| Views per post (latest reading) | p10 364, p25 462, **median 665**, max 21,366 | fixtures: lognormal around 700, one 21K post |
| Replies per post | p25 0, **median 1**, p75 2, max 11; 41 of 90 with none; 144 in all | "replies" is the Depth tile; the numbers are small, so the sentence says "a week" |
| Likes / bookmarks / reposts, median | 5 / 1 / 0 | too small to headline; a line in the open post |
| Share of final views on day 1 / 2 / 7 | 84% / 95% / 98% | "How it climbed" is short; Quincy can judge a post the next morning |
| Posts per week since mid-Sept | 11, 9, 5, 3, 3, 2, 5, 7, 2, 1, 1 | cadence median about 3; fixtures repeat this shape |
| Last 7 / 30 / 90 days | 2 / 16 / 49 new posts; median views 674 / 760 / 665 | the period switch has something in each |
| `source_item` x (corpus) | 99 posts, Nov 2025 – Aug 2026, median 1,067, max 69,600 | the old frozen median /numbers uses today |
| Bookmarks read (`x-bookmark`) | 150 from 132 handles; 15 handles twice or more | "Read" in What I did; the people *you* keep reading, not who reads you |
| Drafts / approved | 110 / 1; ~10 drafted a week | "You approved 1 of 110" is the honest Quincy line |
| `scheduled_post` | 0 rows | "Went out" counts `usage_event` `x:post` (10 in Aug), nothing since |
| `usage_event` cost | ~$3.30 a week (x:bookmark-read $24.51, x:metrics $9.88, models $2.92 in all) | "Cost" in What I did, against the usual week |
| Who replied | **not stored anywhere** | the people panel and "Came back" are proposed |

## On the table

| | Direction | Axis | Right when | Cost |
| --- | --- | --- | --- | --- |
| 1 | **Dashboard** | the glance: period → tiles → panels | the owner opens Numbers to ask "how is it going?" and wants the answer in one look | reopens the tile rule; a single post is shallow here, so the What-worked rows open it in Table |
| 2 | **Table** | the post: a dense list with baseline columns, the open post beside it | Numbers is worked like Ideas and Drafts: find the post, see why it worked, draft another | no single line says how the month went; Depth is one post at a time |
| 3 | **Weekly read** | the week: a note Quincy writes, charts in the margin | Quincy is staff; numbers arrive as a weekly note that ends on a choice | no comparison across periods; you read, you don't scan |

### What each shows

- **1 · Dashboard.** Toolbar: name, "Against your own median. Read this
  morning at 06:00.", period 7 / 30 / 90 days. Four tiles, Depth first:
  Replies, Came back (people who replied now and before), Posts, Views per
  post. Each: the value, one sentence against the usual ("Under your usual
  19 in 30 days."; "1.1× your median post, 662."), a 16-week sparkline with
  the period in ink. A tile is a toggle button: it picks what the trend
  panel draws. Panels: the picked measure per week (columns, usual line,
  hover and arrow-key readout, "As a table" twin), People who keep showing
  up (eight-week dots, "Not answered", the one ink action "Draft 2
  replies"), What worked (posts ranked, a bar from the median line on a
  log2 scale, "3 beats" when `readBeats` finds them, a row opens it in
  Table), What I did (read, drafted, approved, went out, cost, each with
  "usually N"). Phone: tiles 2-up, panels stacked.
- **2 · Table.** Filters: Against your median (every / above / below /
  3× or more, with counts), Order (newest / most views). Columns: Post, Out
  (wide only), Views, Against your median (the bar, wide only), ×, Replies.
  The open post: the text with the three beat brackets (or plain, with
  "No number on its own line, so I can't name its beats"), Views and Replies
  as figures with their baselines, a line of likes / bookmarks / reposts,
  How it climbed (day-by-day line, a slider for keyboard and pointer), Who
  replied, and "Draft another like it". Under 900px of workspace the pane
  folds and a row opens in place.
- **3 · Weekly read.** A week stepper replaces the period. Four
  paragraphs in first person: Who showed up, What worked, How much, What I
  did, numbers in bold inline. Margin (in the well): eight-week dots per
  person, each post's bar against the median, posts a week, the work list.
  It ends on one question and two buttons ("Draft it" / "Not this week").

### States (every direction)

- **Loading:** a LiveDot line ("Reading your numbers. This usually takes a
  few seconds.") and static bars on the same grid. The brief asked for
  skeletons; states.md says Skeleton is never a loading state, so the
  LiveDot line carries the state and the bars only hold the layout (no
  shimmer). The owner should settle which rule wins.
- **Empty:** the friend, centred. Two of them: "Nothing published yet."
  (connected, no posts; Go to Drafts) and "No channel connected." (Connect
  X, the ink action).
- **Too little data:** two weeks of history. Every baseline says "Needs 3
  weeks before I can say what's usual." in place of a number; the best
  posts rank by raw views with "No median yet". The threshold is a control.
- **Failed read:** "I couldn't read X this morning. These are yesterday's
  numbers; I'll try again at 06:00." with "Check the connection". No retry
  button: a retry is an X read, and it would need a ceiling and a cooldown
  (AGENTS.md, Money).
- **Yours:** `?data=yours` with a session reads the account's rows through
  the same arithmetic. An account with no channel or no posts shows the
  empty state; nothing falls back to a fixture.

### Proposed (needs new data)

- **Who replied** (Came back tile, People panel, Who replied in B, the first
  paragraph of C). Needs the replies themselves: one read of each recent
  post's replies, in the morning refresh, metered as its own label
  (`x:replies`), inside the existing per-user page ceiling and the 20-hour
  cooldown. Probably a `post_reply` table (post, author handle, day,
  answered).
- **Answered or not.** Needs to know whether the person replied back
  (their own reply in the same conversation).
- **Draft replies** (the ink action in A, the closing choice in C) as a
  real spend: a ceiling per run and a cooldown, before it exists.
- **Text for posts the import has not caught up with:** 1,607 of 1,976
  readings have none. Either the refresh stores the text it already
  receives, or the import runs on the same schedule.
- **Publish day:** today it is the first morning a post was measured. The
  refresh could store `created_at` from X.
- **"Went out" through Quincy:** `scheduled_post` is empty; the count uses
  `usage_event` `x:post`, which is right only while nothing else posts.

### Charts

Plain SVG and HTML, no library (the repo has none, and every chart is one
series). One palette, emphasis only: ink for the period or the open post,
the faint mark for context weeks, muted ink for the usual line, labelled.
The faint mark is 2.4:1 (under the 3:1 a mark wants alone), so every
chart that uses it has its values in words, a readout or a table twin.
No hue: blue is the pen. Columns ≤ 24 wide with a rounded data end; lines
2px, round caps. Log2 for "against your median" (0.25× to 32×), linear on
the control. Tokens re-point in dark mode, so no `dark:` variants.

## Controls

| Control | Default | What it decides |
| --- | --- | --- |
| Data | fixtures | fixtures, or yours (signed in) |
| State | live | live, loading, empty, disconnected, thin, failed |
| Baseline after | 3 weeks | weeks behind the period before a usual is stated |
| Tile order | depth | Depth first (vision) or Volume first |
| Tile trend | line | sparkline as a line or columns |
| What worked, rows | 5 | 3–8 |
| Median bars | log | log2 or linear |
| Pane min / share / max | 400 / 40cqi / 560 | B's open-post pane |
| Margin | 200 | C's chart column |

## Picked

- **1 · Dashboard is the page, and 2 · Table is what it opens** (owner,
  2026-11-16: "Så jeg liker Dashboard og table."). 3 · Weekly read stays in
  the lab until /numbers moves; its "Open it" uses the same hand-off.
- The tile rule moved for Numbers only: `docs/design/decisions.md`, the two
  "Never" rows (grids of tiles, a metrics dashboard), amended with his
  words. No other page gets tiles.

### The flow

- **A tile opens Table filtered to its measure.** Replies → Show "Got
  replies", Order "Most replies first". Came back → Show "Someone came
  back". Posts → every post, newest first. Views per post → every post,
  most views first. (`TABLE_FOR` in layouts/types.ts.)
- **A "What worked" row opens Table with that post open** in the pane
  (Order "Most views first", so the row sits near the top).
- **The URL holds it**: `?view=table&post=…&show=…&order=…&against=…`,
  with `period` beside it. Entering Table pushes a history entry, so a
  link opens the same Table and the browser's Back and Forward work.
- **The way back**: Esc, the crumb "Numbers / Posts" in the toolbar (the
  page's name, so the crumb reads as a path rather than a view switch),
  or Back. Focus lands on the tile or row that opened Table. On a phone,
  Esc first closes an open post, then goes back. The KeyBar says "Esc
  Dashboard".
- **The trend panel picks its own measure** (a quiet menu in its header),
  since the tiles now open Table instead of driving the chart.

### Values the page settles on

- **Frame:** toolbar 52 (name, "Against your own median. Read this morning
  at 06:00.", period 7 / 30 / 90 days, default 30). The grid pads 20, gaps
  12. Tiles 4-up from a 60rem workspace, 2-up below; panels 3 columns
  (trend and What worked span 2) from 60rem, stacked below.
- **Tile:** an object on the ground (`rounded-kit-control`, object
  shadow), 20 × 12 padding. Name 12/560 with "Depth" or "Volume" and a
  chevron at the end; value as the figure (18/600); one sentence against
  the usual at 12, two lines held; a 28px sparkline of 16 weeks, the
  period in ink, the weeks before it in the faint mark, the usual as a
  muted line. Hover is `kit-row-hover`, press scales; every tile is a
  button with "Open the posts …" for assistive tech.
- **Order:** Depth first (Replies, Came back), then Volume (Posts, Views
  per post). Baselines are stated after 3 weeks; before that, "Needs 3
  weeks".
- **Panels:** heads 13/560 at a 28 minimum, so a head with a control and
  a head without one align. Trend: columns ≤ 24, usual line labelled,
  arrow-key readout, "As a table". What worked: 5 rows on a log2 scale
  (0.25× to 32×) with "× median" and replies. What I did: read, drafted,
  approved, went out, cost, each with "usually N".
- **Table:** filters Show, Against your median, Order (with counts) and
  Clear; columns Post · Out (wide only) · Views · Against your median
  (wide only) · × median · Replies. The pane is clamp(400px, 40cqi,
  560px); under 900 it folds and a row opens in place. "Who replied" names
  the people and counts first-timers, so it never contradicts the replies
  figure.
- **Still flagged, not decided:** loading as static bars plus a LiveDot
  line, against states.md's "Skeleton is never a loading state". The
  owner settles it.

### Review fixes made with the pick (2026-11-16)

- The trend's measure moved from the tiles to a header menu: tiles now
  open Table, and one control should do one thing.
- "Who replied" said "Nobody yet." on posts with replies (the repliers were
  first-timers); it now counts them.
- Table's filter row overflowed sideways at 390; the chips now wrap in two
  groups.
- A tap on the already-open row did nothing in the folded Table; a tap or
  Enter on it now opens the post.
- Browser Back lost focus; it now lands on what opened Table.
- "× median" wrapped onto two lines in What worked; the column is 4rem.
- The climb chart's area wash read as a grey block on near-flat lines; it
  is a line now.
- The tile's chevron is always shown (hover may move it, never reveal
  it), so the label no longer shifts.
- The KeyBar no longer lists the lab's 1–3 keys.

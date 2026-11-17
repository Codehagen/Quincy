# States: working, empty, refused, failed

Quincy says what is happening in words, in the object where the result will
land. No spinners, no skeleton shimmer, no banners, no toasts.

## Working (loading)

The pattern is the friend in its working state beside words that say what
Quincy is doing and how long it usually takes. There is no Working
component: the two pieces are the whole pattern.

- **Work in progress is the friend's working state plus words, never a
  pulsing green dot.** `listening` while it takes something in, `reading`
  while it reads, `writing` while it drafts (mascot.md › The nine states).
  When the work ends the friend hands back to `idle` or the line is replaced
  by the result. Green is not a status colour in the app; "connected" is
  said in words.
  Why: a pulsing green "live" dot is the stock status marker of every
  product; the friend's states exist to say that Quincy is working, and
  they are the product's own sign.
  <!-- 2026-11-17: "fjern den grønne blinken" … "Men er ikke denne ai slop? LiveDot pulse" … "Jeg ønsker det samme som du anbefaler" -->
  Check: ESLint `quincy-design/no-live-pulse` (README › Checks).

```tsx
// Correct — in the object where the angles will appear
<Text as="div" role="status" className="flex items-center gap-2">
  <Friend size={20} state="reading" />
  Reading it. Angles usually land within a minute.
</Text>

// Incorrect — the stock live dot
<LiveDot pulse>Reading it. Angles usually land within a minute.</LiveDot>

// Incorrect — Skeleton is filler for content nobody needs to read, never a loading state
<SkeletonLines widths={["86%", "70%", "78%"]} />
```

- `role="status"` on the line, so the words are announced once; the friend
  stays decorative (`aria-hidden`).
- The state lasts only while the work is actually running. When it
  finishes, the line is replaced by the result (Arrive), not by "Done".
- A button that started the work shows its own `pendingLabel` (buttons.md);
  the working line is for work that outlives the press.
- A route-level `<Suspense>` fallback holds the page's frame (below).

### A page while its reads land

**A page's `<Suspense>` fallback is the page's own frame at its final size:
the title, and on a workspace the toolbars, the column heads over
`DataList status="loading"` (eight static rows on the real grid) and the
open item's pane. Where the page has no list, the title alone, or this
working line when the wait is Quincy reading (Numbers). Never `null`, never
a Skeleton for prose, never a shimmer.**

Why: on a client navigation the layout's boundary is already shown, so the
page's own boundary is what the person sees first. With `null` the main
area went blank and the whole page popped in; with no boundary at all the
old page held until every read was back. The frame opens at once and the
data lands in place, so nothing moves. DataList's loading rows are the
kit's one loading shape, static, and on the same grid as the rows that
replace them.
<!-- 2026-11-17: the owner asked for skeletons, done as best practice, across every page -->

```tsx
// Correct — a workspace: its frame, extracted next to it (components/drafts/drafts-loading.tsx)
<Suspense fallback={<DraftsLoading />}><Drafts /></Suspense>

// Correct — a KitPage with no list: the title (and a summary that does not depend on the data)
<Suspense fallback={<KitPage title="Credits" summary={SUMMARY}>{null}</KitPage>}><Credits /></Suspense>

// Incorrect — the main area blank until the data is back, then the page pops in
<Suspense><Drafts /></Suspense>
```

- The frame is the page's, not a copy of it: build it from the
  workspace's fold classes, columns and keys, so the two cannot drift
  apart. The fold is CSS (workspace.md), so the frame needs no script.
- A frame says nothing it cannot know: no counts, no dates, no summary
  that depends on the data. Lineup's day heads are blank for that reason.
- A page whose title is its data (a channel, a rhythm) keeps no fallback
  of its own until the title can be read from the route.

## Empty

The kit's `EmptyState`: the friend, one bold sentence saying nothing is
waiting, a grey continuation saying what to do, and at most one control to
do it (quincy-chat.md, "EmptyState").

**An empty state stands in the middle of the region it replaces,
horizontally and vertically. The friend sits above the title, and the
title, the text and the action are centred under it.**

Why: it is best practice. A centred empty state reads as the page's one
message. On the rows' left edge, under the heads, it reads as a row that
is missing.
<!-- 2026-11-16, the owner: "For the empty state it should be in the middle of the screen as a best practice." -->

The region is what the empty state stands in for: the list or table pane,
the space under a table's column heads (they stay), or the whole workspace
when there is nothing at all. `EmptyState` centres its own content;
`EmptyRegion` centres it in the region, both ways.

```tsx
// Correct — a table that a filter emptied: DataList puts `empty` in an EmptyRegion itself
<DataList … empty={<EmptyState frame="none" bold="No ideas match." rest="Clear a filter.">
  <Button size="xs" onClick={() => { clearFilters(); focusRestoredDataList() }}>Clear filters</Button>
</EmptyState>} />

// Correct — nothing at all: the region is the whole workspace under the toolbar
<EmptyRegion edge="rule">
  <EmptyState frame="none" bold="Nothing to work on yet." rest="Add a source and I'll bring you the material.">
    <ButtonLink href="/sources">Add a source</ButtonLink>
  </EmptyState>
</EmptyRegion>

// Incorrect — top-left under the heads, padded like a row
<div className="px-kit-group py-kit-group"><EmptyState frame="none" bold="No ideas match." /></div>
```

- On a page (KitPage), the region is the object the list would be:
  `EmptyState` in its Card, the content centred in it.
- The action keeps its 44px hit area; nothing about centring changes it.
- When the action takes the empty state away (Clear filters brings the
  rows back), its button goes with it. Move focus on purpose:
  `focusRestoredDataList()` puts it on the open row, or the first row.

## Refused or failed

When Quincy cannot do what was asked (no channel connected, out of credit,
nothing usable in the recording), it says so where the action was:

- **One sentence in ink** (`Text`), first person, saying why: "I can't draft
  for LinkedIn yet." A `Muted` continuation may say what fixes it.
- **The way out beside it**: a ButtonLink ("Connect LinkedIn", "See plans") or
  a quiet Button ("Try again"). Never only the complaint.
- **`role="status"`** on the container, so it is announced without stealing
  focus. `role="alert"` only if the person's own work is at risk.
- **No red.** `--kit-danger` labels destructive actions only. A refusal is
  not destruction, and red text reads as "something broke". No icon, no fill,
  no banner, no `bg-kit-danger-tint` (that is HoldButton's fill and nothing
  else).
- It replaces the action's row while it stands, and clears the moment the
  person tries again.

```tsx
// Correct
<div role="status" className="flex flex-col gap-kit-related">
  <Text>I can't draft for LinkedIn yet. <Muted>Connect it and I'll write this one first.</Muted></Text>
  <div><ButtonLink href="/channels">Connect LinkedIn</ButtonLink></div>
</div>

// Incorrect — a red banner for something that is not destructive
<div className="rounded-kit-control bg-kit-danger-tint p-3 text-kit-danger">Error: channel not connected.</div>
```

A field's own error is different: it sits under the field (forms.md).

## Not in the kit

A recorder (record, timer, stop) is screen-specific and is not a kit
component yet. Build it on the page from Button, LiveDot and Mono, following
the toggle-button rule (buttons.md). It moves into the kit when a second
page needs one.

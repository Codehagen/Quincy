# States: working, empty, refused, failed

Quincy says what is happening in words, in the object where the result will
land. No spinners, no skeleton shimmer, no banners, no toasts.

## Working (loading)

The pattern is a pulsing `LiveDot` with words that say what Quincy is doing
and how long it usually takes. There is no Working component: the two pieces
are the whole pattern.

```tsx
// Correct — in the object where the angles will appear
<Text as="div" role="status">
  <LiveDot pulse>Reading it. Angles usually land within a minute.</LiveDot>
</Text>

// Incorrect — Skeleton is filler for content nobody needs to read, never a loading state
<SkeletonLines widths={["86%", "70%", "78%"]} />
```

- `role="status"` on the line, so the words are announced once.
- `pulse` only while it is actually running. When it finishes, the line is
  replaced by the result (Arrive), not by "Done".
- A button that started the work shows its own `pendingLabel` (buttons.md);
  the LiveDot line is for work that outlives the press.
- A route-level `<Suspense>` fallback is `null` or this line. Never bars.

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

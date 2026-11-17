# Quincy cards: drafts and results

The draft family from plans/030: `DraftCard` (#1), `ScheduledPost` (#4),
`SlotCell` (#6), and the result family, `PostResult` + `AgainstMedian` (#7),
from `@/components/quincy`. Kit only. Live at `/prototypes/kit#quincy-drafts`.
(The results section was quincy-results.md until 2026-11-16.)

Every card takes the real row type from `lib/`, never a copy. "When does it go
out" is said by one helper, `lib/going-out.ts`: `goingOutOfVersion` /
`goingOutOfEntry` / `goingOutOfPreview` read a `Version`, an `Entry` or a chat
`ApprovalPreview` into one `GoingOut` union, and `goingOutLine(g, channel)`
says it, with the time apart for Mono. Never write that sentence by hand: the
three hand-written copies drifted, and one said "Approved" for writing that
had no time.

## The open draft is the post, in the feed

- **An open draft is shown as the post itself, in the platform's own look,
  and edited where it stands.** On /drafts and /lineup the open draft is
  drawn in a feed column (`components/drafts/feed`): X at its real 598px
  column, LinkedIn as its card, system type and the platform's own icon
  shapes, blank skeleton neighbours, the fold drawn where the feed cuts.
  Never engagement counts, never fake neighbours' text. Everything outside
  the column stays kit: Quincy's beat brackets and notes in the margin, the
  verbs, the pane. No separate Marked up / Preview toggle: the post is the
  editor (E puts the caret in it).
  Why: the owner wants to see the post the way the feed shows it, not
  prose with a preview beside it.
  <!-- 2026-11-16: "Men posten står jo ikke på høyre side … Hvordan gjør X drafts?" … "So the feed, but we need to make it look more of the actual UI that they have" -->

## DraftCard

One channel version of a draft, up to Approve and after. Use it wherever a
`Version` is shown: Drafts, the Studio chat, the editor. A list of pieces is
ListRows that open a DraftCard; the card is never a row.

Parts: `DraftCard` (root: `version`, `session`, `onApprove`, `onReopen`,
`onDiscard`, `onSave`, `isAction`, `editing`/`defaultEditing`/`onEditingChange`)
> `DraftCardHeader` (`initials`, `source`, `as`) > `DraftCardBody` >
`DraftCardNotice` (optional) > `DraftCardActions` (`opening`, `note`). A
read-only snapshot (chat history) is the root, Header and Body, no Actions.

- **Beats are read, never guessed.** The body brackets did / happened / meant
  only when `readBeats` (`lib/draft-beats.ts`) finds exactly three paragraphs
  with a line that is only a number in the middle one. Otherwise the
  paragraphs render plain. Most real bodies today are opinion posts with no
  number on its own line, and brackets on them would invent a "happened".
- **A DraftCard's beat brackets sit in the margin when the card's container
  has room (container query ≥32rem) and fall back to labels under the lines
  when narrow; the text never shifts.**
  Why: the owner accepted the margin brackets as they stand in the hero
  picture. The width comes from the card's own room (`DRAFT_ROOM`), never
  from the marks, so the lines do not reflow when the brackets appear
  (editor-marks.md, "A draft card is its own room").
  <!-- 2026-11-16: "rett de 2" -->
- **Approve is the action only when the page says so.** Pass `isAction={false}` when
  the precedence in actions.md gives the action to something else (a
  recorder underway, a second DraftCard on the page).
- **Discard is a HoldButton.** A version is the person's own writing and
  the only copy, so removing.md gives it a hold. It sits at the far end of
  the row, away from Approve.
- **The card holds no "approved" flag.** The parent updates `version` after
  the write; `session` carries what the page has not re-read yet
  (`placement` from the approval, `posted` from Post now).
- **Focus follows the swap** (Approve → Undo → Approve, Save/Cancel → Edit). Built in.

States, from `GoingOut`: `writing` (Approve · Edit · Discard) · editing (Save ·
Cancel, length counting against the channel ceiling) · `scheduled` ("Goes out
Thu 07:45." · Undo) · `no-slot` / `slots-full` / `slot-came-later` (muted
reason · Undo) · `approved` (chat, placement unknown) · `sending` (pulsing
LiveDot, no button) · `published` ("Posted 09:12." · View the post) ·
`failed` (the platform's words in ink · Reopen).

```tsx
// Correct — the page decides the action; the card follows the row
<DraftCard version={v} session={{ placement }} isAction={!recording} onApprove={approve} onReopen={reopen} onDiscard={discard} onSave={save}>
  <DraftCardHeader initials="C" source={draft.from.sourceLabel} />
  <DraftCardBody />
  <DraftCardActions opening={next?.label} />
</DraftCard>

// Incorrect — a sentence by hand from a local flag, and brackets on a guess
<Text>{approved ? "Approved" : ""}</Text>
<BeatBracket beat="happened"><Text>{paragraphs[1]}</Text></BeatBracket>
```

Not in the card: **Post now.** It is irreversible (a post in the person's name,
no unsend), so it needs a confirmation, and the kit has no dialog. It stays on
the old pane until the kit has one. `DraftCardActions note` (why this hour,
lab 28) needs a reason the data does not hold; leave it out.

## ScheduledPost

One approved version with a time, in the week. Use it in a `List` under a
`ListHeading` per day. A slot with nothing in it is a `SlotCell`.

Props: `entry` (`Entry`, lib/lineup.ts), `openSlots`, `nextDay`, `onMove`
(`ScheduledPostMove`, the shape of lineup's `MoveTarget`), `onUnschedule`
(may return a promise; the caller says what a rejection means), `note`,
`finalFocus`, `takeFocus`.

- **The time is the control.** While `queued` it opens a Menu: Move to each
  open slot, Same time tomorrow, then Back to Drafts. Once `sending` or
  `published` the time is a record, so it is plain Mono. A `failed` post
  with `onUnschedule` keeps one command on its time, Back to Drafts: the
  sweep never retries it, so moving it would not help.
- `note` is a muted line under the row. It defaults to the error on a
  `sending` post ("check the account before you try again"); pass `null`
  to say nothing.
- It is not a ListRow: a ListRow is a button, and a button cannot hold a Menu.
- A move or Back to Drafts removes the trigger: pass `finalFocus` (the
  UndoBar, or the moved row with `takeFocus`). menus.md ("a command that removes its own trigger").
- Failed is ink, "Not sent", with the platform's words as the second line.
  Never red.

```tsx
// Correct
<List><ListHeading>Thursday</ListHeading><ScheduledPost entry={e} openSlots={open} nextDay={fri} onMove={move} onUnschedule={unschedule} finalFocus={undoRef} /></List>

// Incorrect — a Button inside a ListRow
<ListRow meta={<Button onClick={move}>07:45</Button>}>{e.opening}</ListRow>
```

## SlotCell

One standing slot in the week: hour, channel, what is in it. A ListRow, so
pressing it picks the slot (fill it, open the composer).

Props: `slot` (`Slot`, lib/lineup.ts), `timing` `upcoming` (default) | `next`
| `past`, `filledTitle` (the filling `Entry.opening`), `median`, `selected`,
`onSelect`. `slotState(slot, timing)` gives the state.

```
What is the slot?
 ├── timing="past" → filled: its title, disabled · empty: "Went unused", disabled
 ├── filledBy set  → filledTitle (two lines)
 ├── timing="next" → "Open, and next", the time in ink
 └── default       → "Open"
```

**Data gap: your median at that hour.** `Slot` has no median and nothing in
lib/ groups posts by hour. `median` (`SlotMedian`: views, posts, overall) is
typed and optional; leave it out until that reader exists. Under 3 posts it is
not said: one post is not a median.

```tsx
// Correct
<SlotCell slot={s} timing="next" onSelect={() => compose(s.id)} />

// Incorrect — a best-time number from nowhere
<ListRow description="Best time to post!">Open</ListRow>
```

## PostResult and AgainstMedian

`PostResult` is a published post against the person's own median: header,
hook, the views as a figure on its own line, `AgainstMedian` under it, replies
and the link. Props: `post` (`ScoredPost`, lib/numbers.ts), `median`
(`NumbersView.median`), `channelLabel`, `initials`, `as`. Server-safe.

`AgainstMedian` is the one line every number needs. Props: `value`, `median`,
`person` `you` (default) | `me` (inside the person's own post), `say`
`multiple` (default, "1.8× your median.") | `median` ("Your median is 6.",
under a figure that already is the value), `at` ("at 48 hours"), `as`.
Within ±5% it says "About your median.", and with no median it says nothing
has been measured instead of dividing by zero. The words come from
`lib/against-median.ts`.

```tsx
// Correct
<Text variant="figure">3,940 views</Text>
<AgainstMedian value={3940} median={1210} />

// Incorrect — a total with nothing to stand against, and a follower count
<Text variant="figure">3,940 views · 12.4k followers</Text>
```

`ScoredPost` has no beats and no channel: PostResult shows the hook, not lab
30's story, and `channelLabel` is a prop. A clipped outlier is a chart state.

## A before-and-after figure

`isFigureLine` (`lib/draft-beats.ts`) accepts one figure ("31", "1.8×",
"40%") or two joined by an arrow ("41% → 68%", "27 → 2", "1,240 -> 3,410"),
the whole line at most 24 characters; words on either side make it a
sentence ("41% → 68% in a week" is not a figure). Fixed 2026-11-15 because
the landing page's own story (`components/showcase/demos/the-post.ts`) is
that shape and `DraftCard` left it unbracketed. Never bracket in the page to
work around a missing figure: three brackets come from `readBeats` or not at
all (editor-marks.md).

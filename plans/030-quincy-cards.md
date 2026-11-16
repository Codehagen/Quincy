# 030 — Quincy cards: the product components built from the kit

Inventory taken 2026-11-15, after plan 029. The kit (`components/kit/`) has the
primitives. This plan names the **domain components** the app shows again and
again — a riff, a draft, a slot, a post's result — so each is built once from the
kit and every page renders the same one. Read-only survey of `app/(app)/**` and
`components/**`; lab references are the kept picks (round 1: 01 02 05 07 08 13 17
19; round 2: 21 22 23 26 28 29 31 32 36 38).

File paths and line numbers below are the tree on 2026-11-15. The migration
this plan fed has since deleted most of the old shadcn layer in
`components/ui/` and moved or replaced several of the files named here; read a
path that no longer resolves as "the component that held this then".

**Rank** = places it is rendered today × how central it is to "Quincy drafts, you
send" (3 = the send loop, 2 = feeds it, 1 = around it). **Kind**: *card* (shared
component), *section* (one per page, shared only as a layout), *one-off* (keep
local, do not generalise).

## Ranked

| # | Name | Kind | Represents | Places | Centre | Lab look |
| - | ---- | ---- | ---------- | ------ | ------ | -------- |
| 1 | `DraftCard` | card | One channel version of a draft, up to Approve and after | 4 impl. | 3 | 21, 23, 28, 07 |
| 2 | `RiffCard` (+ `AngleTabs`) | card | Raw material read into angles, waiting for "Draft this" | 2 + text | 3 | 01, 22, 13, 31 |
| 3 | `QuincyReply` / `YourTurn` | card | One turn in a conversation with Quincy | 4 impl., 20+ sites | 3 | 23 |
| 4 | `ScheduledPost` | card | An approved version with a time, in the week | 3 impl. | 3 | 26, 07, 08 |
| 5 | `WaitingItem` | card | One thing ready for you today, with its one action | 1 + sidebar | 3 | 29, 36 |
| 6 | `SlotCell` | card | One opening in the week: hour, channel, your median there | 3 impl. (2 dead) | 2 | 19, 26, 28 |
| 7 | `PostResult` (+ `AgainstMedian`) | card | A published post, stated against your own median | 6 sites | 2 | 21 (median line), 02 |
| 8 | `QuincyAsks` | card | One question or offer Quincy puts to you, answered in a line | 4 impl. | 2 | 38, 32, 05 |
| 9 | `ProvenanceMark` | card (small) | Where a thing came from: source or platform, with when | 23 sites | 2 | 21, 31 |
| 10 | `EmptyState` | card | Nothing here yet, and the one next step | 19 sites | 2 | 38 |
| 11 | `SourceRow` | card | One source of material and its connection state | 4 forks, 7 sites | 2 | 32, 31 |
| 12 | `BrainLine` | card | One rule or fact Quincy keeps, with its receipt | 3 impl. | 2 | 05 |
| 13 | `RhythmCard` | card | One thing Quincy does on its own, on or off, last run | 2 | 1 | 36 (dot only) |
| 14 | `ArtifactWindow` | card | A draft or a read source shown inside the chat | 3 sites | 2 | 23, 21 |
| 15 | `ConversationRow` | card | One past conversation | 2 impl. | 1 | 36 |
| 16 | `ChannelRow` | card | One publishing destination and its health | 3 impl. | 1 | — |

## Detail

### 1 `DraftCard` — the biggest duplication

- **Data:** `Version` `lib/drafts.ts:40`, `Draft` `lib/drafts.ts:112`; chat input `DraftArtifactOutput` `lib/draft-artifact.ts:24`, `ApprovalPreview` `lib/draft-writes.ts:42`.
- **Rendered today (4 implementations):** `GutterRow` `components/drafts/gutter-row.tsx:98` (via `WorkingPane` `components/drafts/draft-pane.tsx:109`); `DraftArtifactCard` `components/chat/draft-artifact.tsx:108`; `PublishedVersion` `components/drafts/draft-pane.tsx:430`; `DonePane` `components/drafts/draft-pane.tsx:634`. List row for the piece: `PieceRow` `components/drafts/drafts-inbox.tsx:737`.
- **"When does it go out" is computed three ways:** `when()` `components/drafts/draft-pane.tsx:213`, `receiptFor()` `components/chat/draft-artifact.tsx:411`, and the state flags in `EntryRow` `components/lineup/lineup-parts.tsx:220`. One `goingOutLine(version)` helper should feed all three.
- **States:** writing · editing · approving (one frame) · approved → going out *t* / no slot for this channel / every slot taken / approved before the slot existed · sending · published (url) · failed (error) · twin text (`DuplicateNotice` `draft-parts.tsx:622`) · hook repeated back (`HookNotice` `draft-parts.tsx:650`) · historical snapshot (chat, read-only).
- **Actions:** Approve (the one blue action), Edit, Undo / Reopen, Post now (dialog, `draft-pane.tsx:370`), Discard (`DiscardVersion` `draft-parts.tsx:454`), then the rule offer under it (#8).
- **Kit:** `Card`, `Avatar`, `Mono` (channel · chars), `Beats`/`BeatBracket`, `Text variant="figure"`, `Muted` (median line), `Rule`, `Button` action/quiet, `Arrive` (Approve ↔ "Goes out Thu 07:45 · Undo"), `Textarea`, `Count` (length against the fold), `MarginNote` (why this hour, 28).
- **Note:** Discard is an `AlertDialog` today, against the `HoldToConfirm` rule in AGENTS.md. Decide it when the card is built; the kit has no hold button yet.

### 2 `RiffCard` + `AngleTabs`

- **Data:** `Riff` `lib/riffs.ts:306`, `Angle` `lib/riffs.ts:59`; the offer form `WaitingWork` (kind `riff`) `lib/waiting-work.ts:95`, `DeskAngle` `lib/waiting-work.ts:58`.
- **Rendered today:** `RiffCard` `components/riffs/riff-card.tsx:60` (`app/(app)/riffs/page.tsx:199`), built from `Provenance` `riff-parts.tsx:59`, `Scrap` `:146`, `AngleCard` `:240`, `AngleActions` `:463`, `Steer` `:613`, `RiffFooter` `:827`, `AnglesPending` `:866`, `RiffFailed` `:931`, `ChannelGaps` `channel-gap.tsx:60`. In Studio the same riff is offered only as greeting text (`lib/studio-greeting.ts:34`).
- **States:** working (skeleton, same shape) · stuck · ready · failed (reason) · angle open / drafted / drafted-as-fallback · refused (no credit → "See plans", no channel → "Connect a channel", `riff-parts.tsx:507`) · all decided.
- **Actions:** Draft this (one primary), Discard angle, Steer, Make one for *channel*, Discard the rest, show the whole scrap.
- **Kit:** `Card`, `Highlight` (the sentence the angle stands on), `MarginNote` (the why), `Tabs` or `Segmented` (angles, 22), `Text`, `Mono` (source · when), `Skeleton`/`SkeletonLines`, `Button`, `Arrive` (new riff slides in at the head, 31).

### 3 `QuincyReply` / `YourTurn`

- **Data:** AI SDK `UIMessage` parts; greeting `StudioGreeting` `lib/studio-greeting.ts:34`.
- **Rendered today (4 implementations of one turn):** `MessagePart` `components/chat/message-parts.tsx:265` (text) and `:295` (Quincy, markdown); `QuincyTurn`/`UserTurn` `components/welcome/turn.tsx:32,52` (18 call sites in `first-run.tsx` and `wiring.tsx`); `QuincyLine` `components/chat/studio-greeting.tsx:54`; editor chat `components/editor/studio-chat.tsx:180`.
- **States:** streaming (caret), reasoning (collapsible, `message-parts.tsx:74`), tool running/done (`ToolPart` `:120`), typed reveal (first visit), error, with chips (answers that send).
- **Look (23):** your turn is the only bubble; Quincy's answer is a marked-up page with the quote highlighted and a margin note, and one "Draft it".
- **Kit:** `Text`, `Highlight`, `MarginNote`, `Button`. **Kit gap (since closed):** markdown. The renderer was still on the old system; a kit page needed a kit typeset preset, and `components/ui/markdown.tsx` now has `kit` and `kit-page`.

### 4 `ScheduledPost`

- **Data:** `Entry` `lib/lineup.ts:40`, states `SCHEDULED_STATES` `lib/schema-app.ts:419` (queued · sending · published · failed).
- **Rendered today:** `EntryRow` `components/lineup/lineup-parts.tsx:191`, `UnscheduledRow` `:421`, `SlotRow` `:646` (no caller). Shares its sentence with #1.
- **Actions:** the time is the button (move to an open slot, same time tomorrow), Unschedule / Back to Drafts.
- **Kit:** `ListRow`, `Mono` (time), `Menu`, `Button` quiet, `LiveDot` (sending only), `ProvenanceMark`.

### 5 `WaitingItem`

- **Data:** `WaitingWork` `lib/waiting-work.ts:95` (riff | gap). Missing: drafts waiting for Approve and replies to send are not in the union yet.
- **Rendered today:** only as words in the Studio greeting (`components/chat/studio-greeting.tsx:85,188`). No sidebar dot.
- **Look (29, 36):** a morning list in order; only the top item is open with its one action; clearing it folds it and the note gives the reason for the next. The sidebar carries one dot where something waits.
- **Kit:** `Card`, `Text`, `MarginNote`, `Button` action, `Arrive`, `NavRow` + `LiveDot`-sized dot. Rank is high for centrality, not for count: it is the front door to the send loop.

### 6 `SlotCell`

- **Data:** `Slot` `lib/lineup.ts:76`, `Day` `lib/lineup.ts:65`. **Data gap:** your median at that hour (19, 28) is not on `Slot`.
- **Rendered today:** `EmptySlotRow` `components/lineup/lineup-parts.tsx:553`, `CadenceStrip` `:609`, `SlotComposer` `components/lineup/slot-composer.tsx:78`; `Slot` `components/slot.tsx:24` and `SlotRow` `lineup-parts.tsx:646` have no caller.
- **States:** open · next · filled · going to waste · past · drop target. **Kit:** `Mono`, `Text`, `MarginNote` (why this hour), `Select`/`Segmented` (hour).

### 7 `PostResult` + `AgainstMedian`

- **Data:** `ScoredPost` `lib/numbers.ts:36`, `AngleRow` `lib/numbers.ts:59`.
- **Rendered today:** table row `components/numbers/post-table.tsx:56`, chart detail `components/numbers/distribution.tsx:282`, `AngleLedger` `components/numbers/angle-ledger.tsx:23`, best/worst `app/(app)/numbers/page.tsx:331,388`; published state also in `EntryRow` and `PublishedVersion`.
- **States:** above / below median · clipped outlier · live reading vs frozen import. **Kit:** `Text variant="figure"`, `Muted`, `Mono`, `Count`, `Beats` (30's story shape, when it is built).
- `AgainstMedian` ("Your median is 6.") is the one line every number in the product needs; build it first and use it in #1, #6, #7.

### 8 `QuincyAsks`

- **Data:** `StoryGap` `lib/story-gaps.ts:161`, `RuleOffer` `lib/edit-classes.ts:276`, `WaitingWork` (kind `gap`).
- **Rendered today (4 implementations):** `StoryIndex` `components/brain/needs-material.tsx:28`, `RuleOfferLine` `components/drafts/rule-offer.tsx:44`, `AnswerQuestion` `components/sources/answer-question.tsx:50` (in `github-source-row.tsx:375`), the greeting gap.
- **States:** asked · answering · answered (disappears) · declined ("Not now"). **Kit:** `MarginNote`, `Text`, `Field`+`Input`, `Button`. Evidence count stays in the sentence.

### 9 `ProvenanceMark`

- `SourceMark` `components/sources/source-mark.tsx:71` — 15 sites (drafts ×5, lineup ×4, sources ×4, riffs, chat, brain). `PlatformMark` `components/channels/platform-mark.tsx:119` — 8 sites. Not a card: a mark. Move it into the kit beside `FileChip`; most cards above take it.

### 10 `EmptyState`

- `Empty` from the old shadcn empty-state component (since deleted) in 14 sites (`numbers`, `conversations`, `rhythm/[id]` ×3, `credits`, `channels` ×2, `brain` ×3, `editor` ×2) plus `NoDrafts` `components/drafts/draft-parts.tsx:675`, `AllClear` `:720`, `NoLineup` `components/lineup/lineup-parts.tsx:712`, `EmptyDay` `:517`, `components/surface-placeholder.tsx:43` (no caller).
- **Look (38):** a lead in a card, the median line, a way in, and the editor's next question. **Kit:** `Card`, `Lead`, `Text`, `Button`, `ListRow`.

### 11 `SourceRow`

- **Data:** `Source` `lib/sources.ts:31`, `Connection` `lib/sources.ts:56`, `SafeSourceConnection` `lib/source-connections.ts:72`.
- **Four forks of one row:** `SourceRow` `components/sources/source-row.tsx:72`, `GithubSourceRow` `github-source-row.tsx:104`, `CirclebackSourceRow` `circleback-source-row.tsx:38`, `ChannelSourceRow` `channel-source-row.tsx:24`; seven sites in `app/(app)/sources/page.tsx:212–344`.
- **States:** not connected · connecting · connected · reading · read (what it found) · error · disconnect (`HoldToConfirm`). One row with a slot for the source's own action, not four rows.
- **Kit:** `ListRow`, `ProvenanceMark`, `Button`, `MarginNote` (32), `Input` (paste).

### 12–16

| Name | Data | Today | Kit |
| ---- | ---- | ----- | --- |
| `BrainLine` | `VoiceData` `lib/brain.ts:53`, `StoryData` `:87`, `LedgerEntry` `lib/memory-ledger.ts:79` | `StringList` `components/brain/string-list.tsx:20`, `RulesEditor` `rules-editor.tsx:21`, `StoryIndex` `needs-material.tsx:28` | `Text`, `Muted` receipt, `Arrive`, `MarginNote` |
| `RhythmCard` | `Rhythm` `lib/rhythms.ts:157`, `RhythmState` `:734`, `RhythmCardState` `components/rhythm/rhythm-grid.tsx:103` | `RhythmGrid` `rhythm-grid.tsx:42`, `app/(app)/rhythm/[id]/page.tsx`, `RhythmSwitch` ×2 | `Card`, `Switch`, `LiveDot` (running only), `Mono` (next run) |
| `ArtifactWindow` | `DraftArtifactOutput`, source read | `ArtifactFrame` `components/chat/artifact-frame.tsx:20` (draft ×2, website ×1) | `Window` |
| `ConversationRow` | `ConversationSummary` `lib/conversations.ts:23` | `components/conversation-list.tsx:138`, `app/(app)/conversations/page.tsx:81` | `NavRow`, `ListRow`, `Mono` |
| `ChannelRow` | `SafeConnection` `lib/channels.ts:482` | `Tile`/`List` `app/(app)/channels/page.tsx:129,148`, `ConnectionStrip` `components/channels/connection-strip.tsx:196` | `ListRow`, `ProvenanceMark`, `Button` |

## Page sections — shared layout, not cards

| Section | Today | Lab |
| ------- | ----- | --- |
| App shell + sidebar | `components/app-sidebar.tsx` (`NavRow` `:226`) | 36 |
| Page header | `PageHeader` in 13 pages | 36 (37 not kept) |
| Composer | `components/chat/composer.tsx:42`, already shared (6 sites) | 31 (take), 23 |
| Recorder | `RecordBox` `components/riffs/record-box.tsx:300` via `Instrument` | 17, 31 |
| The week | `LineupList` `components/lineup/lineup-list.tsx:38` | 26 |
| Distribution chart | `components/numbers/distribution.tsx:35` | — |
| Brain workspace | `components/brain/brain-workspace.tsx:128` | 05 |

## One-offs — keep local

Video editor (`components/editor/**`), credits and billing cards, `PolicyEditor`,
`ConnectionStrip`, `SettingsBriefing`, first-run `Wiring`, `AdaptBox`,
`StrategyPage`, `VoicePreview`, `ConversationRail`, `LapsePanel`. `HoldToConfirm`
is already shared and stays as it is.

## Dead code found

No importer: `components/slot.tsx`, `components/coverage.tsx`,
`components/surface-placeholder.tsx`, and `SlotRow` in
`components/lineup/lineup-parts.tsx:646`. Delete or absorb into `SlotCell`.

## Order of work

1. `AgainstMedian`, `ProvenanceMark`, and one `goingOutLine` helper — used by most cards.
2. `DraftCard` (Drafts and Studio chat share it from day one), then `ScheduledPost`.
3. `RiffCard` + `AngleTabs`, then `WaitingItem` and the sidebar dot.
4. `QuincyReply` / `YourTurn` with a kit markdown preset; then `QuincyAsks`, `EmptyState`.
5. The rest as their page moves to the kit (plan 029: a page moves whole).

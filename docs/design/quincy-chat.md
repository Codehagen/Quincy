# Quincy cards: conversation, questions, empty

`QuincyReply` / `YourTurn` (#3), `QuincyAsks` (#8) and `EmptyState` (#10)
from plans/030, from `@/components/quincy`. Kit only. Live at
`/prototypes/kit#quincy-reply`.

## QuincyReply and YourTurn

One turn of a conversation (lab 23). Your turn is the only bubble; Quincy's
reply is a marked-up page with no surface of its own. Use them for every
turn: Studio chat, the editor chat, first run. The conversation sits in one
object (a Card or Window, `width="with-margin"` when a quote carries a note);
stack turns with `flex flex-col gap-kit-group`.

Parts, in reading order inside `QuincyReply` (`streaming` sets `aria-busy`):

- `ReplyText part={part}` — markdown (`Pick<TextUIPart, "text" | "state">`
  from `ai`; `{ text }` for the greeting's `opening`).
- `ReplyQuote note? marked?` — the person's words in a Well, highlighted.
- `ReplyActions` — the reply's buttons; at most one is the action.
- `ReplyFailed rest? onRetry?` — a reply that did not arrive (states.md).

`YourTurn` takes the person's text (`children`, never markdown, line breaks
kept) and `files` (FileChips above the bubble, no ×).

```
What is this piece of Quincy's turn?
 ├── Words Quincy wrote                → ReplyText
 ├── The person's own words, quoted    → ReplyQuote (one per object highlighted)
 ├── Something to press                → ReplyActions
 ├── Working (reasoning, a tool)       → LiveDot pulse + words, role="status"
 └── It failed                         → ReplyFailed
```

**The markdown preset.** `ReplyText` renders `components/ui/markdown.tsx`
with `preset="kit"`: `.typeset-kit` in app/globals.css, beside
`.typeset-chat`. It re-points typeset's own variables at kit tokens (Inter
14/20, headings at 560 and body size, mono 12, links like TextLink, 12px
paragraph flow) and leaves typeset.css generated. No rehype-raw. Append-
stable: no `:last-child` or `:has()`, so earlier paragraphs never restyle
while it streams; `state: "streaming"` closes half-arrived markers. This is
the one place a kit page reaches into components/ui for a reply, and only
through `ReplyText`.

`preset="kit-page"` is the same type for a stored page (a brain page, a
channel strategy): no `remark-breaks`, because that source is hard-wrapped
markdown. Never stack `preset="wiki"` with a `typeset-kit` class.

- In a thread, only the latest reply's quote is highlighted: earlier turns
  pass `marked={false}` (one Highlight per object).
- No kit `Text` or `text-*` utility inside ReplyText. Close it and use a part.

```tsx
// Correct
<QuincyReply streaming={part.state === "streaming"}>
  <ReplyText part={part} />
  <ReplyQuote note="this is the post">We stopped writing release notes.</ReplyQuote>
  <ReplyActions><Button variant="action">Draft it</Button></ReplyActions>
</QuincyReply>

// Incorrect — a bubble for Quincy, and markdown outside the preset
<div className="rounded-kit-object bg-kit-well"><ReactMarkdown>{part.text}</ReactMarkdown></div>
```

## QuincyAsks

One question or offer from Quincy, answered in a line. Not a card: put it in
the object it is about (under an approved version, in the chat, in a source
row). Use a ReplyActions button instead when the answer is just a next step.

Props: `question` (ink, evidence in the sentence), `rest` (grey), `answer`,
`onDecline` ("Not now", omit for none), `answered` (the receipt that stays),
`isAction`, `onWordsChange`.

```
How does the person answer?
 ├── Yes or not now (RuleOffer, lib/edit-classes.ts:276) → answer.kind="yes"
 └── A clause (StoryGap, lib/story-gaps.ts:161; the merge question) → answer.kind="line"
```

- The action returns `AskResult` (`{ ok: true } | { ok: false; message }`);
  a refusal stays by its control and the person can try again.
- A line answer is a real form (Enter submits), one Input, never a textarea.
  Its submit is the action only while it holds words, unless `isAction` says.
- Asked → answering → answered (folds; `answered` shows and takes focus)
  or declined (folds at once).

```tsx
// Correct — the count stays in the sentence
<QuincyAsks question={gap.question} answer={{ kind: "line", label: "Your answer", submitLabel: "Send it", onAnswer }} onDecline={skip} />

// Incorrect — a claim about their writing with no evidence, in a dialog
<Dialog><Text>You should write about pricing.</Text></Dialog>
```

## EmptyState

Nothing here yet, and the one next step (lab 38). Use it for every empty list
or page; a filter with no results is a muted line, not an EmptyState. Put it
in a Stage with no `lead`.

Props: `bold`, `rest`, `baseline` (the person's own median line; leave it out
rather than invent one), `children` (the one way in). `EmptyStarters`
(`starters`, `note`, `onPick`) is the way in when Quincy asks: picking a row
brings its next question in under the rows.

```tsx
// Correct — one way in
<EmptyState bold="No ideas waiting." rest="Say a half-thought and I'll find the ideas in it."><ButtonLink href="/riffs">Record a thought</ButtonLink></EmptyState>

// Incorrect — two ways in, and a number with no baseline
<EmptyState bold="0 drafts"><Button>Record</Button><Button>Paste</Button></EmptyState>
```

## Studio

Studio (`components/studio/`) is the chatbot template's structure
(github.com/shadcn-ui/chatbot-template) on the kit. `StudioScreen` owns
`useChat<StudioUIMessage>`; `MessageList` (kit) holds the turns to the live
edge; `StudioTurn` renders one message; `Composer` (kit) sends text and files.

- **One renderer per block.** `planTurn` (lib/studio-turn.ts) reads a
  message's parts into blocks: `work` (thinking and a receipt of each tool
  step, `QuincyWork`), `source` (`SourceCard`), `draft` (`ChatDraft`, the
  DraftCard bound to its row), `text` (`ReplyText`), `files`. It is pure and
  tested against the scripted fixtures, so a part state with no drawing fails
  a test.
- **Thinking holds until something visible lands** (the card or the words),
  then folds to "Thought about this". A tool call left open in a finished
  turn (Stop) reads "Stopped while …", never a card that writes forever.
- **One action.** Words typed and not sent make Send the ink pill; otherwise
  the first draft waiting for Approve is. Approve takes the same Lineup slot
  as /drafts; nothing publishes from the chat.
- **The friend** sits beside the newest reply only, in the turn's state
  (`turnMood`: reading, writing, waiting, stuck, idle).
- **Errors** are `ReplyFailed` with the route's own sentence and Try again
  (`regenerate`). No Retry on a reply that arrived: a resend is spend.

**Scripted.** `NEXT_PUBLIC_CHAT_TRANSPORT=scripted` runs Studio on the
@shadcn/helpers fixtures in `lib/chat-fixtures` (`?fixture=draft|error|
stream-error|tool-error|attachment`, `?pace=4` to slow it down): no request to
/api/chat, and the draft card's actions run in memory.

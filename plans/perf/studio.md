# /studio (and /c/[id], welcome chat) — performance plan

Reviewed 2026-08-11 against the performance skill. Database reality: 8
conversations, 22 messages, max 6 per thread, avg message ~153 chars — nothing
here is a felt problem yet; all three fixes are cheap insurance that scales
with thread length and token rate. ~30 lines across two files.

## Finding 1 — no stream throttle on useChat (P2, effort S)

`components/chat/studio-chat.tsx:69` calls `useChat` without `throttle`, so
every streamed chunk re-renders the full page tree (messages, rail, composer).
The installed `@ai-sdk/react` supports `throttle: <ms>` (`experimental_throttle`
is deprecated). Add `throttle: 50` — 20fps UI updates, indistinguishable to a
reader.

## Finding 2 — every keystroke re-renders the transcript (P2, effort S)

`input` state lives in `StudioChat` (line 49), so typing re-renders every
message and re-parses every assistant turn's markdown. The Composer's
controlled-value API is justified (welcome's first-run prefills it,
`first-run.tsx:116`), so do NOT move the state. Extract the message list into
a `Transcript` component memoized on `(messages, status, error)` so keystrokes
touch only the composer.

## Finding 3 — no memo in the message tree (P2, effort S)

`MessagePart` re-runs for completed messages on every chunk, including their
full `ReactMarkdown` parse. Completed message objects are referentially stable
across AI SDK updates, so `React.memo(MessagePart)` makes per-chunk cost
proportional to the one streaming message. `closeOpenMarkers` rides on the
same renders and is fixed by the same memo.

**Verify all three:** React DevTools profiler while streaming a reply — only
the streaming message's subtree should re-render per update tick; typing in
the composer should not highlight the transcript.

## Explicitly fine — do not touch

- **Virtualization**: max 6 messages/thread in production, and
  `message-scroller.tsx:76` documents measured reasons `content-visibility`
  breaks scroll anchoring here.
- **Conversation rail**: `content-visibility:auto` with measured intrinsic
  size, opacity/translate-only reveal, ref-read shortcut handlers.
- **Reasoning disclosure**: height animation uses Base UI's measured height
  variable — the acceptable form.
- **Shimmer**: paint-only background-position on a small element, mounted only
  while streaming.

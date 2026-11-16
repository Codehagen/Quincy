# /conversations and /c/[id] — performance plan

Reviewed 2026-08-11. Database reality: 8 conversations, 22 messages, max 6
per thread.

## Finding 1 — /c/[id] serializes ownership check and transcript fetch (P3, effort S)

`app/(app)/c/[id]/page.tsx:30-36`: `getConversation` (the ownership gate),
then `getMessageRows`. Both key off the URL id — start both together and
keep the gate: `notFound()` before the rows are ever used. The rows of a
conversation the user does not own are fetched into server memory and
discarded in that case, which changes nothing observable. 2 round trips → 1.

If that trade reads wrong, the alternative with the same effect is a single
query: join `message` to `conversation` filtered by `userId`, and 404 on
zero rows for a non-empty id check.

## Explicitly fine — do not touch

- /conversations is one indexed query (`conversation_user_updated_idx`).
- `getMessageRows` selects only id/role/parts — no over-fetch.
- Transcript rendering rides on the studio chat components; the fixes in
  plans/perf/studio.md (throttle, transcript memo) apply to this route
  automatically.
- No pagination needed at 6 messages max; revisit only if threads grow past
  a few hundred messages.

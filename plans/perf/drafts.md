# /drafts — performance plan

Reviewed 2026-08-11. Database reality: 0 drafts, 0 versions, 0 scheduled
posts, 0 slots in production today — `getDrafts` currently exits after its
first query. The finding below costs nothing to fix now and prevents the
page's cost growing linearly in round trips as pieces accumulate.

## Finding 1 — getDrafts is a four-deep sequential round-trip chain (P2, effort S)

`lib/drafts.ts:189-232` awaits in sequence: pieces → versions → scheduled →
slots. At ~120ms per Neon round trip that is ~480ms once the page has
content. The dependency graph is looser than the code:

- `slots` depends only on `user.id` — start it before the chain, await last.
- `scheduled` needs version ids, but `draft_version ⟕ scheduled_post` is one
  join keyed by `scheduled_post.draft_version_id`; folding it into the
  versions query keeps the two questions separate in the SELECT list while
  removing a round trip. (The comment's argument for two reads is about the
  slot query — that one stays separate; it does not apply to `scheduled`.)

Result: 4 sequential round trips → 2 (pieces, then versions+scheduled) with
slots in parallel. Wall time ~480ms → ~240ms at steady state.

**Verify:** same `Draft[]` output shape (add a unit test around a fixture
with a scheduled and an unscheduled version before refactoring); the empty
early-return path must stay.

**Implemented 2026-08-11.** Deviation from the Verify step: the codebase has
no drizzle-mocking test infrastructure (every lib test is a pure-function
test), so a DB-fixture test would have meant inventing a mocking layer
larger than the fix. Equivalence was proven structurally instead:
`scheduled_post_version_key` is UNIQUE on draft_version_id, so the left
join yields exactly one row per version and cannot duplicate; the
`timeByVersion` map filters null joins, matching the old separate-select
semantics. Empty early-return kept. Typecheck and 874 tests green.

## Explicitly fine — do not touch

- Page shell: session (request-cached) → one data call → client inbox behind
  Suspense so `useQueryState` does not opt the route out of the static shell.
  This is the pattern the other pages should copy.
- Keyboard nav reads through refs/memo correctly; j/k guarded against inputs.
- Indexes cover every path (`draft_user_created_idx`,
  `draft_version_draft_idx`).
- No virtualization needed: the inbox's own design decision (documented in
  the page comment) is that the queue stays short.

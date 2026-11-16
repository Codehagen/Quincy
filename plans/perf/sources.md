# /sources — performance plan

Reviewed 2026-08-11.

## Finding 1 — up to five sequential round trips, with redundant reads (P1, effort S)

`app/(app)/sources/page.tsx:84-135` awaits in sequence:
`getSourceConnections` → `getCirclebackSetup` → `getGithubSetup` →
`getConnection(x)` → `corpusSummary` (conditional). ~480–600ms of Neon
round trips for a settings-shaped page. Two of them are also redundant:
`getCirclebackSetup` and `getGithubSetup` each re-select the
`source_connection` row that `getSourceConnections` already fetched
(sources/actions.ts:216, 292).

**Fix:**
- `Promise.all` the independent reads: connections, both setups, and the X
  connection. `corpusSummary` depends on the X connection's presence — start
  it after that promise alone, not after everything.
- Optional second step: give the two setup helpers an overload that accepts
  an already-fetched connection row, and have the page pass rows from
  `getSourceConnections` — removes the redundant selects entirely. Keep the
  standalone versions for /welcome, which calls them without a list.

Result: 5 sequential round trips → 2 (parallel batch, then corpusSummary).

**Verify:** page renders identical rows for connected + unconnected states;
/welcome still works (it imports the same helpers).

## Explicitly fine — do not touch

- `searchParams` read is cheap and already inside the group's Suspense
  boundary.

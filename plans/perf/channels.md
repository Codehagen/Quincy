# /channels and /channels/[platform] — performance plan

Reviewed 2026-08-11.

## Finding 1 — two independent reads in sequence, on both pages (P2, effort S)

- `app/(app)/channels/page.tsx:171-187`: `getBrainByKind(policy)` then
  `listConnections`. Independent — `Promise.all`. 2 round trips → 1.
- `app/(app)/channels/[platform]/page.tsx:95-107`: `getPage` then
  `getConnection` (conditional). Independent — start both, await together.
  2 → 1.

~120ms saved per navigation on each page. Mechanical; same pattern as the
riffs/lineup plans.

**Verify:** both pages render identically for connected and unconnected
platforms; the `error` searchParam path on [platform] still shows its banner.

## Explicitly fine — do not touch

- `getBrainByKind` exists precisely so this page does not fetch the whole
  brain (documented in lib/brain.ts) — the query choice is right, only the
  sequencing is not.
- Connections map built once per page, not per row.

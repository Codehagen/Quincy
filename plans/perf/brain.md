# /brain — performance plan

Reviewed 2026-08-11. Database reality: 3 brain pages in production.

## No findings requiring action

This page is the reference implementation for the app's data pattern:

- One query (`getBrain` is a single indexed select), prefetched server-side
  into TanStack Query and dehydrated into the HTML — the tree is in the first
  paint, no fetch-on-mount waterfall, and subsequent tree clicks are cache
  hits instead of ~120ms round trips. The page comment documents the measured
  reasoning.
- Prefetch reads the database directly instead of HTTP-ing to /api/brain from
  the server. Correct, and worth copying.
- The editor is a textarea plus the shared Markdown preview — no heavy editor
  dependency in the client bundle.
- `getBrainByKind` exists specifically so other pages do not over-fetch this
  table as it grows (documented with the growth argument).

## Watch item (no action now)

The brain page list is fetched whole (`getBrain`) into the workspace. The
story bank grows with every published post and Heartbeat writes weekly; if
`brain_page` reaches hundreds of rows with large `data` payloads, the list
query should slim to the columns the tree renders and fetch page bodies on
open. Revisit when the table passes ~100 rows for one account — check with:
`SELECT count(*) FROM brain_page GROUP BY user_id ORDER BY 1 DESC LIMIT 1`.

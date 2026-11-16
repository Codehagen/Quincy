# /lineup — performance plan

Reviewed 2026-08-11. Database reality: 0 scheduled posts, 0 slots today.

## Finding 1 — three independent queries run sequentially (P2, effort S)

The page awaits `getLineup`, then `listConnections`; inside `getLineup`
(lib/lineup.ts:182, 227) the scheduled-week join and the standing-slots
select also run in sequence. All three reads depend only on the user id —
none on each other:

1. scheduled posts for the week (`scheduled_post ⨝ draft_version ⨝ draft`,
   covered by `scheduled_post_user_when_idx`)
2. standing slots (`slot_user_idx`)
3. `listConnections`

**Fix:** `Promise.all` the two selects inside `getLineup`, and `Promise.all`
`getLineup` + `listConnections` in the page. 3 sequential round trips → 1
round-trip wall time (~360ms → ~120ms).

**Verify:** identical `lineup` shape; the `filled` map still derives from the
rows result after both awaits resolve.

## Explicitly fine — do not touch

- The week query is already one three-table join, not an N+1 — correct shape.
- `opening` truncation (first line only) keeps payloads small by design.
- Timezone math happens server-side once; the client never re-derives dates.
- First-run branch renders no list machinery at all.

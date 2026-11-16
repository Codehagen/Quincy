# /numbers — performance plan

Reviewed 2026-08-11.

## No findings requiring action

- `getNumbers` runs its two queries with `Promise.all`, covered by
  `source_item_user_source_posted_idx` and `scheduled_post_due_idx`.
- The published-post probe is `LIMIT 1` — an existence check, not a fetch.
- The distribution chart is hand-rolled SVG — no chart library in the
  bundle.
- Median/mean math happens server-side once per request.

## Watch item (no action now)

`getNumbers` selects the full corpus — every `source_item` row including
`body` and `meta` — to compute the distribution and infer angles. Fine at
today's row counts; if a connected source backfills years of posts (say
>2,000 rows), consider bounding the select to the window the page renders
and/or selecting only the columns the inference reads. Check with:
`SELECT user_id, count(*) FROM source_item GROUP BY 1 ORDER BY 2 DESC LIMIT 3`.

# /credits — performance plan

Reviewed 2026-08-11.

## No findings requiring action

The page's two reads (usage summary and turns) already run under
`Promise.all`, covered by `usage_event_user_created_idx`. Nothing to change.

## Watch item (no action now)

`usage_event` is append-only and grows with every model call. If the summary
query ever aggregates the whole table per request, bound it to the billing
period in SQL rather than in JS. Check growth with:
`SELECT count(*) FROM usage_event`.

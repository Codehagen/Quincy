# /rhythm and /rhythm/[id] — performance plan

Reviewed 2026-08-11.

## Finding 1 — getRhythmStates fetches every run ever recorded (P2, effort S)

`lib/rhythms.ts:692` selects ALL `rhythm_run` rows for the user's
subscriptions ordered newest-first, then keeps only the newest per
subscription in JS. Runs accumulate one row per execution and rhythms run on
cadences — this result set grows without bound while only N rows (one per
subscription) are ever used. The in-code comment says the count is bounded by
enabled rhythms; it is actually bounded by *run history*.

**Fix:** ask Postgres for exactly the rows used:

```sql
SELECT DISTINCT ON (subscription_id)
       subscription_id, state, summary, started_at, manual
FROM rhythm_run
WHERE subscription_id = ANY($1)
ORDER BY subscription_id, started_at DESC
```

(In Drizzle: `.selectDistinctOn([rhythmRun.subscriptionId], {...})` with the
matching two-key orderBy.) `rhythm_run_subscription_idx` on
`(subscription_id, started_at)` covers it. Optionally fold the subscriptions
select in as a join to also drop a round trip (2 → 1).

**Verify:** same `Map` contents for a fixture with two runs on one
subscription (newest wins); `getRhythmRuns` (the [id] page history, already
LIMIT-bounded — confirm) is untouched.

## Finding 2 — /rhythm/[id] awaits conditionals in sequence (P3, effort S)

`app/(app)/rhythm/[id]/page.tsx:90-95`: `getRhythmStates`, then
`getHeartbeatRuns`, then `getRhythmRuns`, each behind a condition. When two
conditions are true in one render the awaits serialize. Start the applicable
promises unconditionally-shaped (`runnable ? getRhythmStates(...) :
Promise.resolve(new Map())` etc.) and `Promise.all` them.

## Explicitly fine — do not touch

- The grid page already runs its two reads with `Promise.all`.
- Card dates are formatted server-side (midnight-consistency rule) — keep.
- Indexes cover all paths (`rhythm_subscription_user_idx`,
  `rhythm_run_subscription_idx`, `rhythm_run_user_started_idx`).
- The platform filter follows the established nuqs pattern; no client
  refetching.

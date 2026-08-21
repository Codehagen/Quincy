# Performance plans — full app sweep, 2026-08-11

Every app surface reviewed against the performance skill (rendering, bundles,
animation, streaming) and the Postgres best-practices rules (round trips,
indexes, bounded queries), with priorities argued from the production Neon
database, not fixtures. The marketing surface was fixed separately the same
day (providers moved out of the root layout, `cacheComponents` enabled,
commit `1eb42e6`) and is not re-planned here.

The recurring server finding is one disease: **sequential Neon round trips
where the dependency graph allows parallelism**. A round trip is ~120ms from
this app; execution is microseconds; the only number that matters is how many
trips are serialized. The recurring client finding is per-token/per-frame
React state fanning out into large trees.

## Execution order

| # | Plan | Top finding | Priority | Effort | Status |
|---|------|-------------|----------|--------|--------|
| 1 | [cuts.md](cuts.md) | Playhead state re-renders whole editor per frame | P1 | M | DONE — playhead left React state (subscription + DOM writes); structural verify, profile pending |
| 2 | [sources.md](sources.md) | 5 sequential round trips, 2 redundant | P1 | S | DONE — Promise.all batch, corpus after X only; optional helper-overload step skipped as marked |
| 3 | [riffs.md](riffs.md) | 4 sequential round trips, re-paid by 4s poll | P1 | S | DONE — page and getRiffs each Promise.all; 4 waits → 2 |
| 4 | [studio.md](studio.md) | No stream throttle; keystroke + chunk re-renders | P2 | S | DONE — throttle: 50, memoized Transcript, React.memo(MessagePart); also covers /c/[id] and welcome |
| 5 | [lineup.md](lineup.md) | 3 independent queries serialized | P2 | S | DONE — Promise.all in getLineup and in the page; 3 waits → 1 |
| 6 | [rhythm.md](rhythm.md) | getRhythmStates fetches unbounded run history | P2 | S | DONE — DISTINCT ON per subscription; [id] page reads run concurrently |
| 7 | [drafts.md](drafts.md) | 4-deep chain (page empty today) | P2 | S | DONE — slots parallel, versions+scheduled folded into one join; fixture test replaced by structural proof (see plan) |
| 8 | [channels.md](channels.md) | 2→1 round trips on both pages | P2 | S | DONE — Promise.all on both pages |
| 9 | [conversations.md](conversations.md) | Optional 2→1 on /c/[id] | P3 | S | DONE — concurrent fetch, ownership gate unmoved |
| — | [brain.md](brain.md) | Clean — reference implementation | — | — | no action |
| — | [numbers.md](numbers.md) | Clean + corpus-growth watch item | — | — | no action |
| — | [settings.md](settings.md) | Clean | — | — | no action |
| — | [credits.md](credits.md) | Clean + usage-growth watch item | — | — | no action |
| — | [welcome.md](welcome.md) | Clean | — | — | no action |

Plans 2–8 are the same mechanical shape (`Promise.all` / one join / DISTINCT
ON) and can be batched into one change if preferred; plan 1 is the only one
that needs care.

## Goal prompt

Paste this to execute the sweep (also usable with /loop):

> Read plans/perf/README.md in the Quincy repo and execute every plan whose
> status is TODO, in the table's order. For each plan: read the plan file
> fully; implement exactly what it prescribes and nothing beyond it —
> watch-items are explicitly not work; run the plan's own Verify steps plus
> `pnpm typecheck` and `pnpm test`; then update the plan's row in
> plans/perf/README.md to DONE with a one-line note and the commit SHA.
> Commit per plan in the repo's narrative commit style. For cuts.md (the
> per-frame playhead), profile with React DevTools before and after and
> record the observation in the plan file. STOP and report instead of
> proceeding if: a Verify step fails twice, a plan's cited line numbers no
> longer match the code and the mismatch changes the fix, or any change
> would alter rendered output rather than only when/how it renders. When all
> plans are DONE, run `pnpm build` once and report the final route table and
> test count.

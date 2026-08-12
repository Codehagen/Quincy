# /riffs — performance plan

Reviewed 2026-08-11 against the performance skill and the Postgres
best-practices rules. Database reality at review time: 8 conversations, riffs
in single digits per account, all queries index-covered.

## Finding 1 — the page pays four sequential Neon round trips (P1, effort S)

A round trip is ~120ms from this app (measured, see lib/session.ts); execution
is microseconds. The page currently serializes:

1. `getRiffs` select 1: riffs by user (`riff_user_created_idx`)
2. `getRiffs` select 2: angles by riff ids (`riff_angle_riff_idx`)
3. `getRiffs` select 3: drafted hooks (`draft` ⟕ `draft_version`, grouped)
4. `listConnections` in the page body, after `getRiffs` resolves

That is ~480ms of pure network before render, and RiffsRefresh re-pays it
every 4 seconds while a voice riff is processing.

**Fix (two independent halves):**

- In `app/(app)/riffs/page.tsx`: `getRiffs` and `listConnections` do not
  depend on each other. Run them with `Promise.all`, same as the (app) layout
  already does for conversations + entitlement.
- In `lib/riffs.ts` `getRiffs`: the drafted-hooks select (3) is independent of
  the riff→angle chain (1→2). Start it before awaiting select 1 and await it
  last. Optionally collapse selects 1+2 into one `riff ⟕ riff_angle` join
  ordered by `createdAt desc, position asc` — one round trip instead of two;
  regroup rows in JS.

Result: 4 round trips → 2. Poll cost halves with it.

**Verify:** riffs page renders identically (same props into RiffCard); time
`getRiffs` before/after with `console.time` in dev against the real Neon
branch, expect ~half.

## Finding 2 — polling re-runs the whole route tree (P3, note only)

`RiffsRefresh` calls `router.refresh()`, which re-renders the layout too —
conversations + entitlement queries every 4s while a riff processes. The
component is already well-gated (visibility check, 5-minute cap, only mounts
while `working` rows exist), and the window is 10–20s a handful of times a
day. Finding 1 halves the cost. No further action unless the poll window
grows; the escalation path (documented in the component) would be a narrower
refresh via a server action returning just riff state.

## Explicitly fine — do not touch

- **Indexes.** Every access path is covered: `riff_user_created_idx` matches
  the WHERE+ORDER BY, `riff_angle_riff_idx` the angle fetch,
  `draft_user_created_idx` and `draft_version_draft_idx` the drafted join.
- **Client bundle.** RecordBox (1,327 lines) imports nothing heavy — native
  MediaRecorder, icons, UI primitives. It is the primary control of the page
  ("capture is the page"), so eager loading is product-correct, not waste.
- **Transitions.** No bare `transition` class anywhere in components/riffs.
- **Day grouping.** Grouping by the server-rendered date string avoids a
  second timezone computation; sorted input means no client sort. Correct.
- **Virtualization.** Queue is single-digit by design (acting on a riff
  removes it). The page's own comments already stage Fold as the growth path.

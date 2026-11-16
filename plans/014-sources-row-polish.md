# Plan 014: Sources-row polish — aggregate the summary, fix the double-@, make the receipt truthful

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b85a7c1..HEAD -- lib/corpus-x.ts components/sources/channel-source-row.tsx "app/(app)/sources/page.tsx" scripts/verify-corpus-x.ts`
> Plans 012 and 013 modify `lib/corpus-x.ts` and `scripts/verify-corpus-x.ts`
> before this plan runs — that drift is expected. Any drift in the two UI
> files is a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/013-backfill-cursor-and-pagination-tests.md (both touch `lib/corpus-x.ts`; run after to avoid conflicts)
- **Category**: bug
- **Planned at**: commit `b85a7c1`, 2026-08-05

## Why this matters

Three small defects on the one live row of `/sources`: the corpus summary
pulls every row over the wire to return one integer (grows with every
import; a future 20k-row archive upload makes the page pay for 20k
timestamps per render); the identity line renders `X — @@handle` because
the stored handle already carries `@`; and the client's receipt state
survives runs it does not describe — a failed second run leaves the
previous success on screen, and the imported-count arithmetic double-counts
after revalidation.

## Current state

`lib/corpus-x.ts` — `corpusSummary` as of `b85a7c1` (plans 012/013 may have
shifted lines; match on content):

```ts
export async function corpusSummary(
  userId: string,
  sources: ("x" | "x-archive")[] = ["x", "x-archive"]
): Promise<{ items: number; newestPostedAt: Date | null }> {
  const rows = await db
    .select({ postedAt: sourceItem.postedAt })
    .from(sourceItem)
    .where(and(eq(sourceItem.userId, userId), inArray(sourceItem.source, sources)))
    .orderBy(desc(sourceItem.postedAt))
  return { items: rows.length, newestPostedAt: rows[0]?.postedAt ?? null }
}
```

The repo's own rule this violates — `lib/usage.ts` (comment near the top of
`summariseUsage`): aggregation happens in Postgres, not by pulling rows
across the Neon HTTP wire.

`components/sources/channel-source-row.tsx`:

```tsx
// ~36 — double count after revalidatePath refreshes the `items` prop
const imported = receipt?.ok ? items + receipt.imported : items

// ~38-42 — receipt never cleared when a new run starts
const run = () => {
  startTransition(async () => {
    setReceipt(await importFromX())
  })
}

// ~49 — the stored handle already starts with "@" (lib/channels.ts:366
// stores `@${data.username}`), so this renders "X — @@CodeHagen"
<p className="text-card-title">X{handle ? ` — @${handle}` : ""}</p>
```

Convention for handle rendering: every existing consumer renders the stored
handle bare — see `app/(app)/channels/page.tsx` and
`components/channels/connection-strip.tsx` (they render `connection.handle`
directly, which displays as `@CodeHagen`). `lib/publish.ts` strips the
leading `@` only when building a URL.

`scripts/verify-corpus-x.ts` — the stub connection uses
`handle: "devhagen"` (no `@`), which is why the double-@ survived
verification: production stores `@devhagen`-shaped values.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Install   | `pnpm install`           | exit 0              |
| Typecheck | `npx tsc --noEmit`       | exit 0, no output   |
| Tests     | `pnpm vitest run`        | all pass            |
| Lint      | `npx eslint lib/corpus-x.ts components/sources/channel-source-row.tsx scripts/verify-corpus-x.ts` | exit 0 |

## Scope

**In scope**:

- `lib/corpus-x.ts` (the `corpusSummary` function only)
- `components/sources/channel-source-row.tsx`
- `scripts/verify-corpus-x.ts` (stub handle realism only)

**Out of scope**:

- `app/(app)/sources/page.tsx` — reads `corpusSummary` and passes props;
  neither the shape nor the props change.
- `app/(app)/sources/actions.ts` — receipt shape unchanged.
- `lib/channels.ts` — the `@`-prefixed storage is the established
  convention every other consumer relies on; do NOT change how the handle
  is stored.

## Git workflow

- Same worktree/branch as plans 012/013 if dispatched together. Commit with
  an imperative message. Do NOT push.

## Steps

### Step 1: Aggregate `corpusSummary` in Postgres

Replace the body with one aggregate query (keep the signature identical):

```ts
import { count, max } from "drizzle-orm"

  const [row] = await db
    .select({
      items: count(),
      newestPostedAt: max(sourceItem.postedAt),
    })
    .from(sourceItem)
    .where(and(eq(sourceItem.userId, userId), inArray(sourceItem.source, sources)))

  return { items: row?.items ?? 0, newestPostedAt: row?.newestPostedAt ?? null }
```

(`max()` ignores NULLs by SQL semantics, so this is also NULL-safe. If
drizzle's `max()` returns `string | null` for a timestamp column on this
driver, coerce with `new Date(...)` — check the inferred type and match the
declared return type; do not change the return type.)

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Render the handle the way the rest of the product does

In `channel-source-row.tsx`, change the identity line to render the stored
handle bare (it carries its own `@`), tolerating both stored shapes:

```tsx
<p className="text-card-title">
  X{handle ? ` — ${handle.startsWith("@") ? handle : `@${handle}`}` : ""}
</p>
```

In `scripts/verify-corpus-x.ts`, change the stub connection's handle to the
production shape: `handle: "@devhagen"`. Then check the script's URL
assertions still hold — post-013 the stub row/URL construction may differ;
the point is that the stub must exercise the `@`-stripping path the way
production data does.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Make the receipt describe exactly one run

In `channel-source-row.tsx`:

- Clear stale state when a run starts:

```tsx
const run = () => {
  setReceipt(null)
  startTransition(async () => {
    setReceipt(await importFromX())
  })
}
```

- Delete the `items + receipt.imported` arithmetic. `revalidatePath` in the
  action refreshes the `items` prop after every run, so the prop is the
  single source of truth:

```tsx
const imported = items
```

(Then inline the variable away if it reads better — the button label and
the "N posts in" line both key off `items` alone.)

- Keep the receipt paragraph rendering as is otherwise: with the state
  cleared on dispatch, a failed run now shows its own error instead of the
  previous success, and the baseline "N posts in" line reappears from the
  refreshed prop on the next render.

**Verify**: `npx tsc --noEmit` → exit 0; `pnpm vitest run` → all pass.

## Done criteria

- [ ] `npx tsc --noEmit` exits 0
- [ ] `pnpm vitest run` exits 0
- [ ] `npx eslint lib/corpus-x.ts components/sources/channel-source-row.tsx scripts/verify-corpus-x.ts` exits 0
- [ ] `grep -n "count()" lib/corpus-x.ts` shows the aggregate; `grep -n "orderBy" lib/corpus-x.ts` shows no ordering inside `corpusSummary`
- [ ] `grep -n '@\${handle}' components/sources/channel-source-row.tsx` returns nothing
- [ ] `grep -n "setReceipt(null)" components/sources/channel-source-row.tsx` returns one match
- [ ] `grep -n "items + receipt" components/sources/channel-source-row.tsx` returns nothing
- [ ] `git status` shows no modified files outside the in-scope list

## STOP conditions

Stop and report back (do not improvise) if:

- The two UI files drifted from the excerpts (someone else edited them).
- Plan 013's rewrite of `corpusSummary` already landed in a different shape
  (it should not have touched it — but if it did, reconcile instead of
  overwriting).
- Drizzle's `count()`/`max()` are unavailable on this version — report the
  version rather than hand-rolling `sql` fragments.

## Maintenance notes

- When the LinkedIn import lands, `corpusSummary`'s `sources` default
  gains `"linkedin" | "linkedin-export"` — the aggregate shape needs no
  change.
- Reviewer: check the `max()` return type coercion — a `string` sneaking
  through as `Date` would render "Invalid Date" on the row.
- Deferred on purpose: pre-rendered relative timestamps ("2 hours ago") for
  the row, matching `lib/sources.ts` fixtures — needs a shared formatter;
  not worth blocking this plan on.

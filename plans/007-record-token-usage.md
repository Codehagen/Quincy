# Plan 007: Record what every turn costs, and make /credits real

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise.
>
> **Drift check (run first)**: `git diff --stat dd10a73..HEAD -- app/api/chat/route.ts lib/schema-app.ts "app/(app)/credits/page.tsx"`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW — additive only; changes no existing behaviour and can lock nobody out
- **Depends on**: none (plans 001–006 are all shipped)
- **Category**: observability
- **Planned at**: commit `dd10a73`, 2026-08-03

## Why this matters

Nobody knows what a Quincy user costs. Not roughly — at all. That single missing
number blocks three separate decisions:

1. **The trial ceiling.** A free verified email currently buys 24 hours of
   unmetered `anthropic/claude-sonnet-5`. The cap that stops that has to be set
   to *something*, and right now any number would be a guess.
2. **Whether $49 flat is profitable.** If a heavy user costs $80/month against a
   $49 price, flat pricing is a loss-maker — and it would be invisible until the
   bill arrived. This is the bigger question, and it applies to paying customers,
   not just trial abuse.
3. **Whether to adopt usage-based billing at all.** Stripe has a token-billing
   product and a `@stripe/ai-sdk` package that meters the Vercel AI SDK
   directly. Adopting it before knowing unit economics means guessing at markup.

This plan does not enforce anything. It cannot lock anyone out. It records what
each turn actually consumed, and turns `/credits` from a placeholder into a
page with a real number behind it — which is what that placeholder already
promises:

> *"The usage meter belongs in the sidebar footer next to this link — it stays
> out until there is a real number behind it."*

Plan 008 (the trial ceiling) is deliberately **not** written yet, because its
only interesting decision — the number — should come from this plan's data.

## Current state

### The measurement is available

`streamText`'s result exposes `usage` as a promise. From
`node_modules/ai/dist/index.d.ts:320`:

```ts
type LanguageModelUsage = {
    inputTokens: number | undefined
    inputTokenDetails: {
        // includes cached vs non-cached input token counts
        ...
    }
    outputTokens: number | undefined
    ...
}
```

`result.usage` resolves once the stream finishes, so it can be awaited inside
`onEnd` — after the user already has their answer. Recording costs the user no
latency.

### `app/api/chat/route.ts` today

The route builds `result = streamText({...})` and returns
`createUIMessageStreamResponse({ stream: toUIMessageStream({ ..., onEnd }) })`.
Inside `onEnd` it already does two follow-up writes — `saveTurn` and
`captureTurn` — each wrapped in its own `try`/`catch` that logs rather than
throws, with this reasoning in the existing comment:

```ts
// The answer has already streamed to the browser by now. A failed write
// should cost the user their history, not their reply — so this logs
// rather than throwing into the stream's teardown.
```

**Match that pattern exactly.** A failed usage write must never surface to the
user; it is bookkeeping, not the product.

Note the first line of `onEnd`:

```ts
if (isAborted) {
  return
}
```

That early return is correct for *saving a half-written reply*. It is wrong for
usage: **an aborted generation still spent tokens.** Your write has to happen
before that return, or on its own path.

### `lib/schema-app.ts`

Our hand-written tables live here — `conversation`, `message`, `brainPage`,
`brainEvent`, `brainPageVersion`. The file opens with a comment explaining why
it is separate from `lib/schema.ts`:

> *"That file is generated output — `pnpm auth:generate` overwrites it whole
> every time a Better Auth plugin changes."*

The new table goes in **this** file, never in `lib/schema.ts`.

Existing tables index like this — follow the shape:

```ts
  (table) => [
    index("conversation_user_updated_idx").on(table.userId, table.updatedAt),
  ]
```

### `app/(app)/credits/page.tsx` today

A `SurfacePlaceholder`, like `/settings` was before plan 001's neighbourhood.
It renders `title="Credits."`, `description="What you have, what it went on."`
and the promise quoted above.

### Repo conventions

Comments explain *why* in prose above the decision — see `lib/trial.ts`.
`pnpm` only. Prettier configured; run `pnpm format` if lint complains.
Icons are `hugeicons`, never lucide (`AGENTS.md`). Page layout follows
`PageHeader` + a `max-w-3xl` container — copy the shape from
`app/(app)/settings/billing/page.tsx`.

## The pricing facts, and the two traps in them

Prices below are Anthropic's published list rates for `claude-sonnet-5`:

| | Per 1M tokens |
|---|---|
| Input | **$3.00** — but see trap 1 |
| Output | **$15.00** — but see trap 1 |
| Cached input read | ~0.1× input |
| Cache write (5-min TTL) | 1.25× input |

**Trap 1 — introductory pricing expires 2026-08-31.** Sonnet 5 is currently
$2.00 / $10.00 per MTok under introductory pricing, reverting to $3.00 / $15.00
on 1 September 2026. That is **28 days from this plan's date**. Any cost
baseline gathered in August understates September by 50%. Record the price
constants used, so a later reading of the data can tell which regime it came
from — do not silently bake in one number.

**Trap 2 — this app does not call Anthropic directly.** `lib/chat` resolves
`anthropic/claude-sonnet-5` through the **Vercel AI Gateway**
(`AI_GATEWAY_API_KEY`). The gateway's billing is its own; Anthropic's list price
is an *estimate*, not the invoice. Name this in the code so nobody later
mistakes the number for ground truth — the gateway dashboard is.

Both traps point the same way: **token counts are the durable fact, cost is a
derived estimate.** Store both, and store the tokens in a form that lets the
cost be recomputed later when the real rate is known.

## Commands you will need

| Purpose   | Command                | Expected on success                       |
|-----------|------------------------|-------------------------------------------|
| Typecheck | `pnpm typecheck`       | exit 0                                    |
| Tests     | `pnpm test`            | exit 0, all pass                          |
| Lint      | `pnpm lint`            | exit 1 with exactly 3 pre-existing errors |
| Schema    | `pnpm db:push --force` | `[✓] Changes applied`                     |

`pnpm lint` fails before you touch anything: 3 known errors in
`components/rhythm-settings-dialog.tsx` (2) and `hooks/use-mobile.ts` (1). Do
not fix them; do not add a fourth.

**`pnpm db:push` writes to the shared Neon branch** — the same database
production uses. This plan only *adds* a table, which is safe. Do not run any
command that drops or alters an existing column.

## Scope

**In scope**:
- `lib/pricing.ts` (create) — price constants + the pure cost function
- `lib/pricing.test.ts` (create)
- `lib/usage.ts` (create) — the write and the summary read
- `lib/schema-app.ts` (add the `usageEvent` table)
- `app/api/chat/route.ts` (record usage in `onEnd`)
- `app/(app)/credits/page.tsx` (replace the placeholder)

**Out of scope** (do NOT touch):
- `lib/schema.ts` — generated by `pnpm auth:generate`.
- `lib/entitlement.ts`, `lib/billing.ts`, `lib/trial.ts` — **this plan enforces
  nothing.** If you find yourself adding a check that can refuse a request, stop:
  that is plan 008 and it needs data this plan has not collected yet.
- `lib/heartbeat.ts` — it also makes model calls (`generateObject`). Recording
  those is a good follow-up and is deliberately left out to keep this change
  reviewable. Note it in your report.
- Prompt caching. The brain is currently re-billed at full input price every
  turn because no `cache_control` is set anywhere. That is a real and probably
  large saving — and it is a separate change, whose value this plan's data will
  actually let you measure.
- The sidebar usage meter. `/credits` first.

## Git workflow

- Stay on the branch you are given; do not create another.
- Conventional commits, lowercase, matching `git log`
  (`feat: welcome email, on both signup paths`).
  Suggested: `feat: record what every turn costs`
- Do not push, do not open a PR.

## Steps

### Step 1: `lib/pricing.ts`

```ts
/**
 * What a turn costs, as an estimate.
 *
 * Two things stop this from being the truth, and both are deliberate:
 *
 * 1. These are Anthropic's published list rates. This app reaches the model
 *    through the Vercel AI Gateway, which bills on its own terms. The gateway
 *    dashboard is the invoice; this is a useful approximation of it.
 *
 * 2. Sonnet 5 is on introductory pricing until 2026-08-31 — $2/$10 per million
 *    rather than $3/$15. Everything recorded before that date is roughly half
 *    what the same usage will cost in September.
 *
 * Which is why `usage_event` stores token counts alongside the money: tokens
 * are the durable fact and survive a price change, cost is derived and does
 * not. When the rate moves, edit the table below and the *new* rows are right;
 * old rows keep the cost that was true when they were written.
 */

/** Micro-dollars: 1_000_000 = $1.00. Integers, so no float drift on a sum. */
export type Micros = number

type Rate = {
  /** Micro-dollars per input token. */
  input: number
  /** Micro-dollars per output token. */
  output: number
  /**
   * Micro-dollars per cached input token. Roughly a tenth of `input` — which
   * is why cached tokens are recorded separately: counting them at full price
   * would overstate a cached turn by about 10x.
   */
  cachedInput: number
}

/**
 * Introductory pricing, in effect until 2026-08-31. On 1 September this
 * becomes input 3, output 15, cachedInput 0.3 — change it then, and note the
 * date in the commit so the discontinuity in the data has an explanation.
 */
const SONNET_5: Rate = { input: 2, output: 10, cachedInput: 0.2 }

const RATES: Record<string, Rate> = {
  "anthropic/claude-sonnet-5": SONNET_5,
}

/** The rate we assume for a model we have no entry for. */
const FALLBACK = SONNET_5

export type TurnUsage = {
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
}

/**
 * Pure. No clock, no database, no network — which is what makes it the one
 * part of this feature worth unit-testing.
 */
export function estimateCostMicros(model: string, usage: TurnUsage): Micros {
  const rate = RATES[model] ?? FALLBACK

  return Math.round(
    usage.inputTokens * rate.input +
      usage.cachedInputTokens * rate.cachedInput +
      usage.outputTokens * rate.output
  )
}

/** For display. `1_234_567` → `"$1.23"`. */
export function formatMicros(micros: Micros): string {
  return `$${(micros / 1_000_000).toFixed(2)}`
}
```

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: `lib/pricing.test.ts`

Follow the structure of `lib/entitlement.test.ts` — no mocks needed here, the
function is pure.

```ts
import { describe, expect, it } from "vitest"

import { estimateCostMicros, formatMicros } from "@/lib/pricing"

const MODEL = "anthropic/claude-sonnet-5"

describe("estimateCostMicros", () => {
  it("is zero for a turn that consumed nothing", () => {
    expect(
      estimateCostMicros(MODEL, {
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
      })
    ).toBe(0)
  })

  it("prices a million input tokens at the input rate", () => {
    expect(
      estimateCostMicros(MODEL, {
        inputTokens: 1_000_000,
        cachedInputTokens: 0,
        outputTokens: 0,
      })
    ).toBe(2_000_000)
  })

  it("prices a million output tokens at the output rate", () => {
    expect(
      estimateCostMicros(MODEL, {
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 1_000_000,
      })
    ).toBe(10_000_000)
  })

  it("charges cached input at a fraction of fresh input", () => {
    const fresh = estimateCostMicros(MODEL, {
      inputTokens: 100_000,
      cachedInputTokens: 0,
      outputTokens: 0,
    })
    const cached = estimateCostMicros(MODEL, {
      inputTokens: 0,
      cachedInputTokens: 100_000,
      outputTokens: 0,
    })

    // The exact ratio is a pricing detail; that cached is much cheaper is the
    // property worth pinning, because getting it wrong overstates every
    // cached turn.
    expect(cached).toBeLessThan(fresh / 5)
  })

  it("falls back to a known rate for an unrecognised model", () => {
    expect(
      estimateCostMicros("some/model-we-have-never-seen", {
        inputTokens: 1_000_000,
        cachedInputTokens: 0,
        outputTokens: 0,
      })
    ).toBeGreaterThan(0)
  })

  it("returns whole micros, never a fraction", () => {
    const cost = estimateCostMicros(MODEL, {
      inputTokens: 7,
      cachedInputTokens: 3,
      outputTokens: 11,
    })

    expect(Number.isInteger(cost)).toBe(true)
  })
})

describe("formatMicros", () => {
  it("renders micro-dollars as money", () => {
    expect(formatMicros(1_234_567)).toBe("$1.23")
    expect(formatMicros(0)).toBe("$0.00")
  })
})
```

**Verify**: `pnpm test` → exit 0, 7 new tests pass, all previous tests still pass.

### Step 3: The `usageEvent` table

Add to the **end** of `lib/schema-app.ts`, after the existing tables and before
the `relations` exports at the bottom:

```ts
/**
 * One row per model call. Append-only; nothing reads it to make a decision.
 *
 * `conversationId` is deliberately a plain column with **no foreign key**.
 * Every other reference to a conversation cascades on delete, which is right
 * for messages and wrong for money: deleting a thread must not erase the record
 * of what it cost. The id is kept for grouping and debugging, and is allowed to
 * point at a conversation that no longer exists.
 *
 * Tokens and cost are both stored. Tokens are the durable fact; cost is an
 * estimate at the rates in lib/pricing.ts on the day it was written, and those
 * rates change — Sonnet 5's introductory pricing ends 2026-08-31. Keeping the
 * token counts is what makes a later recomputation possible.
 */
export const usageEvent = pgTable(
  "usage_event",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id"),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    cachedInputTokens: integer("cached_input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    /** Micro-dollars. See lib/pricing.ts. */
    costMicros: integer("cost_micros").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    // Every read is "this user, this period" — the meter and, later, the cap.
    index("usage_event_user_created_idx").on(table.userId, table.createdAt),
  ]
)
```

`integer` must be added to the `drizzle-orm/pg-core` import at the top of the
file if it is not already there.

**Verify all**:
- `pnpm typecheck` → exit 0
- `pnpm db:push --force` → `[✓] Changes applied`, and the printed SQL contains
  `CREATE TABLE "usage_event"` and **no** `DROP` statement. If you see a `DROP`,
  that is a STOP condition.

### Step 4: `lib/usage.ts`

```ts
import { and, desc, eq, gte, sql } from "drizzle-orm"

import { db } from "./db"
import { usageEvent } from "./schema-app"
import { estimateCostMicros, type Micros } from "./pricing"

/**
 * Record what a turn consumed.
 *
 * Called from the chat route's `onEnd`, after the answer has already reached
 * the browser — so this costs the user nothing in latency, and a failure costs
 * them nothing at all. The caller swallows errors for exactly that reason.
 *
 * Recorded for everyone, paying or trialing. The point is knowing what a user
 * costs, and a paying user's cost is the more interesting number of the two.
 */
export async function recordUsage(input: {
  userId: string
  conversationId?: string | null
  model: string
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
}): Promise<void> {
  const costMicros = estimateCostMicros(input.model, {
    inputTokens: input.inputTokens,
    cachedInputTokens: input.cachedInputTokens,
    outputTokens: input.outputTokens,
  })

  await db.insert(usageEvent).values({
    id: `use_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
    userId: input.userId,
    conversationId: input.conversationId ?? null,
    model: input.model,
    inputTokens: input.inputTokens,
    cachedInputTokens: input.cachedInputTokens,
    outputTokens: input.outputTokens,
    costMicros,
  })
}

export type UsageSummary = {
  turns: number
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  costMicros: Micros
}

/**
 * One user's usage since a given moment. One query, aggregated in Postgres
 * rather than by pulling rows across the wire — the row count grows with every
 * turn forever, and lib/session.ts's note about ~120ms round trips applies here
 * too.
 */
export async function summariseUsage(
  userId: string,
  since: Date
): Promise<UsageSummary> {
  const [row] = await db
    .select({
      turns: sql<number>`count(*)::int`,
      inputTokens: sql<number>`coalesce(sum(${usageEvent.inputTokens}), 0)::int`,
      cachedInputTokens: sql<number>`coalesce(sum(${usageEvent.cachedInputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${usageEvent.outputTokens}), 0)::int`,
      costMicros: sql<number>`coalesce(sum(${usageEvent.costMicros}), 0)::int`,
    })
    .from(usageEvent)
    .where(and(eq(usageEvent.userId, userId), gte(usageEvent.createdAt, since)))

  return (
    row ?? {
      turns: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      costMicros: 0,
    }
  )
}

/** The most recent turns, for the activity list on /credits. */
export async function recentUsage(userId: string, limit = 10) {
  return db
    .select({
      id: usageEvent.id,
      model: usageEvent.model,
      inputTokens: usageEvent.inputTokens,
      outputTokens: usageEvent.outputTokens,
      costMicros: usageEvent.costMicros,
      createdAt: usageEvent.createdAt,
    })
    .from(usageEvent)
    .where(eq(usageEvent.userId, userId))
    .orderBy(desc(usageEvent.createdAt))
    .limit(limit)
}
```

**Verify**: `pnpm typecheck` → exit 0.

### Step 5: Record from the chat route

In `app/api/chat/route.ts`, add the import:

```ts
import { recordUsage } from "@/lib/usage"
```

Then, inside `onEnd`, add this block **above** the existing
`if (isAborted) { return }` early return:

```ts
        /**
         * Usage first, and deliberately above the `isAborted` return.
         *
         * A stopped generation still spent tokens — the model produced them,
         * we were billed for them, and the only thing the abort changed is
         * that we throw the text away. Recording below the early return would
         * make every cancelled turn invisible and quietly understate what a
         * user costs.
         *
         * Same failure posture as the two writes below it: the answer has
         * already reached the browser, so a bookkeeping failure logs and is
         * dropped rather than throwing into the stream's teardown.
         */
        try {
          const usage = await result.usage

          await recordUsage({
            userId: session.user.id,
            conversationId: id,
            model: MODEL,
            inputTokens: usage.inputTokens ?? 0,
            cachedInputTokens:
              usage.inputTokenDetails?.cachedInputTokens ??
              usage.inputTokenDetails?.cacheReadInputTokens ??
              0,
            outputTokens: usage.outputTokens ?? 0,
          })
        } catch (cause) {
          console.error("[chat] could not record usage:", cause)
        }
```

**On the cached-token field name**: read the `inputTokenDetails` type in
`node_modules/ai/dist/index.d.ts` (around line 328) and use whichever field it
actually declares for cached/non-cached input. The two names above are a guess
at the shape; **if neither exists, use the real one and say so in your report**.
If `inputTokenDetails` has no cached-token field at all, pass `0` and report
that — do not invent a value.

**Verify**: `pnpm typecheck` → exit 0.

### Step 6: Make `/credits` real

Replace `app/(app)/credits/page.tsx` entirely. Model the layout on
`app/(app)/settings/billing/page.tsx` — same container, same `PageHeader`.

Requirements, not a script — write it in the house style:

- Server Component. Read the session via `getSession()` from `@/lib/session`;
  `redirect("/login")` if absent (the layout already gates, this is narrowing).
- Call `summariseUsage(session.user.id, startOfMonth)` and
  `recentUsage(session.user.id)` **concurrently** with `Promise.all` — two round
  trips issued together rather than in sequence, for the reason in
  `lib/session.ts`.
- `startOfMonth` = first day of the current month, local time.
- Show: turns this month, estimated cost this month (`formatMicros`), and
  input/output token totals.
- Below that, the recent turns: time, tokens, estimated cost.
- **Label the cost as an estimate on the page**, in one short sentence — a
  number that looks authoritative and is not will eventually mislead somebody.
  Say it reaches the model through the Vercel AI Gateway and the gateway's own
  dashboard is the invoice.
- Empty state: if `turns === 0`, render the `Empty` component (see
  `components/ui/empty.tsx`, used by `components/surface-placeholder.tsx`) with
  a sentence saying usage appears here after the first conversation. Do not show
  a table of zeroes.
- Use `hugeicons` if you use an icon at all — never lucide.

**Verify all**:
- `pnpm typecheck` → exit 0
- `pnpm build` → exit 0, and `/credits` appears in the printed route list

### Step 7: Prove a turn is actually recorded

This is the check that distinguishes "compiles" from "works". It needs a dev
server, `AI_GATEWAY_API_KEY` and `DATABASE_URL` in `.env.local`.

1. Start the server: `BETTER_AUTH_URL=http://localhost:3100 pnpm dev --port 3100`
2. `npx tsx --env-file=.env.local scripts/dev-account.ts`
3. Sign in and capture the cookie (needs an `Origin` header or CSRF rejects it):

```
EMAIL=$(grep '^DEV_ACCOUNT_EMAIL=' .env.local | sed 's/^[^=]*="\{0,1\}//; s/"\{0,1\}$//')
PASS=$(grep '^DEV_ACCOUNT_PASSWORD=' .env.local | sed 's/^[^=]*="\{0,1\}//; s/"\{0,1\}$//')
curl -s -c /tmp/c.txt -o /dev/null -w "signin %{http_code}\n" -X POST http://localhost:3100/api/auth/sign-in/email \
  -H 'Content-Type: application/json' -H 'Origin: http://localhost:3100' \
  --data "$(printf '{"email":"%s","password":"%s"}' "$EMAIL" "$PASS")"
```

4. Send one short turn:

```
curl -s -o /dev/null -w "chat %{http_code}\n" --max-time 60 -b /tmp/c.txt \
  -X POST http://localhost:3100/api/chat -H 'Content-Type: application/json' \
  -d '{"id":"conv_usage_probe","messages":[{"id":"m1","role":"user","parts":[{"type":"text","text":"Say only: ok"}]}]}'
```

5. Read the row back — write a throwaway script under `/tmp` (not in the repo)
   that selects from `usage_event` for that user, ordered by `created_at desc`,
   limit 1.

**Verify**: exactly one new row, with `input_tokens > 0`, `output_tokens > 0`,
and `cost_micros > 0`.

**Report the actual numbers in your report.** They are the first real data point
this plan exists to produce — a single turn's input token count also tells the
reviewer roughly what the brain costs per turn, which is the input to the
prompt-caching decision.

6. Stop the dev server (`pkill -f "next dev"`).

If step 7 cannot run (no gateway key, no database), say so plainly rather than
claiming success.

## Test plan

New file `lib/pricing.test.ts`, 7 tests, following the structure of
`lib/entitlement.test.ts`. The pricing function is pure, so it needs no mocks —
which is precisely why it is the part worth testing.

Cases: zero usage, input rate, output rate, cached-cheaper-than-fresh, unknown
model falls back, integer output, and money formatting.

`recordUsage` / `summariseUsage` are **not** unit-tested. They are a single
INSERT and a single aggregate SELECT; a test of them would assert against a
mock of Drizzle's query builder and prove only that the mock was called. Step 7
covers them against a real database, which is the check that means something.

Verification: `pnpm test` → all pass, 29 total (22 existing + 7 new).

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0 with 29 passing
- [ ] `pnpm lint` reports exactly the same 3 pre-existing errors
- [ ] `pnpm build` exits 0 and lists `/credits`
- [ ] `pnpm db:push --force` applied a `CREATE TABLE "usage_event"` and no `DROP`
- [ ] `grep -c "usage_event" lib/schema-app.ts` returns at least 1
- [ ] `grep -n "recordUsage" app/api/chat/route.ts` returns 2 matches
- [ ] `grep -rn "usageEvent\|recordUsage" lib/entitlement.ts lib/billing.ts lib/trial.ts` returns **no** matches — this plan enforces nothing
- [ ] Step 7 produced a row, or the report states plainly why it could not run
- [ ] `git status --short` lists no files outside the in-scope list

## STOP conditions

Stop and report back (do not improvise) if:

- `pnpm db:push` proposes a `DROP` of any kind. Adding a table should never
  drop anything; if it wants to, the schema has drifted and a human needs to
  look before any data is lost.
- `result.usage` does not exist on the `streamText` result, or its shape does
  not match the excerpt in "Current state" — the installed `ai` version differs
  from the one this plan was written against (`ai@7.0.45`).
- `inputTokenDetails` has no cached-token field under any name. Record `0` and
  report it; do not guess a field.
- You find yourself adding a check that could refuse a request, return a 402, or
  otherwise gate anything. That is plan 008, and it must not ship before there
  is data to set its number with.
- Step 7's row has `cost_micros = 0` while tokens are non-zero — the pricing
  wiring is wrong and the whole point of the plan is missing.

## Maintenance notes

- **The price table has a deadline.** Sonnet 5's introductory rate ends
  2026-08-31. On 1 September, change `SONNET_5` in `lib/pricing.ts` to
  `{ input: 3, output: 15, cachedInput: 0.3 }` and note the date in the commit —
  the data will show a step change that day and it should have an explanation
  attached to it.
- **This is an estimate against the Vercel AI Gateway, not an invoice.** If the
  recorded totals and the gateway's dashboard diverge, the dashboard is right.
  Divergence is worth investigating rather than papering over — it likely means
  the gateway's rates differ from Anthropic's list.
- **The obvious next saving is prompt caching.** The brain goes into the system
  prompt on every turn and no `cache_control` is set anywhere in this codebase,
  so it is billed fresh each time at ~10x the cached rate. Step 7's input-token
  count is the measurement that tells you how much that is worth. Doing it
  properly means reading `shared/prompt-caching.md`-style guidance on prefix
  stability first — the brain must render deterministically, or the cache never
  hits.
- **`lib/heartbeat.ts` also spends money** (`generateObject`, once per user per
  week) and is deliberately not recorded here. It is a small, bounded cost, and
  adding it is a two-line follow-up once this table exists.
- **Plan 008 is unwritten on purpose.** Its only real decision is the number,
  and the number should come from a fortnight of this table. Write it when the
  p50 and p95 cost per user are known, not before.

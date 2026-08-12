# Plan 030: The chat route bounds what one request can carry and what one day can spend

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md` — unless a reviewer dispatched you and told
> you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 223a12d..HEAD -- app/api/chat/route.ts lib/usage.ts lib/entitlement.ts lib/chat-error.ts .env.example`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (a ceiling set too low cuts off a real user — defaults here are deliberately generous)
- **Depends on**: none (plan 027 gives its tests a CI home, but nothing blocks)
- **Category**: security / money
- **Planned at**: commit `223a12d`, 2026-08-12

## Why this matters

`AGENTS.md` ("Money") states the house rule: every code path that spends
needs a **ceiling**, and if a human can trigger it, a **cooldown** — "Both,
not either." `/api/chat` is the largest spend surface in the product and has
neither. Two concrete gaps:

1. **No bound on the request.** The route reads
   `{ id, messages }: { id: string; messages: UIMessage[] }` straight from
   `request.json()` and passes the whole array to the model. A single request
   can carry an arbitrarily large conversation, and every character of it is
   billed as input tokens.
2. **No ceiling on a user's total.** `recordUsage` meters every turn *after*
   the spend, and nothing ever reads the meter back on the request path. An
   entitled account — including a free-day trial account, which requires no
   card — can spend as fast as the network allows, all day.

This also unblocks the product: `plans/README.md` holds plan 008 ("the trial
ceiling") open waiting on usage data, and the marketing waitlist is already
live. A configurable ceiling read from `usage_event` ships the **mechanism**
now with a generous number, and the number can tighten from data without a
code change.

`AGENTS.md` ("Money") also warns: "A comment explaining why a guard is
unnecessary is the smell this section exists for." Do not accept an argument
that the entitlement gate is enough — it gates *who* may spend, not *how
much*.

## Current state

- The route's input contract and gate:

```ts
// app/api/chat/route.ts:66-83 (abridged)
const entitlement = await resolveEntitlementForRequest(session.user)

if (!isEntitled(entitlement)) {
  return paywallResponse(entitlement)
}
...
const { id, messages }: { id: string; messages: UIMessage[] } =
  await request.json()
```

- The refusal shape the client already renders. `paywallResponse`:

```ts
// lib/entitlement.ts:94-105
export function paywallResponse(entitlement: Entitlement): Response {
  return Response.json(
    {
      error:
        entitlement.state === "lapsed"
          ? "Your subscription is no longer active."
          : "Your free day is over.",
      state: entitlement.state,
    },
    { status: 402 }
  )
}
```

  `lib/chat-error.ts` (`readableChatError`) extracts `{ error: "sentence" }`
  from any non-2xx body and shows the sentence to the user — so a 413 or 429
  with that shape needs no client change.

- The aggregate that makes the ceiling one query:

```ts
// lib/usage.ts:57-70 (abridged)
export async function summariseUsage(
  userId: string,
  since: Date
): Promise<UsageSummary> {
  const [row] = await db
    .select({
      turns: sql<number>`count(*)::int`,
      ...
      costMicros: sql<number>`coalesce(sum(${usageEvent.costMicros}), 0)::int`,
    })
    .from(usageEvent)
    .where(and(eq(usageEvent.userId, userId), gte(usageEvent.createdAt, since)))
```

  `costMicros` is micro-dollars: a measured trivial turn was $0.00293 =
  2,930 micros (`plans/README.md`). $10 = 10,000,000 micros.

- Model calls are billed on the Vercel AI Gateway
  (`MODEL = process.env.CHAT_MODEL ?? "anthropic/claude-sonnet-5"`,
  `app/api/chat/route.ts:29`). Usage is recorded in `onEnd`
  (`app/api/chat/route.ts:142-149`), deliberately including aborted turns.
- `.env.example` documents env vars with comment blocks; `CHAT_MODEL` is the
  neighbouring example (its line ~46).
- Test conventions: vitest, `node` environment, `vi.mock("@/lib/db")` where
  a module touches the database — `lib/entitlement.test.ts:24-31` is the
  exemplar. Pure helpers get plain describe/it files next to the module.

## Commands you will need

| Purpose   | Command                    | Expected on success |
|-----------|----------------------------|---------------------|
| Typecheck | `pnpm typecheck`           | exit 0              |
| Tests     | `pnpm test`                | all pass, incl. new |
| One file  | `pnpm test lib/chat-guards`| new suite passes    |
| Lint      | `pnpm lint`                | exit 0              |

## Scope

**In scope** (the only files you should modify or create):
- `lib/chat-guards.ts` (create)
- `lib/chat-guards.test.ts` (create)
- `app/api/chat/route.ts` (wire the two guards in)
- `.env.example` (document the two new variables)

**Out of scope** (do NOT touch):
- `lib/usage.ts` — read `summariseUsage`, do not modify it. (Its `::int`
  casts are a recorded separate finding; leave them.)
- `app/api/editor/projects/[id]/agent/route.ts` — the editor agent route has
  the same gap and should get the same helper, but its body shape differs;
  it is a named follow-up, not part of this plan.
- `lib/entitlement.ts`, `lib/chat-error.ts`, any client component — the
  refusal shape is designed so no client change is needed.
- The per-turn `maxOutputTokens` and model choice — not this plan's concern.

## Git workflow

- Branch: `advisor/030-bound-and-ceiling-the-chat-route`
- Commit per step. Message style: single evocative sentence (see `git log
  --oneline -5`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create `lib/chat-guards.ts` with two pure decisions

The module holds decisions, not I/O, so it tests without mocks:

```ts
import type { UIMessage } from "ai"

/**
 * Ceilings on the chat route, per AGENTS.md "Money": every spending path
 * gets a ceiling. These bound the request and the day; the entitlement
 * gate (who may spend at all) lives in lib/entitlement.ts.
 *
 * Defaults are deliberately generous — tripwires, not walls. Both move via
 * env without a deploy... (state each default and why it is safe)
 */
const DEFAULT_MAX_MESSAGES = 200
const DEFAULT_MAX_INPUT_CHARS = 400_000 // ~100k tokens, half the context window
const DEFAULT_DAILY_CEILING_MICROS = 10_000_000 // $10/day; a measured trivial turn is 2,930

export function maxMessages(): number { /* env CHAT_MAX_MESSAGES ?? default */ }
export function maxInputChars(): number { /* env CHAT_MAX_INPUT_CHARS ?? default */ }
export function dailyCeilingMicros(): number { /* env CHAT_DAILY_CEILING_MICROS ?? default */ }

/** Total characters of text parts across the conversation. */
export function measureInput(messages: UIMessage[]): { count: number; chars: number }

export type InputVerdict = { ok: true } | { ok: false; error: string }

/** Rejects a request that is not a plausible conversation. */
export function inputVerdict(messages: unknown): InputVerdict
// - not an array, or empty → { ok: false, error: "That request did not carry a conversation." }
// - count > maxMessages() or chars > maxInputChars() →
//   { ok: false, error: "This conversation is too long to send in one piece. Start a new one — the brain carries what matters across." }

export type CeilingVerdict = { ok: true } | { ok: false; error: string }

export function ceilingVerdict(spentMicros: number): CeilingVerdict
// spentMicros >= dailyCeilingMicros() →
// { ok: false, error: "Quincy has done a full day's work already. It picks up again tomorrow." }
```

Implementation notes:
- Read env inside the functions (not at module scope) so tests can set
  `process.env` per case — the pattern `scripts/verify-channel-maintenance.ts`
  taught this repo (recorded in `advisor-plans/README.md`).
- `measureInput` counts only `part.type === "text"` part lengths plus a
  fixed 1,000-char allowance per non-text part, so a file part cannot dodge
  the meter. Keep it total, simple, and documented.
- Copy is final as written above — it matches the product's voice (see
  `paywallResponse` and the voice-notes 429 for register).

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Test the decisions

`lib/chat-guards.test.ts`, plain vitest, no mocks. Cases (each on its own
`it`):

- `inputVerdict(null)`, `inputVerdict("x")`, `inputVerdict([])` → not ok.
- A 3-message conversation of short text parts → ok.
- Exactly `maxMessages()` messages → ok; one more → not ok (boundary pinned).
- One message whose text totals `maxInputChars() + 1` → not ok.
- A message with a non-text part contributes the fixed allowance
  (assert via `measureInput`).
- `ceilingVerdict(dailyCeilingMicros() - 1)` → ok;
  `ceilingVerdict(dailyCeilingMicros())` → not ok (boundary pinned).
- Env override: set `process.env.CHAT_DAILY_CEILING_MICROS = "5000"` in the
  test, assert `ceilingVerdict(5001)` is not ok, then delete the env var in
  `afterEach`.

**Verify**: `pnpm test lib/chat-guards` → all pass.

### Step 3: Wire both guards into the route

In `app/api/chat/route.ts`, after the `request.json()` destructure (keep the
entitlement check and the `AI_GATEWAY_API_KEY` check exactly where they are):

```ts
const verdict = inputVerdict(messages)
if (!verdict.ok) {
  return Response.json({ error: verdict.error }, { status: 413 })
}

// The ceiling, before the brain render — one aggregate query against
// usage_event. Reads the last 24 hours rather than the calendar day so a
// midnight-adjacent session cannot double-spend...
const spent = await summariseUsage(
  session.user.id,
  new Date(Date.now() - 24 * 60 * 60 * 1000)
)
const ceiling = ceilingVerdict(spent.costMicros)
if (!ceiling.ok) {
  return Response.json({ error: ceiling.error, state: "ceiling" }, { status: 429 })
}
```

Ordering matters and is deliberate: entitlement (cheap, cookie-adjacent) →
gateway key → parse → input verdict (free) → ceiling (one query) → brain
render (one query) → model call. State it in a comment the way the file's
other ordering comments do.

**Verify**: `pnpm typecheck` → exit 0. `pnpm test` → all pass.
**Verify**: `grep -n "inputVerdict\|ceilingVerdict" app/api/chat/route.ts` →
both appear, above the `renderBrainForUser` call.

### Step 4: Document the variables

Add to `.env.example`, next to `CHAT_MODEL`, using the file's comment style:

- `CHAT_MAX_MESSAGES=` — per-request message cap (default 200)
- `CHAT_MAX_INPUT_CHARS=` — per-request character cap (default 400000)
- `CHAT_DAILY_CEILING_MICROS=` — per-user rolling-24h spend ceiling in
  micro-dollars (default 10000000 = $10); the tripwire that stops a scripted
  account, not a product limit — tighten from `usage_event` data.

**Verify**: `grep -c "CHAT_DAILY_CEILING_MICROS" .env.example` → 1.

### Step 5: Exercise the refusals against a running server

With `pnpm dev` and a signed-in session (create it per AGENTS.md "Signing in
locally": `npx tsx --env-file=.env.local scripts/dev-account.ts`, then sign
in through the browser or reuse an existing session cookie):

1. POST `/api/chat` with `messages: []` → 413, body carries the sentence.
2. Set `CHAT_DAILY_CEILING_MICROS=1` in `.env.local`, restart dev, send one
   ordinary chat message from the UI → the refusal sentence renders in the
   chat surface (this proves `readableChatError` unwraps it).
3. Remove the override, restart, send a message → normal reply streams.

The third check is what distinguishes a working guard from a broken endpoint
(the discriminating-triple pattern from `advisor-plans/README.md`).

**Verify**: manual, all three observations as described.

## Test plan

Covered in Steps 2 and 5: unit tests pin every boundary of both pure
decisions including env overrides; the live triple proves wiring, refusal
copy rendering, and recovery. Model after existing pure-helper suites (e.g.
`lib/post-length.test.ts` structure).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` all exit 0
- [ ] `lib/chat-guards.test.ts` exists; `pnpm test lib/chat-guards` passes with ≥ 9 tests
- [ ] `grep -n "inputVerdict" app/api/chat/route.ts` → 1 call site, before `renderBrainForUser`
- [ ] `grep -n "summariseUsage" app/api/chat/route.ts` → 1 call site
- [ ] `grep -c "CHAT_DAILY_CEILING_MICROS" .env.example` → 1
- [ ] The Step 5 triple was run and all three observations held
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `advisor-plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `app/api/chat/route.ts` no longer matches the Current state excerpts (the
  route was restructured since `223a12d`).
- You find an existing ceiling or input bound anywhere on the chat path —
  the finding may be stale; report where.
- The Step 5 refusal does not render as a sentence in the chat UI — do not
  patch client components; report what rendered instead.
- Wiring appears to require touching `lib/usage.ts` or any client component.
- You cannot create a signed-in session — report; do not weaken
  `requireEmailVerification` or invent a bypass (AGENTS.md forbids both).

## Maintenance notes

- **The number is a placeholder by design.** $10/day is a tripwire against
  scripts, not a product decision. When two weeks of `usage_event` data
  exist, set the real number via env and revisit plan 008
  (`plans/README.md`) — the mechanism this plan ships is what 008 was
  waiting to attach to. Prices double after 2026-08-31 (introductory pricing
  ends); the threshold needs re-reading then.
- **Named follow-up**: `app/api/editor/projects/[id]/agent/route.ts` has the
  same unbounded `body.messages` and no ceiling. Apply `inputVerdict` and
  `ceilingVerdict` there next; the helper was shaped so that wiring is ~6
  lines.
- The rhythm dispatcher's missing per-user daily total (`AGENTS.md`,
  "Money") can reuse `ceilingVerdict` against `summariseUsage` — same
  mechanism, scheduled caller.
- Reviewers: any future change that moves `recordUsage` out of `onEnd`, or
  stops recording aborted turns, silently weakens this ceiling — the route
  comment at `app/api/chat/route.ts:126-140` explains why aborted turns
  must stay metered.

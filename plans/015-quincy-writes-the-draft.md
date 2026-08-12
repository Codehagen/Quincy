# Plan 015: Make Quincy actually write the draft, in the voice it learned

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat e68026f..HEAD -- "app/(app)/riffs/actions.ts" lib/riffs.ts lib/post-length.ts lib/brain.ts components/riffs/riff-parts.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P0 — this is the product's core promise and the only link in
  the chain that is still a stub.
- **Effort**: M
- **Risk**: MED — introduces a third model call site and a new per-press
  spend; the money patterns from plan 012 must be copied exactly.
- **Depends on**: plans 011–014 (all DONE and merged at `e68026f`)
- **Category**: feature
- **Planned at**: commit `e68026f`, 2026-08-05

## Why this matters

`docs/vision.md` states the product as "Quincy drafts, you send." Today
Quincy does not draft. `draftAngle()` copies the angle's hook string into
every version body verbatim — there is no model call anywhere on the path
from a riff to a draft, and the function's own doc comment admits it.

Everything that was missing for real drafting now exists: the brain holds a
compiled `voice/x` page with observed rules and story pages carrying real
post URLs (plan 011, live); `renderBrainForUser` already renders all of it
into a prompt section; `CHANNEL_RULES` knows each platform's ceiling and
fold; and the approve → slot → publish chain downstream is shipped and
posting for real. This plan connects the one remaining gap, and when it
lands the full chain works end to end: **riff → a draft in your voice → you
edit and approve → it posts at a time you chose.**

## Current state

`app/(app)/riffs/actions.ts` — the whole file today (39 lines of body). Note
the doc comment's own admission and the `body: input.angle.hook` line:

```ts
export async function draftAngle(input: {
  angle: Pick<Angle, "id" | "hook" | "shape">
  riff: { sourceId: string; sourceLabel: string }
}) {
  const session = await getSession()
  if (!session) throw new Error("Not signed in")

  const id = `draft-${input.angle.id}-${Date.now().toString(36)}`

  await db.insert(draft).values({
    id,
    userId: session.user.id,
    idea: input.angle.hook,
    riffHook: input.angle.hook,
    sourceId: input.riff.sourceId,
    sourceLabel: input.riff.sourceLabel,
  })

  const channels = CHANNELS_FOR_SHAPE[input.angle.shape]

  await db.insert(draftVersion).values(
    channels.map((channel) => ({
      id: `${id}-${channel.id}`,
      draftId: id,
      channel: channel.id,
      label: channel.label,
      body: input.angle.hook,          // ← the stub this plan replaces
      state: "writing" as const,
    }))
  )

  revalidatePath("/riffs")
  revalidatePath("/drafts")

  return { draftId: id }
}
```

`components/riffs/riff-parts.tsx:255` — the only caller. It already renders
a pending state (`{pending ? "Drafting…" : "Draft this"}`) and disables the
button while in flight, so a synchronous model call needs **no UI change**.

`lib/riffs.ts:59` — `CHANNELS_FOR_SHAPE` maps a shape to channels, including
`instagram` and `substack`, which the product cannot publish to. Its own
comment says: "A first cut, deliberately: there is no channel connection
model yet, so this cannot know which of these you actually publish to. When
/channels can answer that, this narrows to the intersection instead of
guessing." /channels can answer it now.

`lib/post-length.ts:42` — `CHANNEL_RULES`, and `measurePost(text, channel)`
returning grapheme-accurate length with X's flat 23-per-URL cost.

Conventions to match, with exemplars — **read these files before writing**:

- **The model-call + metering pattern**: `lib/voice.ts` is the closest
  exemplar and was written for this repo two commits ago. Copy its shape:
  an injectable extractor type, a `jsonSchema<T>()` typed schema, one
  `generateObject` call, `usage` returned alongside the object, and
  `recordUsage` at the call site that knows the `userId`, wrapped in
  try/catch that logs and continues (`lib/voice.ts` around the
  `recordUsage` call).
- **The entitlement gate**: `resolveEntitlementForRequest` + `isEntitled`
  from `lib/entitlement.ts`. See `app/(app)/sources/actions.ts` for the
  server-action form (returns a result object, never `paywallResponse`,
  which is for route handlers).
- **Result objects, not throws**, for anything the user caused. See
  `lib/publish.ts` and `app/(app)/sources/actions.ts`.
- **The brain**: `renderBrainForUser(userId)` from `lib/brain.ts` returns
  the whole brain as a prompt section, or `""` for an empty brain.
- Comment style: explain *why* and constraints; never narrate the next line.

## The decisions this plan makes on purpose

**1. One model call produces every channel version, not one call per
channel.** The vision's rule is "adapt per channel, never cross-post"
(`docs/vision.md`), which is a statement about the *output*, not about how
many requests produce it. One call sees both channels at once and can make
them genuinely different; N calls cost N times as much and drift into
paraphrases of each other.

**2. Single posts only. No threads, in this plan.** `lib/publish.ts` sends
`draft_version.body` as exactly one post (`POST /2/tweets`). A body holding
five tweets would publish as one over-length post or be rejected on send.
So for `Thread`, `Carousel` and `Essay` shapes, generate **the strongest
single post** that carries the angle, and leave threading to a later plan
that changes the publish path too. If you find yourself designing a
separator format for multi-part bodies, that is the STOP condition below.

**3. Generate only for channels the user can actually publish to.** Narrow
`CHANNELS_FOR_SHAPE[shape]` by the user's active connections. Spending
tokens on an Instagram version that can never go out is waste, and a draft
offering a channel the user has not connected is a promise the product
cannot keep. If the intersection is empty (no connections yet), fall back to
the shape's channels unchanged so the draft still exists — a new user must
still be able to try drafting.

**4. A model failure degrades to today's behavior, it does not fail the
action.** If the call throws, still create the draft with `body = hook` (the
current stub) and report it in the result. A user who clicked "Draft this"
should get a draft they can write themselves, not an error and nothing.

**5. Pressing twice must not buy twice.** Today the id carries
`Date.now()`, so a double click creates two drafts. With a model call that
is now double spend. Guard on the existing provenance: if a draft with this
`riffHook` already exists for this user, return it instead of writing a
second one.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Install   | `pnpm install`           | exit 0              |
| Typecheck | `npx tsc --noEmit`       | exit 0, no output   |
| Tests     | `pnpm vitest run`        | all pass (134 at plan time) |
| Lint      | `npx eslint <changed files>` | exit 0, no output |

## Scope

**In scope**:

- `lib/drafting.ts` (create — the model call, mirroring `lib/voice.ts`)
- `lib/drafting.test.ts` (create)
- `app/(app)/riffs/actions.ts` (rewrite `draftAngle`)

**Out of scope** (do NOT touch):

- `components/riffs/riff-parts.tsx` — already renders the pending state and
  needs no change. If you believe it does, that is a STOP condition.
- `lib/publish.ts`, `lib/post-length.ts` — read only. `measurePost` is used
  as-is; do not change how length is computed.
- `lib/riffs.ts` — `CHANNELS_FOR_SHAPE` stays as the shape→channel map; the
  narrowing happens in the new code, not by editing this table.
- `lib/voice.ts`, `lib/corpus-x.ts` — read for conventions only.
- The `draft` / `draft_version` schema — no migration. Everything this plan
  needs already has a column.

## Git workflow

- Branch: `advisor/015-quincy-writes-the-draft` created from `e68026f`.
- Commit per step or one final commit; imperative subject line, body
  explaining *why* (see `git log -1 e68026f` for the house style).
- Do NOT push or open a PR.

## Steps

### Step 1: `lib/drafting.ts` — the generator

Create the module. Shape it on `lib/voice.ts`; the pieces:

```ts
export type DraftTarget = { id: string; label: string; rules: ChannelRules }

export type GeneratedVersion = {
  channel: string
  body: string
}

export type DraftGeneration = {
  /** One per requested channel. */
  versions: GeneratedVersion[]
  usage?: { inputTokens: number; cachedInputTokens: number; outputTokens: number }
}

/** Injectable so tests exercise the assembly without a model call. */
export type DraftGenerator = (input: {
  hook: string
  shape: Angle["shape"]
  scrapOrIdea: string
  sourceLabel: string
  channels: DraftTarget[]
  brain: string
}) => Promise<DraftGeneration>
```

The default generator calls `generateObject` once with:

- `model`: `process.env.CHAT_MODEL ?? "anthropic/claude-sonnet-5"` (same
  line as `lib/voice.ts`).
- `system`: a prompt you write, which MUST contain, in this order: who
  Quincy is (reuse the framing of `BASE_PROMPT` in
  `app/api/chat/route.ts:37` — read it, do not copy it verbatim into a
  second place; write a drafting-specific one), then the rule that the post
  goes out under the user's name, then the brain section appended when
  non-empty (`brain ? \`${SYSTEM}\n\n${brain}\` : SYSTEM` — exactly how the
  chat route does it at `:95`).
- Per-channel constraints in the user prompt, generated from
  `CHANNEL_RULES`: the hard ceiling ("X: at most 280 characters — a post
  over this is rejected on send"), and where the fold is when the channel
  has one ("LinkedIn: the feed hides everything after ~140 characters
  behind 'see more', so the first 140 must stand alone"). Read the real
  numbers from `CHANNEL_RULES`, never hardcode them a second time.
- A schema requiring one entry per requested channel.

Prompt rules to state explicitly (these are the product's, not stylistic):

- Write in the user's voice as described in the brain. If the brain names
  observed habits, follow them; if it says the user never does something,
  never do it.
- Adapt per channel. Two versions of the same idea must not be the same
  text with different line breaks.
- Never invent a fact, number, date or outcome that is not in the material
  or the brain's story pages.
- Write in English unless the brain says otherwise. (The brain currently
  carries a user-owned correction stating exactly this.)
- Output the post text only — no preamble, no "Here's your post", no
  surrounding quotes, no hashtags unless the brain shows the user uses them.

Return `usage` alongside, exactly as `lib/voice.ts`'s `modelExtractor` does.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Channel narrowing and the prompt-input builder (pure, testable)

In `lib/drafting.ts`, export two pure functions:

```ts
/** The channels a shape becomes, narrowed to what the user can publish to. */
export function targetsFor(
  shape: Angle["shape"],
  connectedChannels: string[]
): DraftTarget[]
```

Behavior: start from `CHANNELS_FOR_SHAPE[shape]`; keep those whose `id` is
in `connectedChannels`; if the result is empty, return the unnarrowed list
(decision 3). Attach `CHANNEL_RULES[id]` to each, falling back to
`{ limit: null, fold: null, urlCost: null }` for a channel with no entry.

```ts
/** The per-channel constraint block that goes into the prompt. */
export function describeConstraints(targets: DraftTarget[]): string
```

One line per channel naming its limit and fold in plain language, built from
the rules object. Exported so a test asserts the numbers come from
`CHANNEL_RULES` rather than from a hardcoded string.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Rewrite `draftAngle`

New signature — it now returns a receipt rather than just an id, because
callers need to know whether Quincy actually wrote anything:

```ts
export type DraftAngleResult =
  | {
      ok: true
      draftId: string
      /** Channels written, in order. */
      channels: string[]
      /** False when the model failed and bodies fell back to the hook. */
      written: boolean
      /** Channels whose generated body exceeds the platform ceiling. */
      overLimit: string[]
      /** True when an existing draft for this hook was returned instead. */
      existing: boolean
    }
  | { ok: false; message: string }
```

Order of operations, and each one matters:

1. Session check → `{ ok: false, message: "Not signed in." }` (result
   object; the current `throw` goes).
2. **Idempotency** (decision 5): look for an existing `draft` row with this
   `userId` and `riffHook`. If found, return it with `existing: true`,
   `written: false`, and its channels — spending nothing.
3. **Entitlement gate** — copy the form in
   `app/(app)/sources/actions.ts`: `resolveEntitlementForRequest`, then
   `isEntitled`; on refusal return the same wording that file uses.
4. Read connected channels: active connections only. Use
   `listConnections(userId)` from `lib/channels.ts` and keep
   `state === "active"`, mapping to `channel`. Then `targetsFor(shape, …)`.
5. `renderBrainForUser(session.user.id)`.
6. Call the generator inside try/catch. On throw: log
   `console.error("[drafting] generation failed:", cause)` and continue with
   `written: false`, bodies falling back to `input.angle.hook` (decision 4).
7. Record usage when the generation returned some, using `recordUsage` in
   its own try/catch — the exact pattern in `lib/voice.ts`.
8. Measure each body with `measurePost(body, channel)` and collect the
   channels whose `over` is true into `overLimit`. **Do not truncate and do
   not retry** — the text is stored as written and the user edits it on
   /drafts, which is where "Quincy drafts, you send" lives. Reporting it is
   the product behavior; silently cutting a post is not.
9. Insert the `draft` row (unchanged fields) and one `draftVersion` per
   target, `body` = the generated text for that channel (or the hook on
   fallback), `label` = the target's label, `state: "writing"`.
10. `revalidatePath("/riffs")` and `revalidatePath("/drafts")` as today.

Update the file's doc comment: the paragraph beginning "**Quincy has not
written anything yet.**" is now false and must be replaced with what is
true, including why fallback-to-hook is the failure behavior.

**Verify**: `npx tsc --noEmit` → exit 0. `pnpm vitest run` → all pass.

### Step 4: The caller keeps compiling

`components/riffs/riff-parts.tsx:255` awaits `draftAngle(...)` and ignores
the return value. Confirm it still typechecks against the new return type
(it should — an ignored return is fine) and **change nothing there**.

**Verify**: `npx tsc --noEmit` → exit 0. If this step requires editing the
component, STOP (out of scope).

### Step 5: Tests

Create `lib/drafting.test.ts`, following the structure of
`lib/voice.test.ts` and `lib/corpus-x.test.ts` (pure functions only — no DB,
no model; those paths belong to a verify script).

`describe("targetsFor")`:
1. `Short post` with `["x", "linkedin"]` connected → both, in
   `CHANNELS_FOR_SHAPE` order.
2. `Short post` with only `["x"]` connected → X only.
3. `Carousel` with `["x", "linkedin"]` connected → LinkedIn only (Instagram
   dropped — it is in the shape map but not connected).
4. `Essay` with `["x"]` connected → falls back to the unnarrowed shape list
   (Substack), because the intersection is empty.
5. Each returned target carries the real `CHANNEL_RULES` entry — assert
   X's `limit` is `CHANNEL_RULES.x.limit`, read from the table rather than
   written as `280` in the test.

`describe("describeConstraints")`:
6. The X line names X's ceiling; the LinkedIn line names its fold. Assert
   against `String(CHANNEL_RULES.x.limit)` and
   `String(CHANNEL_RULES.linkedin.fold)` so the test breaks if the prompt
   stops reading from the table.
7. A channel with no `CHANNEL_RULES` entry produces a line without claiming
   a false limit.

**Verify**: `pnpm vitest run` → all pass, ≥7 new tests.

### Step 6: A live check script (write it; do NOT run it)

Create nothing new here — instead confirm `scripts/corpus-x-live.ts` is the
pattern the operator will follow, and state in your report that a live
verification of this plan is owed and how to do it: connect an account, open
/riffs on a demo-allowlisted address (`lib/demo.ts`), press "Draft this",
and read the result on /drafts.

## Done criteria

- [ ] `npx tsc --noEmit` exits 0
- [ ] `pnpm vitest run` exits 0 with ≥7 new tests in `lib/drafting.test.ts`
- [ ] `npx eslint lib/drafting.ts lib/drafting.test.ts "app/(app)/riffs/actions.ts"` exits 0
- [ ] The generated body is the default and the hook is only a fallback —
      i.e. `generated ?? input.angle.hook`, never the hook as the primary
      value. (This was originally written as a literal `grep` for
      `body: input.angle.hook`, which pushed the executor into contorted
      destructuring to satisfy the string rather than the intent. State the
      intent; let the reviewer read the line.)
- [ ] `grep -n "recordUsage" "app/(app)/riffs/actions.ts" lib/drafting.ts` shows the metering
- [ ] `grep -n "isEntitled" "app/(app)/riffs/actions.ts"` shows the gate
- [ ] `grep -n "renderBrainForUser" "app/(app)/riffs/actions.ts" lib/drafting.ts` shows the brain is read
- [ ] `git diff --stat components/riffs/riff-parts.tsx` shows no change
- [ ] `git status` shows no files outside the in-scope list

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check shows in-scope files changed since `e68026f`.
- You find yourself designing a multi-part/threaded body format, or changing
  `lib/publish.ts` to send more than one post (decision 2 — that is a
  separate plan).
- `components/riffs/riff-parts.tsx` needs edits to compile.
- Generation would need a second model call per draft to satisfy the length
  ceilings — report it rather than doubling the spend; the plan's answer is
  to report `overLimit` and let the user edit.
- Any step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- **This is the third model call site** (`app/api/chat/route.ts`,
  `lib/voice.ts`, now this). All three must stay consistent on: entitlement
  gate before spend, `recordUsage` after, brain injected from
  `renderBrainForUser`. A fourth should reuse `lib/drafting.ts`'s shape.
- When threading lands, `lib/publish.ts` grows a multi-post path first, then
  this generator's schema gains a parts array — in that order, never the
  reverse.
- When a riff table replaces `DEMO_RIFFS`, `draftAngle`'s `riffHook`
  idempotency guard should move to a real `riffId`; the hook is a
  stand-in that breaks if two angles ever share a hook string.
- Reviewer should scrutinize: that the fallback path cannot silently look
  like success (`written: false` must reach the receipt), and that
  `overLimit` is reported rather than the text being truncated.

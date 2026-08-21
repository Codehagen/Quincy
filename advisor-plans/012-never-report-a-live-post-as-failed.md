# Plan 012: Never report a published post as failed

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `advisor-plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat a3ca175..HEAD -- lib/publish.ts`
> If it changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as
> a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `a3ca175`, 2026-08-04

## Why this matters

`lib/publish.ts` parses the platform's response body with a bare `JSON.parse`
**after** confirming the response was a success. On X that means the tweet is
already live. If the body is not valid JSON — a gateway returning an HTML
interstitial with a 2xx, a proxy rewriting the response, a `text/plain`
acknowledgement — the parse throws, the outer `try/catch` converts it to
`{ ok: false, reason: "rejected" }`, and the caller is told the post failed.

Three things go wrong at once. The user is told a post failed that is live, so
they retry: on LinkedIn that double-posts, on X it costs $0.015 to be refused
for duplicate content. `lastPublishedAt` is never written, so the connection
looks like it has never published. And `recordPostCost` never runs, so the
spend is invisible at `/credits` — which contradicts the stated reason that
function exists ("a number nobody can trust is worse than no number").

The module's own header says the failure direction that must not happen is
reporting a post as sent that never left. This is the mirror of it, and it is
worse: it causes the user to act.

After this plan, an unparseable success body is reported as what it is — the
post probably went out, we could not read the id — and the cost is still
recorded.

## Current state

File and role:

- `lib/publish.ts` — the only publish entry point; `publish()` dispatches to
  `publishToX` or `publishToLinkedIn`

**The X parse, after the success check** (`lib/publish.ts:121-139`):

```ts
  const raw = await response.text()

  if (!response.ok) {
    return {
      ok: false,
      reason: classify(response.status, raw),
      message: `X refused the post (${response.status}): ${raw.slice(0, 300)}`,
    }
  }

  const { data } = JSON.parse(raw) as { data?: { id?: string } }

  if (!data?.id) {
    return {
      ok: false,
      reason: "rejected",
      message: "X accepted the post but returned no id.",
    }
  }
```

**The LinkedIn parse** (`lib/publish.ts:268-282`):

```ts
/**
 * The post id arrives in the `x-restli-id` **response header**, not the body —
 * both endpoints do this, and reading the body instead is a silent null.
 */
function linkedInResult(response: Response, body: string): PublishResult {
  const urn =
    response.headers.get("x-restli-id") ??
    (JSON.parse(body || "{}") as { id?: string }).id

  if (!urn) {
    return {
      ok: false,
      reason: "rejected",
      message: "LinkedIn accepted the post but returned no id.",
```

Note the `??` here means the parse only runs when the header is **absent** —
LinkedIn normally sends it, so this path is the narrower risk of the two. It
still throws when the header is missing and the body is not JSON.

**The catch that converts a throw into a failure report**
(`lib/publish.ts:~352-370`, inside `publish()`):

```ts
  let result: PublishResult
  try {
    result =
      channel === "x"
        ? await publishToX(access.connection, access.accessToken, trimmed)
        : await publishToLinkedIn(access.connection, access.accessToken, trimmed)
  } catch (cause) {
    return {
      ok: false,
      reason: "rejected",
      message: `Could not reach ${channelLabel(channel)}: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    }
  }
```

**The success bookkeeping that gets skipped** (end of `publish()`):

```ts
  await db
    .update(channelConnection)
    .set({
      lastPublishedAt: new Date(),
      lastError: null,
      lastErrorAt: null,
      updatedAt: new Date(),
    })
    .where(eq(channelConnection.id, access.connection.id))

  if (channel === "x") {
    await recordPostCost(userId, trimmed)
  }

  return result
```

**The cost-recording branch on failure** (also in `publish()`):

```ts
    const wasProcessed =
      result.reason !== "needs_reauth" && result.reason !== "rate-limited"

    if (channel === "x" && wasProcessed) {
      await recordPostCost(userId, trimmed)
    }
```

Note this already runs for `reason: "rejected"`, so once the parse failure
returns a *result* instead of throwing, the cost is recorded correctly with no
further change. The bug is entirely that it currently **throws past** this code.

### Repo conventions to match

- Comments explain **why**. See the `wasProcessed` block above for the voice.
- `PublishResult` is a discriminated union; failures carry a `PublishFailure`
  reason and a human `message`. Do not add a new reason value in this plan —
  `"rejected"` is correct for "it may have gone out, we cannot confirm".
- The module returns statuses and never throws to callers. That is the property
  this plan restores.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `npx eslint lib/publish.ts` | exit 0, no output |
| Unit tests | `pnpm test` | all pass |
| Publish guards | `npx tsx --env-file=.env.local scripts/verify-publish.ts` | zero `FAIL` |
| Format | `npx prettier --write <files>` | exit 0 |

**Never run `pnpm build`** (a dev server may share `.next`) and **never run
`pnpm format`**.

## Scope

**In scope**:

- `lib/publish.ts`
- `lib/publish.test.ts` (create)

**Out of scope** (do NOT touch):

- `lib/channels.ts` — `getAccessToken` and the token paths are unrelated.
- `lib/channels-maintenance.ts`.
- The outer `try/catch` in `publish()` — it is correct and stays. It is the
  net for genuine transport failures (DNS, dropped socket). This plan stops the
  parse from *reaching* it, it does not remove it.
- The `/rest/posts` vs `/v2/ugcPosts` fallback logic — leave it exactly as is.

## Git workflow

- Branch: `advisor/012-live-post-not-failed`
- Conventional-commit style, lower-case imperative subject. Example from
  `git log`: `feat: let Quincy actually post, and know what it cost`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a parse that cannot throw

Near the top of `lib/publish.ts`, below the `classify` function, add:

```ts
/**
 * A response body's `id`, or undefined when the body is not JSON.
 *
 * Both callers run **after** the platform has already accepted the post, so a
 * throw here is a lie: it turns a published post into a reported failure, and
 * the user retries — double-posting on LinkedIn, or paying X to be told the
 * text is a duplicate. A 2xx carrying something other than JSON is rare
 * (a gateway interstitial, a proxy rewrite, a plain-text acknowledgement) and
 * nothing about it means the post did not go out.
 */
function idFromBody(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body || "{}") as {
      id?: string
      data?: { id?: string }
    }
    return parsed.data?.id ?? parsed.id
  } catch {
    return undefined
  }
}
```

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Use it on the X path, and say what actually happened

Replace the X parse block shown in "Current state" with:

```ts
  const id = idFromBody(raw)

  if (!id) {
    // Deliberately not phrased as "the post failed". X answered 2xx, which
    // means it took the post; we only failed to read the id back. Telling the
    // user it failed is what makes them retry into a duplicate.
    return {
      ok: false,
      reason: "rejected",
      message:
        "X accepted the post but returned no id that could be read. The post " +
        "has most likely gone out — check the account before retrying.",
    }
  }
```

Then replace the two later uses of `data.id` in the success return with `id`:

```ts
  return {
    ok: true,
    externalId: id,
    url: handle
      ? `https://x.com/${handle}/status/${id}`
      : `https://x.com/i/web/status/${id}`,
  }
```

**Verify**: `grep -n "JSON.parse(raw)" lib/publish.ts` → no matches.
Then `pnpm typecheck` → exit 0.

### Step 3: Use it on the LinkedIn path

In `linkedInResult`, replace the `??` expression:

```ts
  const urn = response.headers.get("x-restli-id") ?? idFromBody(body)
```

and soften the failure message the same way:

```ts
  if (!urn) {
    return {
      ok: false,
      reason: "rejected",
      message:
        "LinkedIn accepted the post but returned no id. The post has most " +
        "likely gone out — check the profile before retrying.",
    }
  }
```

**Verify**: `grep -n "JSON.parse(body" lib/publish.ts` → no matches.
Then `pnpm typecheck` → exit 0.

### Step 4: Write the regression tests

Create `lib/publish.test.ts`. Model the structure on `lib/post-length.test.ts`
(same directory, `describe`/`it`/`expect` from `vitest`, no setup file).

`publish()` needs a database, so **do not test `publish()` itself**. Test the
pure function this plan added, which is where the bug lived:

```ts
import { describe, expect, it } from "vitest"

// idFromBody is not exported. Export it for the test — add `export` to its
// declaration in lib/publish.ts and note in its doc comment that the export
// exists for the test, matching how the repo treats other internals.
import { idFromBody } from "./publish"

describe("idFromBody", () => {
  it("reads X's nested id", () => {
    expect(idFromBody('{"data":{"id":"123"}}')).toBe("123")
  })

  it("reads a top-level id", () => {
    expect(idFromBody('{"id":"urn:li:share:456"}')).toBe("urn:li:share:456")
  })

  it("returns undefined for an empty body rather than throwing", () => {
    expect(idFromBody("")).toBeUndefined()
  })

  it("returns undefined for an HTML interstitial rather than throwing", () => {
    // The bug this file exists for: a 2xx carrying non-JSON used to throw,
    // and the throw turned a published post into a reported failure.
    expect(() => idFromBody("<html><body>ok</body></html>")).not.toThrow()
    expect(idFromBody("<html><body>ok</body></html>")).toBeUndefined()
  })

  it("returns undefined for a plain-text acknowledgement", () => {
    expect(idFromBody("accepted")).toBeUndefined()
  })

  it("returns undefined when JSON parses but carries no id", () => {
    expect(idFromBody('{"data":{}}')).toBeUndefined()
  })
})
```

Add `export` to `idFromBody` in `lib/publish.ts` and extend its doc comment
with one line: `Exported for lib/publish.test.ts — the parse is where the bug
was, so it is the thing worth pinning.`

**Verify**: `pnpm test` → all pass, including 6 new tests in
`lib/publish.test.ts`.

### Step 5: Confirm the guards still hold

```
npx tsx --env-file=.env.local scripts/verify-publish.ts
```

**Verify**: zero `FAIL` lines. This exercises the pre-flight refusals (empty,
too-long, revoked, needs_reauth), none of which this plan touches — a failure
here means you changed more than the parse.

### Step 6: Format and final check

```
npx prettier --write lib/publish.ts lib/publish.test.ts
pnpm typecheck && pnpm test && npx eslint lib/publish.ts lib/publish.test.ts
```

**Verify**: typecheck exit 0, all tests pass, eslint silent.

## Test plan

New file `lib/publish.test.ts`, structured after `lib/post-length.test.ts`,
covering `idFromBody`:

- happy path: X's nested `data.id` shape
- happy path: LinkedIn's top-level `id` shape
- the regression: an HTML body does not throw and yields `undefined`
- a plain-text body does not throw
- an empty body does not throw
- valid JSON with no id yields `undefined`

`publish()` itself stays covered by `scripts/verify-publish.ts` (hand-run,
needs a database), which must continue to pass unchanged.

Verification: `pnpm test` → all pass, 6 new tests.

## Done criteria

ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0 and `lib/publish.test.ts` contributes 6 passing tests
- [ ] `npx eslint lib/publish.ts lib/publish.test.ts` exits 0 with no output
- [ ] `grep -n "JSON.parse(raw)" lib/publish.ts` returns no matches
- [ ] `grep -n "JSON.parse(body" lib/publish.ts` returns no matches
- [ ] `npx tsx --env-file=.env.local scripts/verify-publish.ts` prints zero `FAIL`
- [ ] `git status --short` shows only `lib/publish.ts` and `lib/publish.test.ts`
- [ ] `advisor-plans/README.md` status row for 012 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" do not match the live code.
- You are tempted to remove the outer `try/catch` in `publish()`. Do not — it
  is the net for genuine transport failures and is out of scope.
- You are tempted to add a new `PublishFailure` variant. `"rejected"` is
  correct here; a new variant means every caller has to learn it, which is a
  bigger change than this plan.
- `scripts/verify-publish.ts` starts failing.
- Making the tests pass appears to require importing the database into a
  vitest file. It does not — test `idFromBody` only.

## Maintenance notes

- **The invariant**: nothing in `lib/publish.ts` may throw after the platform
  has accepted a post. Any new parsing added downstream of a `response.ok`
  check needs the same treatment. A reviewer should look for bare `JSON.parse`
  in this file specifically.
- When the `/rest/posts` vs `/v2/ugcPosts` question is settled by a real post
  and the losing branch is deleted, `linkedInResult` keeps its single caller —
  no change needed here.
- Deliberately deferred: the failure message tells the user to check the
  account manually. A better product answer is to look the post up and confirm,
  but that needs a read scope LinkedIn does not grant on the self-serve tier,
  so it cannot be built today.

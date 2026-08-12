# Plan 014: Count a scheme-less link the way X counts it

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `advisor-plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat a3ca175..HEAD -- lib/post-length.ts lib/post-length.test.ts`
> If either changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as
> a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `a3ca175`, 2026-08-04

## Why this matters

`lib/post-length.ts` exists for one reason, stated in its own header: counting
with `text.length` gets a post rejected *after* the user approved it. The
module's URL pattern has a bug in exactly that direction.

The second alternative in the pattern, `(?:^|\s)(?:www\.)\S+`, consumes the
whitespace **before** a scheme-less link. `measurePost` then strips the match
and adds a flat cost, so that leading space is deleted from the count — even
though the file's own comment two lines above says the surrounding spaces still
count.

Reproduced: `measurePost("hello www.example.com there", "x")` returns **34**.
X counts 35 (`hello` 5 + space + 23 for the t.co link + space + `there` 5).
Every scheme-less link undercounts by exactly one character.

The cost is small and precise: a post the editor shows as exactly 280 is 281 to
X and is refused on send. Because `lib/publish.ts` validates with the same
function before spending money, the post gets through the local gate and X
bills $0.015 — or $0.200, since the post contains a link — to say no. That is
the exact failure this module was written to prevent.

Only X is affected: it is the one channel with a non-null `urlCost`.

## Current state

Files and their roles:

- `lib/post-length.ts` — grapheme counting and per-channel URL cost
- `lib/post-length.test.ts` — its vitest suite

**The pattern** (`lib/post-length.ts:65`):

```ts
const URL_PATTERN = /https?:\/\/\S+|(?:^|\s)(?:www\.)\S+/gi
```

**Its stated contract** (`lib/post-length.ts:59-64`):

```ts
/**
 * Deliberately loose. It only has to find the spans a platform will turn into a
 * link, and over-matching a trailing bracket costs a character or two on a
 * count that is already an estimate — under-matching would silently undercount
 * a post that then gets rejected on send.
 */
```

**Where the whitespace is lost** (`lib/post-length.ts`, inside `measurePost`):

```ts
  let used: number
  if (rules.urlCost === null) {
    used = countGraphemes(text)
  } else {
    // Replace each URL with a placeholder of known cost rather than deleting
    // it: the surrounding spaces still count, and a link glued to a word must
    // not silently merge with it.
    const links = text.match(URL_PATTERN) ?? []
    const withoutLinks = text.replace(URL_PATTERN, "")
    used = countGraphemes(withoutLinks) + links.length * rules.urlCost
  }
```

The comment says "the surrounding spaces still count". For the `www.`
alternative they do not — the match includes the leading space, so `replace`
removes it.

**The channel rules** (`lib/post-length.ts:42-47`):

```ts
export const CHANNEL_RULES: Record<string, ChannelRules> = {
  // 280 and the flat 23-per-link t.co cost are both published and long-standing.
  // Nothing is folded: a 280-character post renders in full in the timeline.
  x: { limit: 280, fold: null, urlCost: 23 },
  ...
  linkedin: { limit: 3000, fold: 140, urlCost: null },
```

**The other consumer of the pattern** (`lib/post-length.ts`, added recently):

```ts
export function containsUrl(text: string): boolean {
  // `URL_PATTERN` is global, so it carries `lastIndex` between calls. `.test`
  // would resume mid-string and answer false on the second identical call.
  URL_PATTERN.lastIndex = 0
  return URL_PATTERN.test(text)
}
```

`containsUrl` only asks yes/no, so the whitespace question does not affect it —
but any change to the pattern must keep its behaviour identical. It is what
prices an X post at $0.015 versus $0.200 in `lib/publish.ts`.

**The existing test that must keep passing** (`lib/post-length.test.ts`) asserts
`measurePost("se https://a.co", "x").used === 3 + 23` — the scheme form, which
is already correct and is unaffected.

### Repo conventions to match

- Comments explain **why**. The file's existing comments are the model.
- Tests use `describe`/`it`/`expect` from `vitest`, no setup file, and the
  existing suite covers emoji, flags, and URL cost. Follow its structure.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `npx eslint lib/post-length.ts lib/post-length.test.ts` | exit 0, no output |
| Unit tests | `pnpm test` | all pass |
| Format | `npx prettier --write <files>` | exit 0 |

**Never run `pnpm build`** (a dev server may share `.next`) and **never run
`pnpm format`**.

## Scope

**In scope**:

- `lib/post-length.ts`
- `lib/post-length.test.ts`

**Out of scope** (do NOT touch):

- `lib/publish.ts` — it calls `measurePost` and `containsUrl` and needs no
  change once they are correct.
- `CHANNEL_RULES` values — the 280 limit and the flat 23 cost are published
  platform facts, not tuning knobs.
- `containsUrl`'s behaviour — it must answer identically before and after.
- The fold logic and `splitAtFold`.

## Git workflow

- Branch: `advisor/014-scheme-less-link-count`
- Conventional-commit style, lower-case imperative subject. Example from
  `git log`: `fix: make the destructive control look and behave like a control`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Pin the bug with a failing test

Before changing the pattern, add the regression case to
`lib/post-length.test.ts` inside the existing `measurePost` describe block:

```ts
  it("counts a scheme-less link the same as one with a scheme", () => {
    // The bug: the `www.` alternative used to swallow the space in front of
    // the link, so this measured 34 while X counts 35 — and a post shown as
    // exactly 280 was refused on send, after X had already billed for the
    // attempt.
    const withScheme = measurePost("hello https://example.com there", "x").used
    const withoutScheme = measurePost("hello www.example.com there", "x").used
    expect(withoutScheme).toBe(withScheme)
    expect(withoutScheme).toBe(35)
  })

  it("counts a scheme-less link at the start of a post", () => {
    // The `^` branch of the alternation has no leading space to eat, so this
    // case was already correct — pinned so a fix for the other branch cannot
    // regress it.
    expect(measurePost("www.example.com ok", "x").used).toBe(23 + 1 + 2)
  })
```

Run the suite and confirm the first new test **fails** with `expected 34 to be
35`. A test that passes before the fix is testing the wrong thing.

**Verify**: `pnpm test` → the new "same as one with a scheme" test fails,
everything else passes.

### Step 2: Stop the pattern eating the leading whitespace

In `lib/post-length.ts`, change the pattern so the `www.` alternative matches
only the link itself. Use a lookbehind for the boundary:

```ts
const URL_PATTERN = /https?:\/\/\S+|(?<=^|\s)www\.\S+/gi
```

Lookbehind is zero-width, so the boundary is still required but is not part of
the match — which means `replace` no longer deletes the space.

Extend the comment above it to record why the boundary is a lookbehind, since
the obvious simplification is to drop it:

```ts
/**
 * Deliberately loose. It only has to find the spans a platform will turn into a
 * link, and over-matching a trailing bracket costs a character or two on a
 * count that is already an estimate — under-matching would silently undercount
 * a post that then gets rejected on send.
 *
 * The boundary on the scheme-less branch is a **lookbehind**, and that is
 * load-bearing rather than stylistic. As a capturing group it was part of the
 * match, so `measurePost`'s `replace` deleted the space in front of the link
 * along with the link — one character short, on a counter whose whole job is
 * that a 280-character post is not refused on send. Do not simplify it back to
 * `(?:^|\s)`.
 */
```

Lookbehind requires Node 8.3+ / ES2018 and is fully supported in this runtime
and in every browser this project targets — `measurePost` runs in the editor as
well as on the server.

**Verify**: `pnpm test` → all pass, including both new tests.

### Step 3: Confirm `containsUrl` is unchanged

The pattern is shared. Confirm the yes/no answer is identical for both link
forms and for text with no link:

```
pnpm test
```

The existing `containsUrl` tests in `lib/post-length.test.ts` cover an ordinary
link, a `www.` link with no scheme, text with no link, and a repeated call.
All four must still pass — the repeated-call one especially, since it guards the
`lastIndex` reset that the global flag makes necessary.

**Verify**: `pnpm test` → the four `containsUrl` tests pass.

### Step 4: Format and final check

```
npx prettier --write lib/post-length.ts lib/post-length.test.ts
pnpm typecheck && pnpm test && npx eslint lib/post-length.ts lib/post-length.test.ts
```

**Verify**: typecheck exit 0, all tests pass, eslint silent.

## Test plan

Two new tests in `lib/post-length.test.ts`, inside the existing `measurePost`
describe block, following its structure:

1. **The regression**: a scheme-less link measures the same as the same link
   with a scheme, and both equal 35 for `"hello <link> there"`.
2. **The already-correct branch**: a scheme-less link at the very start of the
   post still measures correctly, so the fix cannot regress the `^` case.

The four existing `containsUrl` tests and the existing `measurePost` URL test
must continue to pass unchanged — they are the guard that this change did not
alter the yes/no answer that prices an X post.

Verification: `pnpm test` → all pass, 2 new tests, total count up by 2 from 72
to 74.

## Done criteria

ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0 with 74 tests passing
- [ ] `npx eslint lib/post-length.ts lib/post-length.test.ts` exits 0 with no output
- [ ] `grep -n "(?<=^|\\\\s)www" lib/post-length.ts` returns one match (the lookbehind is in place)
- [ ] `grep -c "(?:^|\\\\s)(?:www" lib/post-length.ts` returns `0` (the old form is gone)
- [ ] `git status --short` shows only the two in-scope files
- [ ] `advisor-plans/README.md` status row for 014 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" do not match the live code.
- The Step 1 test **passes** before you change the pattern — the bug is not
  what this plan describes, and the rest of the plan is built on it.
- Any existing test in `lib/post-length.test.ts` fails after Step 2. In
  particular a `containsUrl` failure means the pattern change altered the
  yes/no answer, which decides whether an X post is billed at $0.015 or $0.200.
- You conclude lookbehind is unsupported in a target runtime. Report it rather
  than restructuring `measurePost` to compensate — the alternative (matching
  with a capture group and re-inserting the boundary) is a bigger change than
  this plan covers.

## Maintenance notes

- **The property to protect**: `measurePost` must never return a number lower
  than what the platform counts. Over-counting is safe (a post is refused
  locally, costing nothing); under-counting spends money to be refused
  remotely. Any future change to `URL_PATTERN` should be judged against that
  asymmetry.
- The fold numbers in `CHANNEL_RULES` are approximate by design and the limits
  are not. If a limit ever needs changing, it is because the platform published
  a change — not because a count looked off.
- Deliberately deferred: the pattern still over-matches trailing punctuation
  (`www.example.com,` includes the comma). That errs toward over-counting,
  which is the safe direction, and fixing it risks under-matching. Left alone
  on purpose.

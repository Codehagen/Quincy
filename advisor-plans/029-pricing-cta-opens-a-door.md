# Plan 029: The pricing page's call to action leads somewhere that can say yes

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md` — unless a reviewer dispatched you and told
> you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 223a12d..HEAD -- "app/(marketing)/pricing/page.tsx" components/auth/login-form.tsx`
> If either file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `223a12d`, 2026-08-12

## Why this matters

Signup is invite-only: `app/(auth)/signup/page.tsx` renders "Quincy is
invite-only" for anyone arriving without a valid `?invite=` code, with no
waitlist form on that page. The public front door for strangers is the
waitlist section at `/#join` — the marketing header and the changelog page
both point there.

The pricing page does not. Both of its "Start the free day" buttons link to
`/signup`, so every stranger who reads the price, decides to act, and presses
the page's only button lands on a refusal. Commit `9ccc89e` removed the
pricing page's `/login` link on exactly this reasoning — "a stranger reading
a price has nothing to log in to" — and left both `/signup` CTAs in place.
This is the highest-traffic broken path on the public site, and it costs the
exact visitor the page exists to convert.

The login form has the same dead link in miniature: "No account yet? Create
one" → `/signup`, which refuses anyone without an invite code.

## Current state

- `app/(marketing)/pricing/page.tsx` — two CTA sites, identical shape:

```tsx
// app/(marketing)/pricing/page.tsx:57-66 (hero) and :138-145 (footer)
<Button
  nativeButton={false}
  size="lg"
  className="h-11 px-5 text-[0.9375rem]"
  render={<Link href="/signup" />}
>
  Start the free day
</Button>
```

  The hero CTA carries a comment (lines 55-61) arguing the label should "say
  what pressing it costs, which is nothing" — keep that reasoning in mind
  when adjusting copy. The footer CTA sits under a comment block (lines
  130-137) that explains why `/login` was removed from this page and notes an
  invited tester reaches `/login` from the link in their mail.

- The convention for stranger-facing CTAs, from the marketing header:

```tsx
// app/(marketing)/layout.tsx:38,45
// `/#join` rather than `#join`, because this header renders on ...
<Button nativeButton={false} size="sm" render={<Link href="/#join" />}>
```

  `app/(marketing)/changelog/page.tsx:125` also points at `/#join`.

- The signup refusal, confirming there is no waitlist affordance behind the
  current link:

```tsx
// app/(auth)/signup/page.tsx:36-41
const row = invite ? await findRedeemableInvite(invite) : null

if (!row) {
  return (
    ...
    <h1 className="text-section">Quincy is invite-only</h1>
```

- The login form's footer:

```tsx
// components/auth/login-form.tsx:217-222
<p className="text-caption text-muted-foreground text-center">
  No account yet?{" "}
  <Link href="/signup" className="text-foreground underline underline-offset-3">
    Create one
  </Link>
</p>
```

- Repo conventions that apply: Base UI `render={<Link ... />}` for link
  buttons (never `asChild`); marketing copy is written in the repo's plain,
  declarative voice; comments state the reasoning, not the mechanics.

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Typecheck | `pnpm typecheck` | exit 0              |
| Tests     | `pnpm test`      | all pass            |
| Dev serve | `pnpm dev`       | serves /pricing     |

## Scope

**In scope** (the only files you should modify):
- `app/(marketing)/pricing/page.tsx`
- `components/auth/login-form.tsx`

**Out of scope** (do NOT touch):
- `app/(auth)/signup/page.tsx` — the invite gate is correct and deliberate.
- `app/(marketing)/layout.tsx`, the waitlist components, `lib/waitlist.ts`.
- The pricing page's copy beyond the two CTA labels and their comments.

## Git workflow

- Branch: `advisor/029-pricing-cta-opens-a-door`
- One commit. Message style: single evocative sentence (see `git log
  --oneline -5`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Point both pricing CTAs at the waitlist

In `app/(marketing)/pricing/page.tsx`, change both `render={<Link
href="/signup" />}` to `render={<Link href="/#join" />}` and change the label
from "Start the free day" to **"Join the waitlist"** at both sites.

Label reasoning, so the change survives review: the old label promised an
immediate free day, which the door cannot currently deliver — a stranger who
presses it joins a list. The comment above the hero CTA says the button
should "say what pressing it costs"; honesty about *what happens next* is the
same rule. Update both comment blocks to match: the hero comment's argument
about labels stays, its example changes; the footer comment's note that the
route is "untouched; it is gone from this page, not from the app" now applies
to `/signup` as well as `/login` — say so in one line.

When signup reopens to strangers, these two hrefs are the ones to restore;
add that as a trailing line in the hero comment.

**Verify**: `grep -c 'href="/signup"' "app/(marketing)/pricing/page.tsx"` → 0
**Verify**: `grep -c 'href="/#join"' "app/(marketing)/pricing/page.tsx"` → 2

### Step 2: Make the login form honest about the closed door

In `components/auth/login-form.tsx`, change the footer paragraph to point at
the waitlist with matching copy:

```tsx
<p className="text-caption text-muted-foreground text-center">
  No account yet?{" "}
  <Link href="/#join" className="text-foreground underline underline-offset-3">
    Join the waitlist
  </Link>
</p>
```

An invited tester never needs this link — their invite mail links
`/signup?invite=...` directly — so nothing legitimate is lost.

**Verify**: `grep -n 'href="/signup"' components/auth/login-form.tsx` → no
matches.

### Step 3: See both pages once

Run `pnpm dev`, load `/pricing`, press each CTA, confirm the page scrolls or
navigates to the waitlist section on `/` with the join form visible. Load
`/login`, confirm the footer link does the same. (No signed-in session is
needed; both pages are public.)

**Verify**: manual — both CTAs land on the `#join` section of the front page.

## Test plan

No unit tests apply — the change is two hrefs and labels in server-rendered
markup with no logic. `pnpm test` must still pass (nothing it covers is
touched). The Step 3 manual check is the behavioural verification.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0; `pnpm test` exits 0
- [ ] `grep -rn 'href="/signup"' "app/(marketing)" components/auth/login-form.tsx` → no matches
- [ ] `grep -c 'href="/#join"' "app/(marketing)/pricing/page.tsx"` → 2
- [ ] `git status` shows no modified files outside the two in-scope files
- [ ] `advisor-plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `/signup` no longer refuses inviteless visitors (check
  `app/(auth)/signup/page.tsx` for the `if (!row)` branch) — the door may
  have been opened since this plan was written, in which case the CTAs are
  correct as they are and this plan is stale.
- The `#join` anchor no longer exists on the front page
  (`grep -rn 'id="join"' app components` returns nothing).
- Anything suggests adding a waitlist form to the signup page instead — that
  is a design decision for the owner, not this plan.

## Maintenance notes

- When signup opens to strangers, restore both pricing CTAs to `/signup` and
  the "Start the free day" label in the same commit that opens it — the hero
  comment now says so in place.
- Reviewers of future marketing surfaces: every stranger-facing CTA must
  land on `/#join` until signup opens. The header (`app/(marketing)/layout.tsx:45`)
  is the exemplar.

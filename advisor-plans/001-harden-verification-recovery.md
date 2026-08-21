# Plan 001: Make every sign-in failure report its actual cause

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md`.
>
> **Drift check (run first)**:
>
> ```bash
> git diff --stat 17f6b7c..HEAD -- AGENTS.md components/auth lib/auth.ts
> ```
>
> Empty output means no drift; proceed. If any in-scope file changed, compare
> the "Current state" excerpts below against the live code before proceeding,
> and treat a mismatch as a STOP condition.
>
> Also confirm the starting point exists:
>
> ```bash
> ls components/auth/resend-verification.tsx
> grep -c "send-verification-email" lib/auth.ts
> ```
>
> Expected: the file exists, and the grep returns `1`. If either fails you are
> not on the commit this plan was written against — STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `17f6b7c`, 2026-08-03 (refreshed against main after the Stripe work merged)

## Why this matters

An earlier session fixed a lockout where an unverified account was reported as
a wrong password. That fix is correct but incomplete: a **rate-limited** login
now falls into the same misleading branch and tells the user "That email and
password do not match an account." Their password is fine — they need to wait
sixty seconds. Telling them it is wrong sends them to change a credential that
was never the problem.

The reason the gap survived is a factual error written into `AGENTS.md` and
repeated in a code comment: both claim the rate limiter returns HTTP 403 and is
therefore indistinguishable from `EMAIL_NOT_VERIFIED`. It does not. Measured
against the running app:

| Situation | Status | Body |
|---|---|---|
| Wrong password | `401` | `{"message":"Invalid email or password","code":"INVALID_EMAIL_OR_PASSWORD"}` |
| Unverified account | `403` | `{"message":"Email not verified","code":"EMAIL_NOT_VERIFIED"}` |
| Rate limited | `429` | `{"message":"Too many requests. Please try again later."}` — **no `code` field** |

All three are distinguishable, and the missing `code` on a 429 is exactly why
`error.code === "EMAIL_NOT_VERIFIED"` misses it and the generic branch swallows
it. Correcting the documentation is part of this plan, not a footnote: the wrong
version has now propagated into three files and caused this bug once already.

This plan also closes four smaller defects in the same three files (a signup
dead end, a nested live region, a stale panel, and a hardcoded token lifetime).
They are grouped because they are all small, all in the same files, and
splitting them would produce six plans that each restate this context.

## Current state

Files in scope, and their role:

- `components/auth/login-form.tsx` — the login form. Handles the sign-in call
  and its error branches. Contains the incorrect comment and the missing 429
  branch.
- `components/auth/signup-form.tsx` — the signup form. After a successful
  signup it renders a "Check your inbox" state instead of redirecting.
- `components/auth/resend-verification.tsx` — new shared component. Renders the
  "send a new link" button and its result messages.
- `lib/auth.ts` — better-auth server config. Rate-limit rules live here.
- `AGENTS.md` — the repo's agent-facing conventions doc.

### The incorrect comment and the missing branch

`components/auth/login-form.tsx:69-90` currently reads:

```tsx
      if (error) {
        // Both of these come back as 403, which is why the code is read rather
        // than the status. Reporting an unverified account as a wrong password
        // sends someone to the reset flow, which will not fix it — they end up
        // with a new password and the same locked account.
        //
        // Saying it plainly leaks nothing: a wrong password is rejected first
        // and never reaches this branch, so anyone who sees this message has
        // already proved they know the password to the account they are asking
        // about.
        if (error.code === "EMAIL_NOT_VERIFIED") {
          setUnverified(attempted)
          setIsSubmitting(false)
          return
        }

        // Deliberately not "no account with that email" — that turns the login
        // form into a way to find out who has an account here.
        setFormError("That email and password do not match an account.")
        setIsSubmitting(false)
        return
      }
```

The first sentence ("Both of these come back as 403") is false, and there is no
`429` branch, so a rate-limited user reaches `setFormError(...)` on line 87.

### The stale panel

`components/auth/login-form.tsx:44` holds the rejected address:

```tsx
  const [unverified, setUnverified] = React.useState<string | null>(null)
```

It is cleared only on the next submit (line 58). If the user edits the email
field after seeing the panel, the panel keeps naming the **old** address and
its resend button keeps targeting it.

### The nested live region

`components/auth/login-form.tsx:173-188`:

```tsx
      {unverified ? (
        <div role="alert" className="flex flex-col gap-3">
          <p className="text-caption text-muted-foreground flex items-start gap-2 text-pretty">
            ...
          </p>
          <ResendVerification email={unverified} callbackURL={next} />
        </div>
      ) : null}
```

`role="alert"` is an assertive live region. It wraps a `<button>` **and**
`ResendVerification`, which contains two more live regions of its own —
`role="status"` at `components/auth/resend-verification.tsx:102` and
`role="alert"` at `:116`. Nested live regions behave inconsistently across
screen readers; the announcement belongs on the text, not the container.

### The signup dead end

`components/auth/signup-form.tsx:93-123` renders the inbox state. Its only
exits are the resend button and a "Go back and fix it" button that returns to
the same form. There is no link to `/login`.

This matters because of how better-auth behaves under
`requireEmailVerification: true`. A signup for an address that **already
exists** returns a synthetic success rather than an error (so the response
cannot be used to enumerate accounts), and `/send-verification-email`
short-circuits an already-verified address without sending anything. So a
returning user with a verified account is told "Check your inbox" twice, no
mail is ever sent, and the screen offers no way to reach the login page.

### The hardcoded lifetime

`components/auth/resend-verification.tsx:110`:

```tsx
          Sent to {email}. The link is good for an hour.
```

"an hour" is better-auth's default `expiresIn` (3600s). `lib/auth.ts` never
sets `emailVerification.expiresIn`, so the copy is asserting an implicit
default. Setting that option later would silently make the sentence a lie.

### Conventions to match

- **Icons are `hugeicons`, never `lucide`.** Import from `@hugeicons/react` +
  `@hugeicons/core-free-icons`, render with `<HugeiconsIcon icon={X} />`.
  Existing example: `components/auth/login-form.tsx:6-7`.
- **Comments explain *why*, not *what*.** Every non-obvious decision in these
  files carries a short prose rationale. Match that register — see the comment
  at `components/auth/login-form.tsx:34-36` as an exemplar.
- **Errors render next to their field, never as a summary**, and form-level
  messages use the `<p role="alert" className="text-destructive text-caption
  flex items-start gap-2 text-pretty">` shape at
  `components/auth/login-form.tsx:152-164`.
- From `AGENTS.md`: "**No `transition-all`.** Name the properties." and
  "**Derive nested radii.** `inner = outer − padding`."

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Typecheck | `pnpm typecheck` | exit 0, no output |
| Lint | `pnpm lint` | exit 0, no output |
| Unit tests | `pnpm test` | exit 0; 3 files, 29 tests passing |
| Build | `pnpm build` | exit 0, route table printed |
| Dev server | `pnpm dev` | serves on `http://localhost:3000` |

The repo runs **vitest** (`vitest.config.ts`, `include: ["lib/**/*.test.ts",
"app/**/*.test.ts"]`). The existing suites are `lib/billing.test.ts`,
`lib/billing.test.ts`'s siblings and `lib/subscription-status.test.ts` — all
from the billing work, none touching auth. You are not required to add tests in
this plan (see "Test plan"), but `pnpm test` must stay green.

## Scope

**In scope** (the only files you may modify):

- `components/auth/login-form.tsx`
- `components/auth/signup-form.tsx`
- `components/auth/resend-verification.tsx`
- `lib/auth.ts` (one option added — see Step 6)
- `lib/auth-constants.ts` (create — see Step 6)
- `AGENTS.md`

**Out of scope** (do NOT touch, even though they look related):

- `hooks/use-validated-field.ts` — shared by both forms; Step 5 is deliberately
  designed to avoid changing it.
- `lib/auth-validation.ts` — field rules only; the new constant does not belong
  there.
- The `rateLimit.customRules` **values** in `lib/auth.ts`. The limits
  (`/sign-in/email` 5 per 60s, `/send-verification-email` 3 per 60s) are
  deliberate. You may not loosen them to make testing easier.
- `emails/**` and `lib/mail.ts` — mail templates and transport are unrelated.
- Anything under `app/` — no route changes in this plan.

## Git workflow

- Branch: `advisor/001-harden-verification-recovery`
- Commit style is conventional-commit prefix + a prose subject. Real examples
  from `git log --oneline -3`:
  ```
  06aa929  chore: a local account that can actually sign in
  8b88f54  feat: the brain as a document, and a cache in front of it
  def2b69  fix: teach tailwind-merge the role scale
  ```
  Use `fix:` for this work.
- **Do NOT push or open a PR.**
- Note: the in-scope files are currently uncommitted. Commit them together with
  your changes; do not try to separate the pre-existing modifications from
  yours.

## Steps

### Step 1: Correct the false comment in the login form

In `components/auth/login-form.tsx`, replace the comment block at lines 70-78
(beginning `// Both of these come back as 403,`) with an accurate one. It must
state that the three failures are distinguishable: 401
`INVALID_EMAIL_OR_PASSWORD`, 403 `EMAIL_NOT_VERIFIED`, 429 with no `code`.
Keep the second paragraph about not leaking account existence — that reasoning
is still correct and still worth recording.

**Verify**: `grep -n "Both of these come back as 403" components/auth/login-form.tsx`
→ no matches (exit 1).

### Step 2: Handle the rate-limited login explicitly

In the same `if (error)` block, add a branch **before** the generic
`setFormError("That email and password do not match an account.")` on line 87:

```tsx
        if (error.status === 429) {
          setFormError("Too many attempts. Wait a minute, then try again.")
          setIsSubmitting(false)
          return
        }
```

Order matters: check `error.code === "EMAIL_NOT_VERIFIED"` first (a 403 with a
code), then `error.status === 429`, then fall through to the generic message.
Add a one-line comment explaining that a 429 carries no `code`, which is why
this branch tests the status.

**Verify**: `pnpm typecheck` → exit 0, no output.

### Step 3: Give the signup inbox state a route to the login page

In `components/auth/signup-form.tsx`, inside the `if (sentTo)` block
(lines 93-123), add a link to `/login` alongside the existing "Wrong address?"
line. Use the same `<Link>` + styling already used by that file's footer at
`components/auth/signup-form.tsx` (search for `Already have an account?`) so
the two match.

Wording must not claim the account is new — a person reaching this screen may
already have a verified account and no mail will ever arrive for them. Use
something like: "Already verified? **Log in**".

`Link` is already imported in this file; do not add a second import.

**Verify**: `grep -n 'href="/login"' components/auth/signup-form.tsx` → at
least 2 matches (the new one plus the existing footer link).

### Step 4: Move the announcement off the container

In `components/auth/login-form.tsx`, remove `role="alert"` from the wrapping
`<div>` at line 174, and put it on the `<p>` that holds the message text
instead. The `<div>` keeps its `className` unchanged.

Result shape:

```tsx
      {unverified ? (
        <div className="flex flex-col gap-3">
          <p role="alert" className="text-caption text-muted-foreground flex items-start gap-2 text-pretty">
            ...
          </p>
          <ResendVerification email={unverified} callbackURL={next} />
        </div>
      ) : null}
```

Do not change the `role="status"` at `resend-verification.tsx:102` or the
`role="alert"` at `:116` — once the container no longer announces, those two
are correct as they stand.

**Verify**: `grep -n 'div role="alert"' components/auth/login-form.tsx` → no
matches (exit 1).

### Step 5: Hide the panel when the address no longer matches

Still in `components/auth/login-form.tsx`, change the render condition so the
panel only shows while the rejected address is still the one in the field.
Replace the `{unverified ? (` test with a guard computed just above the
`return`:

```tsx
  // The panel names a specific address and its button resends to that address.
  // Once the field says something else, both are talking about an account the
  // user is no longer trying to reach.
  const showUnverified = unverified !== null && unverified === email.value.trim()
```

and render on `showUnverified` instead. Keep passing `unverified` (not
`email.value`) to `ResendVerification`, so the resend target is still the
address the server actually rejected.

Do **not** modify `hooks/use-validated-field.ts` to achieve this.

**Verify**: `pnpm typecheck` → exit 0. Then
`grep -n "showUnverified" components/auth/login-form.tsx` → 2 matches
(the declaration and the render guard).

### Step 6: Make the token lifetime a single fact

Create `lib/auth-constants.ts`:

```ts
/**
 * Shared by the server config and the sign-in surfaces, so the number in the
 * copy cannot drift from the number better-auth enforces. It lives in its own
 * module rather than in `lib/auth.ts` because the login and signup forms are
 * client components — importing from `lib/auth.ts` would pull the server auth
 * config, the database adapter and the mail senders into the browser bundle.
 */
export const EMAIL_VERIFICATION_EXPIRES_IN_SECONDS = 60 * 60

/** Rendered into user-facing copy, e.g. "The link is good for an hour." */
export const EMAIL_VERIFICATION_LIFETIME_LABEL = "an hour"
```

Then:

1. In `lib/auth.ts`, import `EMAIL_VERIFICATION_EXPIRES_IN_SECONDS` and set it
   as `emailVerification.expiresIn`, with a short comment noting the copy in
   `resend-verification.tsx` states this value in words.
2. In `components/auth/resend-verification.tsx:110`, replace the literal
   `an hour` with `{EMAIL_VERIFICATION_LIFETIME_LABEL}`.

If changing both labels together ever gets out of sync, that is a review
concern, not a runtime one — say so in the comment rather than building a
number-to-words helper. A helper is out of scope.

**Verify**: `pnpm typecheck` → exit 0. Then
`grep -rn "good for an hour" components/` → no matches (exit 1).

### Step 7: Correct AGENTS.md

Replace `AGENTS.md` lines 174-177, which currently read:

```
Rate limiting is real (`/sign-in/email` is 5 per 60s, `/sign-up/email` is 3).
Repeated sign-in attempts from a script will hit it, and a 403 there is the
limiter, not a bug. `EMAIL_NOT_VERIFIED` is also a 403 — read the body before
concluding which one you are looking at.
```

with a corrected version stating that the limiter returns **429**, an
unverified account returns **403** with `code: "EMAIL_NOT_VERIFIED"`, and a
wrong password returns **401** with `code: "INVALID_EMAIL_OR_PASSWORD"` — so
the status alone identifies which one you are looking at. Also record that a
429 body carries **no `code` field**, which is why client code must branch on
status for that case.

Leave lines 179-194 (the paragraphs about the resend affordance and the
synthetic duplicate-signup response) unchanged — those are accurate.

**Verify**: `grep -n "403 there is the" AGENTS.md` → no matches
(exit 1).

### Step 8: Full verification pass

Run all four commands from the "Commands you will need" table. All must pass.

**Verify**:
- `pnpm typecheck` → exit 0
- `pnpm lint` → exit 0
- `pnpm build` → exit 0

## Test plan

The repo has two verification layers: **vitest** (`pnpm test`) for pure
functions, and hand-written `scripts/verify-*.ts` for anything needing a real
database or the auth pipeline.

Everything this plan changes is either React state or a string, so it does not
fit either layer cleanly — the status-code contract behind it needs the auth
pipeline, which is plan `002`'s job. So:

- `pnpm test` must stay green (you are not changing anything it covers).
- Do **not** add a vitest suite for the login form in this plan. Rendering React
  in a `node`-environment vitest config would mean adding jsdom and a testing
  library, which is a bigger decision than this plan should make. If you think
  a test belongs here, say so in NOTES instead of adding it.

For this plan, verify by hand against a running dev server (`pnpm dev`):

1. **Rate-limited login reports waiting, not a bad password.** Submit the login
   form with any email and a wrong password six times in under a minute. The
   sixth must show "Too many attempts. Wait a minute, then try again." — not
   "That email and password do not match an account."
2. **Unverified login still shows the resend panel.** Requires an unverified
   account; create one by signing up with a fresh `@quincy.test` address and
   not clicking the link. Sign in with the correct password → the panel appears
   naming that address.
3. **Editing the email hides the panel.** From state (2), change one character
   in the email field → the panel disappears. Change it back → it returns.
4. **Signup inbox state offers a login route.** Sign up with any fresh address
   → the "Check your inbox" screen shows a working link to `/login`.
5. **No console errors** in any of the above.

**Clean up any accounts you create.** They live in the shared Neon database.
Delete by email with a throwaway script that hardcodes the exact addresses you
made — never a `LIKE '%@quincy.test'` pattern, which would also delete
`dev@quincy.test` and `christer@quincy.test`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm build` exits 0
- [ ] `grep -n "Both of these come back as 403" components/auth/login-form.tsx` → no matches
- [ ] `grep -n "403 there is the" AGENTS.md` → no matches
- [ ] `grep -n "error.status === 429" components/auth/login-form.tsx` → 1 match
- [ ] `grep -n 'div role="alert"' components/auth/login-form.tsx` → no matches
- [ ] `grep -rn "good for an hour" components/` → no matches
- [ ] `grep -n 'href="/login"' components/auth/signup-form.tsx` → ≥2 matches
- [ ] `lib/auth-constants.ts` exists and is imported by both `lib/auth.ts` and
      `components/auth/resend-verification.tsx`
- [ ] `git status --short` shows no modified files outside the In-scope list
- [ ] Manual checks 1–5 in the test plan all pass
- [ ] `advisor-plans/README.md` status row for 001 updated

## STOP conditions

Stop and report back (do not improvise) if:

- `git status --short` does not match the drift-check output above — the
  working tree is not in the state this plan assumes.
- The code at any location in "Current state" does not match the excerpts.
- `error.status` turns out not to exist on the better-auth client error object
  at runtime (Step 2). The type says it does; if the 429 branch never fires
  during manual check 1, stop rather than guessing at a different property.
- Fixing something appears to require editing `hooks/use-validated-field.ts`,
  `lib/auth-validation.ts`, or anything under `app/`.
- You conclude any rate limit needs loosening to complete a verification step.
- Any verification fails twice after a reasonable fix attempt.

## Maintenance notes

- **The status-code table is the load-bearing fact here.** If better-auth is
  upgraded, re-measure it before trusting either the comment in
  `login-form.tsx` or the paragraph in `AGENTS.md`. Plan 002 turns this into an
  automated check for exactly that reason.
- **Do not add `sendOnSignIn` to `lib/auth.ts`.** It looks like a convenient way
  to re-send on a failed login, but it lets anyone mail-bomb an address by
  replaying the login form. The resend button exists so that option stays off.
- **Do not "fix" the duplicate-signup response.** Reporting "that address is
  taken" would restore account enumeration. The synthetic success is
  deliberate, on better-auth's side, and `AGENTS.md:190-194` records why.
- A reviewer should scrutinize the branch **order** in Step 2. If the 429 test
  is placed before the `EMAIL_NOT_VERIFIED` test it still works today, but it
  couples the two; if better-auth ever attaches a `code` to 429 responses the
  ordering becomes load-bearing.
- Deferred out of this plan: no cooldown timer on the resend button. It
  re-enables immediately after a successful send, so a user can spend the 3/60s
  budget and hit a 429. The server limit is the intended guard and the message
  is now accurate; a client-side timer was judged not worth the state.

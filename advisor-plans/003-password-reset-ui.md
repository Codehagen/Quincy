# Plan 003: Give password reset a user interface

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md`.
>
> **Drift check (run first)**:
>
> ```bash
> ls "app/(auth)"
> grep -n "sendResetPassword" lib/auth.ts
> ```
>
> Expected: `app/(auth)` contains `layout.tsx`, `login/`, `signup/` and nothing
> else; `sendResetPassword` appears in `lib/auth.ts` around line 64. If
> `app/(auth)/reset-password/` or `app/(auth)/forgot-password/` already exists,
> someone has started this work — that is a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (but read the note about `lib/auth.ts` under Scope)
- **Category**: direction
- **Planned at**: commit `17f6b7c`, 2026-08-03 (refreshed against main after the Stripe work merged)

## Why this matters

Password reset is fully built on the server and completely unreachable from the
product. `sendResetPassword` is wired into `lib/auth.ts:69-76`, the email
template exists at `emails/reset-password.tsx`, and
`scripts/verify-mail.ts:105` already asserts that template renders correctly.
What does not exist is any page, link, or component that calls it — `app/(auth)/`
contains only `login/` and `signup/`, and a repo-wide grep for
`resetPassword` / `forgetPassword` in `app/` and `components/` returns nothing.

So a user who forgets their password today is in exactly the lockout this
project just spent a session closing for unverified accounts — except the fix
is already written and sitting on disk unused. This is the cheapest large win
available in the auth surface.

This is scoped as a **build plan rather than a spike** because the design space
is already closed: better-auth dictates the endpoints and the token flow, and
`emails/reset-password.tsx` has already committed to the destination route by
rendering a link to `/reset-password?token=…` in its preview
(`emails/reset-password.tsx:55`). There is nothing left to prototype.

## Current state

### What already works, server-side

`lib/auth.ts:69-76`:

```ts
    sendResetPassword: async ({ user, url }) => {
      const result = await sendPasswordResetEmail({
        to: user.email,
        name: user.name,
        url,
      })
      reportMailFailure("reset-password", result)
    },
```

### The endpoint names — verified by probing the running app

**Do not guess these. They were measured on 2026-08-02:**

| Path | Result |
|---|---|
| `POST /api/auth/request-password-reset` | `200 {"status":true,"message":"If this email exists in our system, check your email for the reset link"}` |
| `POST /api/auth/forget-password` | **`404`** — this route does not exist in better-auth 1.6.25 |
| `POST /api/auth/reset-password` | live (consumes `{ newPassword, token }`) |
| `GET /api/auth/reset-password/:token` | live (redirect callback) |

`lib/auth.ts:182` contains a rate-limit rule for `"/forget-password"`, which is
dead configuration matching a 404. **Leave it alone** — plan `004` owns that
line. Its practical effect today is nil, because better-auth's built-in default
rule for `/request-password-reset` is the same 3-per-60s.

### The flow

1. User submits their email on a "forgot password" page → client calls
   `authClient.requestPasswordReset({ email, redirectTo: "/reset-password" })`.
2. better-auth mails a link to `/api/auth/reset-password/:token?callbackURL=…`.
3. Clicking it redirects to `redirectTo` with either `?token=VALID_TOKEN` or
   `?error=INVALID_TOKEN` appended.
4. The `/reset-password` page reads those query params and, on success, calls
   `authClient.resetPassword({ newPassword, token })`.

`redirectTo` is guarded by `originCheck` (`node_modules/better-auth/dist/api/routes/password.mjs:49`),
so an off-origin value is rejected server-side. Still pass a relative path.

### The conventions to match

**The instruction from the repo owner: build these screens the way the login
screen is built.** Do not invent a layout. `components/auth/login-form.tsx` is
the reference implementation, and both new forms should read as siblings of it —
someone opening all three files should struggle to tell which was written last.

Both existing auth pages are thin server components that read search params and
render a client form. `app/(auth)/login/page.tsx` in full:

```tsx
import { isGoogleEnabled } from "@/lib/auth"
import { getLastLoginMethod } from "@/lib/last-login-method"
import { safeNextPath } from "@/lib/auth-validation"
import { LoginForm } from "@/components/auth/login-form"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  const lastUsed = await getLastLoginMethod()

  return (
    <LoginForm
      googleEnabled={isGoogleEnabled}
      next={safeNextPath(next)}
      lastUsed={lastUsed}
    />
  )
}
```

Note `searchParams` is a **Promise** and must be awaited — this is Next.js 16.

Forms follow `hooks/use-validated-field.ts` for timing ("reward early, punish
late") and `lib/auth-validation.ts` for the rules. Reuse:

- `validateEmail` and `validatePassword` from `lib/auth-validation.ts`
- `PASSWORD_MIN_LENGTH` from the same file, for the "At least N characters."
  description
- `<AuthField>` from `components/auth/auth-field.tsx`
- `<FieldGroup>` from `components/ui/field.tsx`
- `usePointerAutofocus` from `hooks/use-pointer-autofocus.ts`

From `AGENTS.md`:

> Follow `FieldGroup` + `Field`; never a raw `div` with `space-y-*`. Wrap in a
> real `<form>` so Enter submits. Validate on blur, then on change once an error
> has shown — reward early, punish late. Errors render next to their field,
> never as a summary. Submit buttons disable and change label while pending.

> **Icons are `hugeicons`, never `lucide`.**

Form-level error markup, copied from `components/auth/login-form.tsx:152-164`:

```tsx
        <p
          role="alert"
          className="text-destructive text-caption flex items-start gap-2 text-pretty"
        >
          <HugeiconsIcon icon={Alert02Icon} className="mt-px size-4 shrink-0" aria-hidden="true" />
          {formError}
        </p>
```

### The structural skeleton to mirror

Every auth form in this app has the same five-part shape. Reproduce it in both
new forms, dropping only the parts that do not apply (neither reset screen
offers Google — a password flow has nothing to do with OAuth):

```tsx
<form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
  {/* 1. Heading block — a title and one line of plain-language purpose */}
  <div className="flex flex-col gap-1.5">
    <h1 className="text-section">…</h1>
    <p className="text-body text-muted-foreground text-pretty">…</p>
  </div>

  {/* 2. Fields, always wrapped in FieldGroup, never a bare div */}
  <FieldGroup>
    <AuthField … />
  </FieldGroup>

  {/* 3. Form-level error, only when set */}
  {formError ? <p role="alert" …>…</p> : null}

  {/* 4. One primary submit button, full width, label changes while pending */}
  <Button type="submit" className="w-full" disabled={isSubmitting}>
    {isSubmitting ? "…ing" : "…"}
  </Button>

  {/* 5. One caption-sized footer line with the escape route */}
  <p className="text-caption text-muted-foreground text-center">
    …{" "}
    <Link href="…" className="text-foreground underline underline-offset-3">…</Link>
  </p>
</form>
```

`gap-6` between sections and `gap-1.5` inside the heading block are the spacing
rhythm — use `gap` on the parent, never `margin-bottom` on children.

**Use `AuthField` for every input.** It already wires `htmlFor`/`id`,
`aria-invalid`, `aria-describedby`, the inline `FieldError` next to the field,
and the optional description slot (`components/auth/auth-field.tsx:33-56`).
Hand-rolling an `<input>` silently drops all of it. It also means validation
errors land beside their field rather than stacked above the form, which is the
behavior `AGENTS.md` requires.

### Design rules that apply to these two screens

These come from the `design-foundations` skill; they are inlined because you
may not have it available. Where they overlap with the repo's own conventions,
the repo wins.

- **One primary action per view.** Each screen gets exactly one filled `Button`.
  The route out (back to login, request a new link) is a text link in the
  footer, not a second button competing with the first.
- **Label buttons with the outcome, not the mechanism.** "Send reset link" and
  "Set new password" — not "Submit", not "Continue".
- **Error copy says how to fix it.** The existing rules in
  `lib/auth-validation.ts` already do this ("Your email needs an @ symbol") —
  which is why you reuse them rather than writing new ones.
- **Error states need three signals**, not color alone: the destructive text
  color, the `Alert02Icon`, and the message. The markup above carries all
  three; keep them together.
- **Sentence case throughout.** "Check your inbox", not "Check Your Inbox".
- **Never underline non-links**, and keep the one underline style already in
  use: `underline underline-offset-3`.
- **The submit button disables and changes its label while pending** — this is
  both the loading state and what prevents a double submit.
- **No `transition-all`.** `AGENTS.md` states this outright; the shared `Button`
  already names its properties, so simply do not add transitions of your own.
- **Do not place a destructive or irreversible action beside the primary one.**
  Neither screen has one, which is the point: resist adding a "cancel" button
  next to submit. The footer link is the way back.
- **The invalid-link state is an empty state, and empty states explain and act.**
  Say what happened and offer the specific next step ("This link has expired —
  request a new one"), never a bare "Invalid token".

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0, no output |
| Lint | `npx eslint app components` | exit 0, no output |
| Build | `npx next build` | exit 0; route table lists `/forgot-password` and `/reset-password` |
| Dev server | `pnpm dev` | serves on `http://localhost:3000` |
| Local test account | `npx tsx --env-file=.env.local scripts/dev-account.ts` | creates/repairs `dev@quincy.test` |

## Suggested executor toolkit

- **Invoke the `design-foundations` skill if it is available in your
  environment**, before writing the two forms. It covers form layout, button
  hierarchy, error signaling, and copy. The rules that matter most here are
  inlined under "Design rules that apply to these two screens" so you are not
  blocked without it.
- Read `components/auth/login-form.tsx` end to end before writing anything.
  It is the reference implementation for this plan and the closest thing to a
  spec for how an auth screen in this app should be built.
- Read `AGENTS.md` sections "Forms", "Touch and accessibility", and "The two
  type systems" — they are short and they constrain this work directly.

## Scope

**In scope**:

- `app/(auth)/forgot-password/page.tsx` (create)
- `app/(auth)/reset-password/page.tsx` (create)
- `components/auth/forgot-password-form.tsx` (create)
- `components/auth/reset-password-form.tsx` (create)
- `components/auth/login-form.tsx` (add one link — Step 5 only)
- `proxy.ts` (two entries added — Step 0 only)

**Out of scope** (do NOT touch):

- `lib/auth.ts` — the server side is already correct and complete. The dead
  `/forget-password` rate-limit rule on line 165 is **plan 004's** to fix;
  changing it here will collide.
- `emails/reset-password.tsx` — the template is done and asserted by
  `scripts/verify-mail.ts`. Do not restyle it.
- `components/auth/resend-verification.tsx` and the email-verification flow.
  Password reset and email verification are separate flows; do not try to share
  a component between them in this plan.
- ~~`proxy.ts`~~ — **this was wrong and is now IN scope.** See Step 0. The
  original claim that `app/(auth)/` is "outside the gated area" is false:
  `proxy.ts` gates by pathname, not by route group.

## Git workflow

- Branch: `advisor/003-password-reset-ui`
- Commit style: conventional prefix + prose subject; use `feat:`. Examples:
  ```
  8b88f54  feat: the brain as a document, and a cache in front of it
  def2b69  fix: teach tailwind-merge the role scale
  ```
- **Do NOT push or open a PR.**

## Steps

### Step 0: Let signed-out visitors actually reach the new routes

**Do this first. Without it nothing else in this plan is reachable**, and every
manual check in Step 6 fails at the first click.

`proxy.ts` gates routes by pathname. Line 36:

```ts
const AUTH_PAGES = new Set(["/login", "/signup"])
```

and line 46:

```ts
  if (!hasSession && !AUTH_PAGES.has(pathname)) {
    const url = new URL("/login", request.url)
```

So any signed-out visit to `/forgot-password` or `/reset-password` is
redirected to `/login?next=…`. Being in the `app/(auth)/` route group does
nothing — the gate never looks at route groups.

Measured on 2026-08-03: clicking "Forgot password?" on `/login` landed on
`/login?next=%2Fforgot-password`. The whole flow was unreachable.

Add both paths to that set:

```ts
const AUTH_PAGES = new Set([
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
])
```

Change nothing else in `proxy.ts` — not the matcher, not `PUBLIC`, not the
signed-in branch on line 54.

Note the consequence and leave it alone: line 54 redirects a **signed-in** user
away from any `AUTH_PAGES` entry, so someone already logged in who opens a reset
link goes to `/studio` instead of the reset form. That is consistent with how
`/login` and `/signup` already behave, and the far commoner case — a signed-out
person who forgot their password — is the one that must work. If you think this
needs handling, say so in NOTES rather than changing it.

**Verify**: `grep -c "forgot-password\|reset-password" proxy.ts` → 2.

### Step 1: Build the request form

Create `components/auth/forgot-password-form.tsx` (a `"use client"`
component), modelled structurally on `components/auth/login-form.tsx`:

- One `AuthField` for email, using `validateEmail` and `useValidatedField`.
- Submit calls
  `authClient.requestPasswordReset({ email: email.value.trim(), redirectTo: "/reset-password" })`.
- Handle three outcomes:
  - success → swap to a "check your inbox" state, in the same shape as the one
    in `components/auth/signup-form.tsx:93-123`
  - `error.status === 429` → "Too many requests. Wait a minute, then try again."
  - any other error → a generic failure message
- The success state must **not** reveal whether the address exists. The server
  already returns the same body either way ("If this email exists in our
  system…"); the UI must not undo that by saying "we found your account."
- Include a link back to `/login`.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Add the request page

Create `app/(auth)/forgot-password/page.tsx` rendering the Step 1 form. It
needs no search params, so it can be a simple non-async component. Keep it as
thin as `app/(auth)/login/page.tsx`.

**Verify**: `npx next build` → exit 0 and the route table includes
`/forgot-password`.

### Step 3: Build the reset form

Create `components/auth/reset-password-form.tsx` (`"use client"`). It takes
`token: string | null` and `error: string | null` as props (the page reads them
from search params — see Step 4).

- If `error` is set or `token` is null: render a dead-end state explaining the
  link is invalid or expired, with a link to `/forgot-password` to request a
  new one. Do **not** render the password fields in this state.
- Otherwise: one `AuthField` for the new password (`type="password"`,
  `autoComplete="new-password"`, validated with `validatePassword`, described
  with `` `At least ${PASSWORD_MIN_LENGTH} characters.` ``).
- Submit calls `authClient.resetPassword({ newPassword, token })`.
- On success, send the user to `/login` with `useRouter().push("/login")` and
  make sure the login page can explain what happened — simplest is
  `router.push("/login?reset=1")` and a line in Step 5. If you prefer not to
  add that param, a success state with a link to `/login` is acceptable; pick
  one and be consistent.
- Handle `error.status === 429` distinctly, as in Step 1.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 4: Add the reset page

Create `app/(auth)/reset-password/page.tsx`. It must await `searchParams`
(Next.js 16) and pass `token` and `error` down:

```tsx
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>
}) {
  const { token, error } = await searchParams
  return <ResetPasswordForm token={token ?? null} error={error ?? null} />
}
```

**Verify**: `npx next build` → exit 0 and the route table includes
`/reset-password`.

### Step 5: Link it from the login form

In `components/auth/login-form.tsx`, add a "Forgot password?" link to
`/forgot-password`. Put it in the footer area near the existing "No account
yet? Create one" line (around line 195), styled to match:

```tsx
className="text-foreground underline underline-offset-3"
```

Do not restructure the password field to put the link beside its label — that
changes `AuthField`, which is shared, and is out of scope.

This is the **only** change permitted to `login-form.tsx` in this plan.

**Verify**: `grep -n 'href="/forgot-password"' components/auth/login-form.tsx`
→ 1 match. Then `npx eslint app components` → exit 0.

### Step 6: Walk the whole flow against a real account

Start `pnpm dev`. Ensure a usable local account exists:

```bash
npx tsx --env-file=.env.local scripts/dev-account.ts
```

That creates or repairs `dev@quincy.test` using `DEV_ACCOUNT_EMAIL` /
`DEV_ACCOUNT_PASSWORD` from `.env.local`.

Then:

1. `/login` → click "Forgot password?" → lands on `/forgot-password`.
2. Submit `dev@quincy.test` → inbox-state message appears, no account
   confirmation leaked.
3. Submit an address that does not exist → **identical** message.
4. Visit `/reset-password` with no token → the invalid-link state, no password
   field.
5. Visit `/reset-password?error=INVALID_TOKEN` → same invalid-link state.
6. Check the dev server log for the `[auth] reset-password email not delivered`
   line. `@quincy.test` is not a deliverable domain, so you will not receive
   the mail — that is expected.

To exercise the **success** path end to end you need a real token. Do **not**
edit `lib/auth.ts` to log it — better-auth already persists it. It lands in the
`verification` table with `identifier` of the form `reset-password:<token>`
(confirmed 2026-08-03). Read the newest row and rebuild the link yourself:

```
/api/auth/reset-password/<token>?callbackURL=%2Freset-password
```

That GET validates the token and redirects to `/reset-password?token=…`, which
is the page under test. Nothing in `lib/auth.ts` needs touching, so there is no
temporary edit to forget to revert.

7. With a real token: set a new password → redirected to `/login` → sign in
   with the new password succeeds.
8. Re-use the same token a second time → rejected with the invalid-link state.

**Verify**: `git diff lib/auth.ts` → empty output.

## Test plan

There is no unit test framework in this repo; verification is by hand plus the
`scripts/verify-*.ts` scripts.

- The manual walk in Step 6 is the test. All eight checks must pass.
- Run `npx tsx --env-file=.env.local scripts/verify-mail.ts` → exit 0, all
  `PASS`. This confirms the reset-password template still renders correctly;
  you have not changed it, so a failure here means something else regressed.
- If plan `002` has landed, run
  `npx tsx --env-file=.env.local scripts/verify-auth-recovery.ts` → exit 0.
  Adding password-reset assertions to that script is **out of scope** here;
  note it as follow-up work instead.

Clean up: if you created any account beyond `dev@quincy.test`, delete it by
exact email equality. Never delete by a `@quincy.test` pattern —
`christer@quincy.test` and `dev@quincy.test` share that domain.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npx eslint app components` exits 0
- [ ] `npx next build` exits 0 and its route table contains both
      `/forgot-password` and `/reset-password`
- [ ] `grep -n 'href="/forgot-password"' components/auth/login-form.tsx` → 1 match
- [ ] `grep -rn "requestPasswordReset" components/auth/` → ≥1 match
- [ ] `grep -rn "forgetPassword" components/ app/` → **no matches** (that is the
      404 path; the correct method is `requestPasswordReset`)
- [ ] `git diff lib/auth.ts` → empty (the Step 6 debug log was reverted)
- [ ] `grep -c "forgot-password\|reset-password" proxy.ts` → 2
- [ ] Signed out, `curl -s -o /dev/null -w '%{http_code}' http://localhost:PORT/forgot-password`
      → `200`, not a `307` to `/login`
- [ ] `git status --short` shows no files changed outside the In-scope list
- [ ] All eight manual checks in Step 6 pass
- [ ] Both new forms use `<AuthField>` and `<FieldGroup>` —
      `grep -c "AuthField" components/auth/forgot-password-form.tsx components/auth/reset-password-form.tsx`
      returns ≥1 for each, and
      `grep -rn "space-y-" components/auth/forgot-password-form.tsx components/auth/reset-password-form.tsx`
      returns no matches
- [ ] Exactly one `<Button type="submit">` per new form; the route back to
      `/login` is a `<Link>`, not a second `Button`
- [ ] `grep -rn "transition-all" components/auth/` → no matches
- [ ] No `lucide` import anywhere in the new files —
      `grep -rn "lucide" components/auth/` → no matches
- [ ] Side-by-side check: open `/login`, `/forgot-password` and
      `/reset-password` at the same viewport width. Heading size, field
      spacing, button width and footer-link style are visually identical
      across all three
- [ ] `advisor-plans/README.md` status row for 003 updated

## STOP conditions

Stop and report back (do not improvise) if:

- `app/(auth)/reset-password/` or `app/(auth)/forgot-password/` already exists.
- `authClient.requestPasswordReset` does not exist on the client object. Do not
  substitute `authClient.forgetPassword` — that maps to a path this app returns
  404 for, verified on 2026-08-02.
- The reset link in the email points somewhere other than
  `/api/auth/reset-password/:token`.
- You conclude a change to `lib/auth.ts`, `proxy.ts`, or `emails/` is required.
- Step 6 check 3 shows a *different* message for a non-existent address than
  for a real one — that is an account-enumeration leak and needs reporting, not
  patching around.
- Any verification fails twice after a reasonable fix attempt.

## Maintenance notes

- **Two flows now mail one-time links** (verification and reset) and they share
  `lib/mail.ts`'s `mailKey` idempotency scheme, which hashes the URL. That is
  what lets a genuine re-request send while a retry of the same send dedupes —
  see the long comment at `lib/mail.ts:27-44`. If either flow starts reusing a
  token across requests, that scheme breaks.
- **Do not merge this with the email-verification resend component.** They look
  similar and are not: verification proves an address, reset changes a
  credential, and their failure modes and rate limits differ.
- A reviewer should check Step 1's success state and Step 6 check 3 together —
  the enumeration-safety of this flow lives entirely in those two being
  identical.
- Deferred: no assertions for password reset in `scripts/verify-auth-recovery.ts`
  (plan 002 owns that file and was written before this flow existed). Adding a
  reset section there is worthwhile follow-up.
- Deferred: reset does not revoke existing sessions. better-auth has a
  `revokeSessionsOnPasswordReset`-style option; whether a reset should sign out
  other devices is a product decision, not a bug, and was left alone
  deliberately.

# Plan 011: Document the variables whose absence silently disables the crons

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `advisor-plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat a3ca175..HEAD -- .env.example app/api/cron/channels/route.ts app/api/cron/heartbeat/route.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `a3ca175`, 2026-08-04

## Why this matters

`.env.example` is the only way a new clone learns which variables exist — the
file says so itself, and `.gitignore` carries an explicit exception to keep it
tracked. Three variables the code depends on are missing from it, and one of
them fails in a way nobody will notice.

`CRON_SECRET` gates both scheduled jobs. Without it they return 503 twice a
day, forever, with no user-visible symptom and nothing that alerts. One of
those jobs is the daily channel sweep — the only mechanism that notices when
someone revokes Quincy at LinkedIn's Permitted Services. So a single
undocumented variable produces exactly the outcome that sweep was built to
prevent: Quincy keeps trying to publish as someone who withdrew consent.

The other two, `DEV_ACCOUNT_EMAIL` and `DEV_ACCOUNT_PASSWORD`, are the *input
to the safety guard* in three scripts that delete channel connections. An
operator who does not know the variable exists cannot know the guard depends on
it.

Both cron routes already fail closed, which is right. The gap is purely
discoverability.

## Current state

Files and their roles:

- `.env.example` — the tracked template; the only record of which variables exist
- `app/api/cron/channels/route.ts` — daily channel sweep, 06:00 UTC
- `app/api/cron/heartbeat/route.ts` — weekly brain heartbeat, Mondays 22:17 UTC
- `scripts/verify-channels.ts`, `scripts/verify-channel-maintenance.ts`,
  `scripts/verify-publish.ts` — read `DEV_ACCOUNT_EMAIL` for their guard
- `scripts/dev-account.ts` — reads both `DEV_ACCOUNT_EMAIL` and `DEV_ACCOUNT_PASSWORD`

**The gate** (`app/api/cron/channels/route.ts:23-35`, and the same shape in
`heartbeat/route.ts`):

```ts
  const secret = process.env.CRON_SECRET

  if (!secret) {
    return Response.json(
      { error: "CRON_SECRET is not set. Refusing to run unauthenticated." },
      { status: 503 }
    )
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    // 404 rather than 401, matching /api/cron/heartbeat: an unauthenticated
    // caller should not learn that this path exists.
    return new Response("Not found", { status: 404 })
  }
```

**Confirmed absent**: `grep -c "CRON_SECRET" .env.example` → `0`.

**The guard that depends on `DEV_ACCOUNT_EMAIL`**
(`scripts/verify-channels.ts:78-86`):

```ts
const ACCOUNT = process.env.DEV_ACCOUNT_EMAIL ?? "dev@quincy.test"

if (!ACCOUNT.endsWith("@quincy.test")) {
  throw new Error(
    `Refusing to touch ${ACCOUNT} — this script deletes channel connections ` +
      "and only operates on @quincy.test accounts."
  )
}
```

**The house style for `.env.example`** — every block is prose explaining *why*
the variable matters and what breaks without it, then the assignment. The file
opens with:

```
# Copy to .env.local and fill in. .env* is gitignored.

# Neon. Pooled connection string from the Neon console.
```

and the channel block (near the end of the file) reads:

```
# Channel connections — where Quincy publishes. See plans/005. Each pair is
# optional and independent: an unconfigured channel hides its Connect button
# rather than offering one that fails on click, the same way Google does above.
```

Match that voice: a sentence on what it is, then what goes wrong without it.

**Where the crons are scheduled** (`vercel.json`):

```json
  "crons": [
    { "path": "/api/cron/heartbeat", "schedule": "17 22 * * 1" },
    { "path": "/api/cron/channels", "schedule": "0 6 * * *" }
  ]
```

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `pnpm typecheck` | exit 0 |
| Unit tests | `pnpm test` | all pass |
| Find undocumented vars | `grep -rho "process\.env\.[A-Z_]*" lib app proxy.ts next.config.ts scripts \| sort -u` | list to compare against `.env.example` |

**Never run `pnpm build`** (a dev server may share `.next`) and **never run
`pnpm format`**.

## Scope

**In scope**:

- `.env.example` (add the three variables with explanatory comments)

**Out of scope** (do NOT touch):

- `app/api/cron/channels/route.ts`, `app/api/cron/heartbeat/route.ts` — the
  503-on-missing behaviour is correct and deliberate. Do not change it to warn,
  log, or proceed unauthenticated.
- `.env.local` — untracked, holds real values, and this plan must never read or
  write it.
- Any script that reads these variables.
- `vercel.json`.

## Git workflow

- Branch: `advisor/011-document-cron-secret`
- Conventional-commit style, lower-case imperative subject. Example from
  `git log`: `feat: let a script tell you the developer portal is set up right`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add `CRON_SECRET`

Append a block to `.env.example`. Place it **after** the channel-connections
block at the end of the file, so the crons sit next to the feature whose
lifecycle they maintain.

```
# Scheduled jobs. Vercel Cron sends this as `Authorization: Bearer <value>`;
# nothing else does. Generate with: openssl rand -base64 32
#
# Both cron routes refuse to run without it — 503, deliberately, because the
# alternative is a public endpoint that rewrites everyone's memory on request.
# That refusal is silent: an unset secret means /api/cron/channels returns 503
# every morning and nothing tells you. That job is the only thing that notices
# when someone removes Quincy at LinkedIn's Permitted Services, so losing it
# means Quincy keeps trying to publish as a person who withdrew consent —
# which is the exact failure the job exists to prevent. Set it in every
# environment that runs the crons.
CRON_SECRET=""
```

**Verify**: `grep -c "CRON_SECRET" .env.example` → `1`. Note `grep -c` counts
matching *lines*, not occurrences, and the prose above refers to the variable
by pronoun rather than by name — so one line, the assignment, is correct.

### Step 2: Add the developer-account variables

Append a second block after the one from Step 1:

```
# The local test account, and the input to a safety guard.
#
# scripts/dev-account.ts creates or repairs it; three verification scripts
# (verify-channels, verify-channel-maintenance, verify-publish) read the email
# and refuse to run unless it ends in @quincy.test. Those scripts delete
# channel connections, so that suffix check is the thing standing between a
# verification run and a real OAuth grant it would take a human re-consent to
# get back. Leave these unset to accept the @quincy.test defaults; override
# only with another @quincy.test address.
DEV_ACCOUNT_EMAIL=""
DEV_ACCOUNT_PASSWORD=""
```

**Verify**: `grep -c "DEV_ACCOUNT_EMAIL" .env.example` → `1` (the assignment line).

### Step 3: Confirm nothing else is undocumented

Run:

```
grep -rho "process\.env\.[A-Z_][A-Z0-9_]*" lib app proxy.ts next.config.ts scripts \
  | sed 's/process\.env\.//' | sort -u
```

Compare each name against `.env.example`. Expected: every name appears in
`.env.example`, **except** these, which are legitimately absent:

- `NODE_ENV` — set by the runtime, never by a human.
- `VERCEL_*` / `VERCEL_ENV` (if present) — injected by the platform.

If you find any *other* name missing, judge it before adding it. Add it only if
it is **application configuration** — something a deployment must set for Quincy
to work. Do NOT add standard OS or runtime variables that happen to be read
somewhere, even though the sweep will surface them.

`TZ` is the case that has already caught one executor, so it is named here
explicitly: **do not add it.** `scripts/verify-timezone.ts:18-19` documents it as
a per-invocation command-line override (`TZ=UTC npx tsx --env-file=.env.local
scripts/verify-timezone.ts`), used to run the same query under different host
zones. This file is a template people copy to `.env.local`; an empty `TZ` is not
the same as an unset one — it is commonly read as UTC — so a copied `TZ=""` could
silently pin every script run to UTC and defeat the very host-zone-independence
test the variable exists for.

Do **not** invent a value for anything you do add.

**Verify**: your report lists every name found and its status.

### Step 4: Confirm the file still parses as an env file

The file must remain valid `KEY=""` syntax with `#` comments. Check that no
line you added has an unquoted value or a stray character:

```
grep -nE '^[A-Z_][A-Z0-9_]*=' .env.example | grep -vE '^[0-9]+:[A-Z_][A-Z0-9_]*="[^"]*"$'
```

**Verify**: no output (every assignment is `NAME="value"` form).

### Step 5: Confirm no real secret was committed

```
grep -nE '^[A-Z_][A-Z0-9_]*="..+"' .env.example
```

**Verify**: the only non-empty values are the pre-existing documented defaults
(`LINKEDIN_API_VERSION` and any others that were already non-empty before your
change). **Every variable you added must have an empty `""` value.** If any
line you added has content between the quotes, remove it — this file is
tracked in git.

## Test plan

No code changes, so no new tests. The verification is Step 3's completeness
sweep and Step 5's secret check.

Confirm nothing regressed: `pnpm typecheck` and `pnpm test` both still pass
(they should be entirely unaffected — if either fails, you edited something
outside scope).

## Done criteria

ALL must hold:

- [ ] `grep -c "CRON_SECRET" .env.example` returns `1`
- [ ] `grep -c "DEV_ACCOUNT_EMAIL" .env.example` returns `1`
- [ ] `grep -c "DEV_ACCOUNT_PASSWORD" .env.example` returns `1`
- [ ] `grep -c "^TZ=" .env.example` returns `0` — see Step 3
- [ ] Step 4's syntax check produces no output
- [ ] Step 5 shows no non-empty value on any line you added
- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0
- [ ] `git status --short` shows `.env.example` as the only modified file
- [ ] `advisor-plans/README.md` status row for 011 updated

## STOP conditions

Stop and report back (do not improvise) if:

- `grep -c "CRON_SECRET" .env.example` was already non-zero before you started
  — the file has drifted from this plan.
- Step 3 finds a variable you cannot explain from reading the code. Report it
  rather than guessing at a comment.
- You are tempted to copy a value from `.env.local`. **Never do this.** The
  example file is tracked; every value in it must be empty.
- Any file other than `.env.example` needs changing to satisfy the done
  criteria.

## Maintenance notes

- **The rule to keep**: a new `process.env.X` read is not finished until `X` is
  in `.env.example` with a sentence on what breaks without it. A reviewer
  should check for this on any PR that adds an env read.
- The 503-on-missing behaviour in both cron routes is intentional and should
  survive. If someone later wants an alert instead of a silent 503, that is a
  monitoring change (log at error level, or a Vercel log drain alarm), not a
  change to the refusal.
- Deliberately deferred: making a missing `CRON_SECRET` *noisy* in production.
  Documenting it is the cheap fix; wiring an alert is a separate piece of work
  with its own decisions about where alerts go.

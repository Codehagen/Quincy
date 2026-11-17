# Plan 032: Prove the Fathom and Granola webhooks end to end, without an account at either vendor

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat f217456..HEAD -- lib/granola.ts lib/fathom.ts lib/standard-webhooks.ts lib/meeting-intake.ts "app/api/webhooks/fathom" "app/api/webhooks/granola" lib/source-connections.ts`
> If any of these changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW (a script, and one env override with a production default)
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `f217456`, 2026-11-17 (branch `claude/project-thread-3xdn60`)

## Why this matters

The Fathom and Granola sources (branch `claude/project-thread-3xdn60`) are
proven only by unit tests on their pure parts: the Standard Webhooks
signature, the payload mappers and the vendor API clients with a fake
`fetch`. Nothing has ever POSTed to `/api/webhooks/fathom/[token]` or
`/api/webhooks/granola/[token]` and checked what landed in the database. The
Circleback source had exactly that gap closed by `scripts/verify-circleback.ts`
(plans/019), and that script found a real silent bug on its second run (every
user resolved to `expired`). The same branch also moved Circleback's
post-verification code into `lib/meeting-intake.ts`, so re-running
`verify-circleback.ts` is the regression check for that refactor.

This plan adds `scripts/verify-meeting-sources.ts`: the same discriminating
checks for Fathom and Granola, run against a local dev server, with no Fathom
or Granola account needed. Granola needs one small seam because its route
fetches the note from Granola's API.

## Current state

- `scripts/verify-circleback.ts` (607 lines) is the pattern to copy. Its
  shape: refuse any account not ending `@quincy.test`; find the dev user;
  hold the account entitled for the run (`setTrial`) and restore it in
  `finally`; a `check(ok, label, detail)` helper that counts failures; set up
  the connection directly through `lib/source-connections.ts` (not through
  the UI); POST to `${BASE}/api/webhooks/circleback/${token}`; assert on
  `source_item` and `riff` rows; tear down only what it created. Read the
  whole file before starting. Run it with
  `npx tsx --env-file=.env.local scripts/verify-circleback.ts`.
- `lib/source-connections.ts` exports
  `storeProviderWebhook(userId, source, { apiKey, signingSecret, meta })`,
  which encrypts and stores a key and a `whsec_` secret on an existing row,
  and `connectSource(userId, source)`, which creates the row and its token.
  Together they set up a Fathom or Granola connection with no vendor call.
- Signing: Standard Webhooks. `lib/standard-webhooks.test.ts` has a `sign()`
  helper to copy:
  ```ts
  function sign(id: string, ts: string, body: string, secret = SECRET) {
    const key = Buffer.from(secret.slice("whsec_".length), "base64")
    return "v1," + createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64")
  }
  ```
  Headers: `webhook-id`, `webhook-timestamp` (unix seconds, within 5 min),
  `webhook-signature`. The secret must be `whsec_` plus valid base64
  (`isStandardWebhookSecret`).
- `lib/fathom.test.ts` has `body()`: a valid Fathom payload with two
  speakers. Reuse its shape: the dev user's email must be `recorded_by.email`.
- `lib/granola.ts:22`: `export const GRANOLA_API = "https://public-api.granola.ai"`,
  used by `createGranolaWebhook`, `deleteGranolaWebhook` and `fetchGranolaNote`.
  The Granola route (`app/api/webhooks/granola/[token]/route.ts`) calls
  `fetchGranolaNote(apiKey, noteId)` after verifying, so a local test needs
  that base URL pointed at a stub.
- Granola route outcomes to assert: 401 + `recordSourceError` on a bad
  signature; `{state:"ignored"}` for `note.edited`; on a stubbed 401 from the
  note fetch, `state` becomes `broken` (`markBroken`); on a stubbed 500,
  the route answers 503; on success, the same intake as Fathom.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `pnpm typecheck` | exit 0 |
| Unit tests | `pnpm test` | all pass |
| Lint | `pnpm lint` | 0 errors |
| Dev server (for the script) | `GRANOLA_API_BASE=http://localhost:4010 pnpm dev` | listening on 3000 |
| Dev account | `npx tsx --env-file=.env.local scripts/dev-account.ts` | a `@quincy.test` user exists |
| Regression | `npx tsx --env-file=.env.local scripts/verify-circleback.ts` | every line PASS |
| This plan | `npx tsx --env-file=.env.local scripts/verify-meeting-sources.ts` | every line PASS |

## Scope

**In scope:**
- `lib/granola.ts` — one line: read the base URL from `process.env.GRANOLA_API_BASE`, defaulting to the production URL.
- `scripts/verify-meeting-sources.ts` (create).
- `plans/README.md` — status row only.

**Out of scope:**
- Any route, `lib/meeting-intake.ts`, `lib/fathom.ts`. If a check fails because of a bug there, STOP and report it; do not fix it in this plan.
- `scripts/verify-circleback.ts` — run it, do not edit it.
- An equivalent override for Fathom: the Fathom route never calls Fathom.

## Git workflow

- Branch off `claude/project-thread-3xdn60` (or `main` once that PR has merged): `advisor/032-verify-meeting-sources`.
- Commit style: a plain sentence saying what is now true, as in `git log` (e.g. "Fathom and Granola connect with one API key and read calls like Circleback").
- Do not push unless told to.

## Steps

### Step 1: Let the Granola base URL be overridden

In `lib/granola.ts`, replace the constant with:

```ts
/**
 * Overridable only so scripts/verify-meeting-sources.ts can point the route at
 * a local stub. Production never sets it.
 */
export const GRANOLA_API = process.env.GRANOLA_API_BASE || "https://public-api.granola.ai"
```

**Verify**: `pnpm vitest run lib/granola.test.ts` → all pass (the tests assert on the production URL via the default).

### Step 2: Write the script's skeleton

Create `scripts/verify-meeting-sources.ts` by copying the frame of
`verify-circleback.ts`: the header comment (rewritten for this script), the
`@quincy.test` guard, the owner lookup, `setTrial` hold-and-restore, `check()`,
`--port` and `--live` flags, and a `finally` teardown that deletes only the
`source_connection`, `source_item` and `riff` (and `riff_angle`) rows for
sources `fathom` and `granola` belonging to the dev user that this run created.
Before setup, refuse to start if a `fathom` or `granola` connection already
exists for the dev user (it may be a real one; the script must not overwrite it).

**Verify**: `pnpm typecheck` → exit 0.

### Step 3: Fathom checks

Set up: `connectSource(owner.id, "fathom")`, then `storeProviderWebhook` with
a fake key, a test `whsec_` (base64 of a fixed 32-byte string) and
`meta: { webhookId: "verify" }`. Then, against `${BASE}/api/webhooks/fathom/<token>`:

1. GET → 405.
2. POST to an unknown token → 404.
3. POST a valid body with **no** signature headers → 401, and no `source_item` row.
4. POST a valid body whose signature was made over a **different** body → 401. This is the check that matters most: a route that ignores the signature passes every other check.
5. POST with a timestamp 10 minutes old (correctly signed for that timestamp) → 401.
6. POST correctly signed → 202, `state: "working"` (stubbed mode). Exactly one `source_item` with `source = 'fathom'`, `external_id = String(recording_id)`; its `body` contains the dev user's line and **not** the other speaker's line.
7. POST the identical body again (new `webhook-id`, new signature) → 200 `state: "duplicate"`, still one row.
8. The connection row is `arriving` with `lastItemAt` set.
9. A riff with `source_id = 'fathom'` exists. With `--live`, wait for it as `verify-circleback.ts` does and assert angles were written.

**Verify**: run the script with the dev server up → all Fathom lines PASS.

### Step 4: Granola checks, with a stub API

Start a `node:http` server on port 4010 inside the script that answers
`GET /v1/notes/<id>?include=transcript` from an in-memory map you control per
check: a note (copy `note()` from `lib/granola.test.ts`, with `owner.email`
set to the dev user's email), or a bare status code. Close it in `finally`.
Print a clear error and exit if the dev server was not started with
`GRANOLA_API_BASE=http://localhost:4010` (detect it: the success check below
will get a fetch to the real host; instead, assert the stub saw a request).

Then, against `${BASE}/api/webhooks/granola/<token>`:

1. Unsigned and wrongly signed → 401.
2. `event_type: "note.edited"` correctly signed → 200 `state: "ignored"`, the stub saw **no** request.
3. `note.generated` with the stub answering the note → 202; one `source_item` with `source = 'granola'`; body has the `attribution: "me"` line only.
4. Same `note_id` again → `duplicate`.
5. A new `note_id` with the stub answering 500 → 503 (so Granola would retry), no row.
6. A new `note_id` with the stub answering 401 → 200 `state: "stopped"`, and the connection's `state` is `broken`. Run this last.

**Verify**: all Granola lines PASS.

### Step 5: Regression for the shared intake

Run `scripts/verify-circleback.ts` unchanged.

**Verify**: every line PASS. If any fail, STOP: the `lib/meeting-intake.ts` refactor broke Circleback.

## Test plan

The script is the test. Each numbered check above is one `check()` line.
Model the code on `scripts/verify-circleback.ts`. Unit tests are unchanged
except that `lib/granola.test.ts` must still pass after Step 1.

## Done criteria

- [ ] `pnpm typecheck` exits 0, `pnpm lint` reports 0 errors, `pnpm test` passes
- [ ] `npx tsx --env-file=.env.local scripts/verify-meeting-sources.ts` prints only PASS lines and exits 0
- [ ] `npx tsx --env-file=.env.local scripts/verify-circleback.ts` prints only PASS lines
- [ ] After the run, no `fathom`/`granola` `source_connection` remains for the dev user
- [ ] `git status` shows only the in-scope files changed

## STOP conditions

- A dev user already has a real `fathom` or `granola` connection.
- Check 4 (wrong-body signature) or a Granola 401 check *passes when it should fail*: that is a security bug; report it with the response.
- Any check fails because of route or intake behavior (not the script).
- `verify-circleback.ts` fails.

## Maintenance notes

- Any new meeting source (see plans/033) should add its section here, not a new script.
- The check that a wrong-body signature is refused is the one never to delete.

## A live test with a real Fathom account (not part of this plan; for the owner)

The script proves the endpoint. Only a real recording proves Fathom's real
payload matches the mapper. Steps: deploy the branch somewhere public with
`pnpm db:push` applied to that database and `BETTER_AUTH_URL` set to that
deployment's own URL (the webhook URL is built from it, and Fathom rejects
localhost); open `/connectors?open=fathom`, paste a Fathom API key; record a
two-minute call where you say one quotable thing; within a few minutes the
row should read "Last call today" and an idea should appear. If the riff
fails with "could not tell which voice was yours", capture the raw body from
the function logs: that is the case plans/034 addresses.

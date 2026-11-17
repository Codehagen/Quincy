# Plan 033: A fourth meeting source is one registry entry, and every "paste a string" form is one component

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat f217456..HEAD -- lib/meeting-intake.ts lib/connectors-load.ts lib/fathom.ts lib/granola.ts "app/(app)/sources/actions.ts" components/connectors/connector-verbs.tsx`
> On any change, compare the excerpts below with the live code; a mismatch is a STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (touches the connect flow and three forms; behavior must not change)
- **Depends on**: plans/032 (run its script before and after as the behavior check)
- **Category**: tech-debt
- **Planned at**: commit `f217456`, 2026-11-17 (branch `claude/project-thread-3xdn60`)

## Why this matters

The branch that added Fathom and Granola made a meeting source's facts live in
nine places. Adding the next note taker (Otter, tl;dv, Zoom's own) today means
editing all of them and missing one silently: a source missing from the
`readEvents` list shows no metric, and one missing from `MEETING_SOURCES`
escapes the daily spend ceiling. Separately, `components/connectors/connector-verbs.tsx`
now holds three hand-written copies of the same form (a label, one input, an
error, a pending submit button, a note beside it). Three copies is the point at
which extraction stops being premature. This plan does both, with **no change
in behavior**.

## Current state

Where a meeting source's facts live today (all verified at `f217456`):

1. `lib/meeting-intake.ts:40-49` — the ceiling list and vendor names:
   ```ts
   export type MeetingSource = "circleback" | "fathom" | "granola"
   export const MEETING_SOURCES: readonly MeetingSource[] = ["circleback", "fathom", "granola"]
   const VENDOR: Record<MeetingSource, string> = { circleback: "Circleback", fathom: "Fathom", granola: "Granola" }
   ```
2. `lib/connectors-load.ts:375` and `:382` — hard-coded
   `["github", "circleback", "fathom", "granola"]` in `readEvents`, plus the
   `riffs`/`items` objects returned beneath it with one key per source.
3. `app/(app)/sources/actions.ts:313-490` — `KeySource`, `isKeySource`, and four
   `source === "fathom" ? <fathom fn> : <granola fn>` branches (lines ~349,
   ~369, ~415, ~451) choosing the vendor's name, create and delete functions.
4. `components/connectors/connector-verbs.tsx` — `KEY_HELP` (where the key
   lives at each vendor) and `KeySourceVerbs`.
5. `lib/schema-app.ts` `SOURCE_ITEM_SOURCES`, `lib/rhythms.ts` `Node` and the
   `meeting-notes` rhythm's `from`, `lib/connectors.ts` `LIVE`,
   `lib/sources.ts` `SOURCES`. **These stay where they are** (see Scope): they are
   catalogue/type positions with their own reasons, and each is a compile-time
   or test-visible list.

Dead code found in the audit: `getKeySourceSetup` and `KeySourceSetup` in
`app/(app)/sources/actions.ts:315` and `:463` have no callers
(`grep -rn getKeySourceSetup` finds only the definition). The loader reads
`meta.accountEmail` itself.

The three forms in `components/connectors/connector-verbs.tsx`:
- GitHub login, around line 331 (`<Field label="Your GitHub username" error={loginError}>`).
- Circleback signing secret, around line 489 (`<Field label="2. Paste the signing secret Circleback showed you" error={secretError}>`).
- Fathom/Granola API key, around line 579 (`<Field label={detail.connected ? ... : ...} error={error}>`).

Each one repeats: `useState` for the value and the error, `useTransition` for
pending, `<form noValidate onSubmit={preventDefault; save()}>`, a `Field` with
`error`, an `Input` (`mono`, `autoComplete="off"`, `spellCheck={false}`, clears
the error on change), a submit `Button` with `disabled={!value.trim()}`,
`pending`, `pendingLabel`, `variant` from the ink rule, and the value cleared on
success. Kit components (`Field`, `Input`, `Button`, `Text`) come from
`@/components/kit`; read `components/kit/field.tsx` and `input.tsx`.

House rules that apply (AGENTS.md): kit components and `--kit-*` tokens only;
Base UI, never Radix; `render` not `asChild`; icons are hugeicons; the one
action on a page is the ink pill (`variant="action"`), which a form receives
from the page via `isAction`, never decides on its own.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `pnpm typecheck` | exit 0 |
| Tests | `pnpm test` | all pass |
| Lint | `pnpm lint` | 0 errors |
| Behavior | `npx tsx --env-file=.env.local scripts/verify-meeting-sources.ts` and `scripts/verify-circleback.ts` (dev server up, see plans/032) | all PASS, same as before |

## Scope

**In scope:**
- `lib/meeting-sources.ts` (create): the client-safe registry.
- `lib/meeting-sources-server.ts` (create): the vendor API bindings, server only.
- `lib/meeting-intake.ts`, `lib/connectors-load.ts`, `app/(app)/sources/actions.ts`, `components/connectors/connector-verbs.tsx`.
- `components/connectors/paste-form.tsx` (create).
- `lib/meeting-sources.test.ts` (create).

**Out of scope:**
- The schema enum, `lib/rhythms.ts`, `lib/connectors.ts` `LIVE`, `lib/sources.ts`. Add a test (Step 5) that keeps them in step with the registry instead of moving them.
- The webhook routes. Each vendor's route stays its own file: verification and parsing differ per vendor by design (`app/api/webhooks/*/[token]/route.ts`).
- `components/kit/*`. `PasteForm` is a connectors-local component, not a kit component; promote it only if a page outside /connectors needs it.
- Any copy change. Every label, hint and message must read exactly as before.

## Git workflow

Branch `advisor/033-meeting-source-registry`. One commit per step. Plain-sentence commit messages, as in `git log`.

## Steps

### Step 1: The registry, client-safe

Create `lib/meeting-sources.ts`. No server imports (it is read by a client component):

```ts
export const MEETING_SOURCE_IDS = ["circleback", "fathom", "granola"] as const
export type MeetingSource = (typeof MEETING_SOURCE_IDS)[number]

export type MeetingSourceInfo = {
  vendor: string
  /** How it connects. `url-and-secret` is Circleback's two steps; `api-key` is one paste. */
  setup: "url-and-secret" | "api-key"
  /** For `api-key` only: where the key lives, in the vendor's own words, and a link. */
  key?: { where: string; href: string; note: string }
}

export const MEETING_SOURCES: Record<MeetingSource, MeetingSourceInfo> = { ... }
export type KeySource = { [K in MeetingSource]: (typeof MEETING_SOURCES)[K]["setup"] extends "api-key" ? K : never }[MeetingSource]
export function isKeySource(value: string): value is KeySource
```

Move the `KEY_HELP` strings into `key` verbatim. If the conditional `KeySource`
type does not narrow (because `MEETING_SOURCES` is typed as a `Record`), declare
the object `as const satisfies Record<MeetingSource, MeetingSourceInfo>` instead.

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: The server bindings

Create `lib/meeting-sources-server.ts` with `import "server-only"` if the repo
uses it (`grep -rn "server-only" lib | head -3`; if not, omit it and say so in
the commit). Export:

```ts
export type VendorWebhook = { id: string; secret: string; meta: Record<string, unknown> }
export const KEY_SOURCE_API: Record<KeySource, {
  create(apiKey: string, url: string): Promise<{ ok: true; value: VendorWebhook } | { ok: false; message: string }>
  remove(apiKey: string, webhookId: string): Promise<boolean>
}>
```

Fathom's `create` wraps `createFathomWebhook` with `meta: { webhookId }`;
Granola's wraps `createGranolaWebhook` with `meta: { webhookId, accountEmail, accountName }`,
exactly the objects built inline in `connectKeySource` today.

**Verify**: `pnpm typecheck` → exit 0.

### Step 3: Read the registry everywhere it is duplicated

- `lib/meeting-intake.ts`: import `MEETING_SOURCE_IDS`, `MEETING_SOURCES`, `MeetingSource`; delete the local type, list and `VENDOR`; the ceiling query uses `[...MEETING_SOURCE_IDS]`, the vendor name is `MEETING_SOURCES[source].vendor`. Keep the exported name `MEETING_SOURCES` from this file **only if** something imports it (`grep`); otherwise drop it.
- `lib/connectors-load.ts`: build the list as `["github", ...MEETING_SOURCE_IDS]` and the `riffs`/`items` objects by iterating it. The returned shape stays `Record<string, Date[]>`-compatible with today's callers.
- `app/(app)/sources/actions.ts`: delete `KeySource`, `isKeySource`, `KeySourceSetup`, `getKeySourceSetup`; import from the registry; replace the four ternaries with `MEETING_SOURCES[source].vendor` and `KEY_SOURCE_API[source].create/remove`.

**Verify**: `pnpm typecheck` → exit 0; `pnpm test` → all pass; `grep -n 'source === "fathom"' -r app lib components` → no matches.

### Step 4: `PasteForm`, a compound component, and the three forms on it

Create `components/connectors/paste-form.tsx` (`"use client"`). Compound, with
the root owning the value, the error and the pending state through context:

```tsx
<PasteForm action={(value) => connectKeySource(detail.source, value)}>
  <PasteForm.Field label={...} type="password" placeholder="whsec_…" />
  <PasteForm.Hint>Find it in <TextLink …>…</TextLink>. …</PasteForm.Hint>
  <PasteForm.Footer>
    <PasteForm.Submit variant={...} pendingLabel="Connecting…">{detail.connected ? "Replace" : "Connect"}</PasteForm.Submit>
    {detail.connected && detail.account ? <Text variant="small" tone="muted">Connected as {detail.account}.</Text> : null}
  </PasteForm.Footer>
</PasteForm>
```

Rules for the component (from the component-design guidance and AGENTS.md):
- `action: (value: string) => Promise<{ ok: true } | { ok: false; message: string }>` — the result type every server action here already returns. On `ok`, clear the value; on a refusal, show `message` as the field's `error`.
- `Field` takes the kit `Input` props it needs and spreads the rest onto `Input` (`type`, `placeholder`, `mono` default true, `autoComplete="off"`, `spellCheck={false}` defaults). It clears the error on change.
- `Submit` takes `variant` from the caller (the page decides the ink), is `type="submit"`, disabled while the value is blank, and shows `pending`/`pendingLabel`.
- Expose `onSuccess?` on the root for the GitHub form, which does more on success today; read that form first and keep what it does.
- No new tokens, no new colors, no `transition-all`.

Move the three forms onto it, one commit each: Fathom/Granola, then Circleback's secret form, then GitHub's login form. Text, labels and order on screen must not change.

**Verify** after each: `pnpm typecheck` and `pnpm lint` → 0 errors. Then run the app (`pnpm dev`), open `/connectors?open=circleback`, `/connectors?open=fathom`, `/connectors?open=github` signed in as the dev account, and confirm each form looks and reads as before; submit an empty value (button disabled) and a bad value (the refusal shows under the field).

### Step 5: Pin the lists that stay outside the registry

Create `lib/meeting-sources.test.ts`. For every id in `MEETING_SOURCE_IDS`, assert it is in `SOURCE_ITEM_SOURCES` (`lib/schema-app.ts`), in the `meeting-notes` rhythm's `from` (`lib/rhythms.ts`), in `LIVE` (`lib/connectors.ts`) and in `SOURCES` (`lib/sources.ts`); and that every `api-key` source has `key` set. Name the test so its failure tells the next person what to add where.

**Verify**: `pnpm vitest run lib/meeting-sources.test.ts` → pass; temporarily add `"otter"` to `MEETING_SOURCE_IDS` and confirm the test fails naming the missing places; revert.

## Test plan

- `lib/meeting-sources.test.ts` as in Step 5.
- Existing `lib/fathom.test.ts`, `lib/granola.test.ts`, `lib/connectors.test.ts`, `lib/meetings.test.ts` pass unchanged.
- Behavior: plans/032's script and `verify-circleback.ts` pass before and after.

## Done criteria

- [ ] `pnpm typecheck` 0, `pnpm lint` 0 errors, `pnpm test` all pass
- [ ] `grep -rn 'source === "fathom"\|getKeySourceSetup\|const VENDOR\|KEY_HELP' app lib components` → no matches
- [ ] `grep -c "<form" components/connectors/connector-verbs.tsx` is 3 lower than before Step 4
- [ ] plans/032 script and `verify-circleback.ts` print only PASS
- [ ] No copy changed: `git diff` on `connector-verbs.tsx` shows no changed user-facing string

## STOP conditions

- A form's behavior differs in a way `PasteForm` cannot express without a prop that only one caller uses (beyond `onSuccess`): leave that form as it is and report.
- Moving the bindings forces a server import into `lib/meeting-sources.ts` (the client would bundle `better-auth/crypto` or `db`).
- Any verify script fails after a step that passed before it.

## Maintenance notes

- Adding a note taker after this: one registry entry, one `KEY_SOURCE_API` entry if it connects by key, a `lib/<vendor>.ts` client and mapper, a route, and the four lists the Step 5 test names. The test is the checklist.
- plans/025 designs the same kind of registry for *channels*. Keep the two separate: a channel publishes and has OAuth; a meeting source reads and has a webhook. Do not merge them into one abstraction.

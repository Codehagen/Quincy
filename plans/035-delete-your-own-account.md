# Plan 035: Delete your own account, from Settings, with nothing left behind

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 348c5c3..HEAD -- lib/auth.ts lib/schema.ts lib/schema-app.ts lib/channels.ts lib/editor/storage-r2.ts components/settings app/(app)/settings`
> On any change, compare the claims below with the live code; a mismatch is a STOP.

## Status

- **Priority**: P2 (asked for by the owner on 2026-11-17, "for later")
- **Effort**: M
- **Risk**: HIGH — it deletes a real person's data in the one production
  database (AGENTS.local.md: there is no staging). Every step is tested on a
  `@quincy.test` account only.
- **Depends on**: the settings redesign, done: Desk, picked 2026-11-17
  (docs/design/decisions.md, "Settings, decided"; built in
  `components/settings/`; the lab folder is deleted). The control lands in
  the Account pane, where a disabled "Delete the account" hold already sits
  (`components/settings/settings-pane.tsx`); build the server side first, it
  does not depend on the layout.
- **Category**: feature
- **Planned at**: commit `348c5c3`, 2026-11-17

## Why this matters

/settings today ends with "If you want out": Quincy cannot delete an account
on its own, write to us, it is done by hand, usually the same day — the
brain, every conversation, idea and draft, the channel connections and their
tokens, anything waiting in the schedule; an active subscription is cancelled
at the same time; nothing is kept.

That paragraph is a promise made by a person reading email. Once strangers
sign up it does not scale, and "write to us" is a door a person should not
have to knock on to leave. The promise stays word for word; the work moves
into code.

## What the promise covers (inventory, from the code at 348c5c3)

Rows. `lib/schema.ts` and `lib/schema-app.ts` reference `user.id` 21 times and
every reference is `onDelete: "cascade"` (checked: none without it). Deleting
the `user` row therefore removes, in the database: sessions, accounts,
verification rows, `subscription` rows, OAuth clients/consents/tokens (MCP
agents), `conversation` + `message`, `brain_page` / `brain_event` /
`brain_page_version`, `usage_event`, `draft` / `draft_version`, `slot`,
`scheduled_post`, `channel_connection`, `source_item`, `post_metric`,
`source_connection`, `riff` / `riff_angle`, `rhythm_subscription` /
`rhythm_run`, `video_project` / `video_asset`.

Not covered by the cascade — each needs explicit work **before** the row goes:

| Thing | Where | What delete must do |
| --- | --- | --- |
| Stripe subscription | `subscription.stripe_subscription_id`, Stripe | Cancel **immediately** (not at period end) via `stripeClient.subscriptions.cancel`. Managed Payments subscriptions accept API changes (verified for cancel/restore on 2026-11-17). No refund unless the owner decides otherwise — the pricing page says none. |
| Stripe customer | `user.stripe_customer_id` | Leave the customer (invoices are accounting records Stripe keeps); detach the email by updating it to a tombstone? Decide — see open questions. |
| X / LinkedIn tokens | `channel_connection` | Revoke at the provider where it offers revocation (X: OAuth2 token revoke; LinkedIn: none for member tokens — record that), then let the cascade drop the row. |
| Scheduled posts | `scheduled_post` | A `queued`/`sending` row must not publish after deletion: the cascade removes it, but a publish run already in flight holds it in memory — check `lib/publish-run.ts` re-reads before sending. |
| GitHub App installation | `source_connection` (github) | Uninstall is the user's, on GitHub; tell them in the confirmation, do not try. |
| Circleback / Fathom / Granola | `source_connection` | Webhook secrets die with the row; tell the user to remove the webhook in the vendor if they want the calls to stop arriving (they will 404). |
| Video files | `video_asset` keys in R2 | `deleteObject` from `lib/editor/storage-r2.ts` for every key before the row goes. |
| Waitlist row | `waitlist` (by email, no FK) | Delete by normalised email. |
| Mail | Resend | Nothing stored on our side. |

## The flow

Use Better Auth's own `user.deleteUser` (`node_modules/better-auth/dist/api/routes/update-user.mjs`), not a hand-rolled route:

1. `user: { deleteUser: { enabled: true, sendDeleteAccountVerification, beforeDelete, afterDelete } }` in `lib/auth.ts`.
2. **Confirmation by email**, via `sendDeleteAccountVerification` and a new
   template `emails/delete-account.tsx` (kit look, `Action` + `PasteLink`
   from `emails/shell.tsx`), sent through `deliver` with key
   `mailKey("delete-account", url)`. The link expires (Better Auth default
   24h; set 1h). Email confirmation instead of a password prompt because
   Google-only accounts have no password.
3. In Settings → Account: a `HoldButton` "Delete my account" (AGENTS.md:
   destructive is a hold, 1200ms). Holding sends the mail; the row then reads
   "Check your inbox to finish. The link works for an hour." Nothing is deleted
   until the link is opened.
4. `beforeDelete(user)` runs the table above in order: cancel Stripe, revoke
   tokens, delete R2 objects, delete the waitlist row. Any failure throws, and
   the user row is **not** deleted — a half-deleted account is worse than a
   retry. Log each step.
5. `afterDelete` signs the browser out (Better Auth does) and the callback
   lands on `/` with a one-line notice ("Your account and everything in it is
   gone.").
6. Rate: the send is already limited by Better Auth's rate limiter; add a
   `customRules` entry for `/delete-user` (3 per 60s) and confirm the key is
   the real route path (AGENTS.md: an unmatched key is silently ignored).

## Steps

1. Write `lib/account-delete.ts` with `deleteAccountData(userId)` doing the
   table above, each part its own exported function so it can be tested with
   the Stripe and R2 clients mocked. Unit tests in `lib/account-delete.test.ts`.
2. Wire `deleteUser` in `lib/auth.ts` with `beforeDelete` → `deleteAccountData`.
3. Template + sender (`lib/auth-email.ts`), checked by `scripts/verify-mail.ts`.
4. The Settings control (in the picked redesign's Account section), copy in
   the voice of the current paragraph, which stays as the explanation.
5. `scripts/verify-account-delete.ts`, guarded on `@quincy.test` like every
   `verify-*` script: create the dev account's data (seed scripts exist),
   request deletion, open the link, assert every table count for that user
   is 0, R2 keys gone, Stripe subscription `canceled`.
6. Update `/privacy` (it describes deletion by email today) and the Settings
   paragraph.

## Verification

- `pnpm typecheck`, `pnpm test`, `pnpm lint` green.
- `npx tsx --env-file=.env.local scripts/verify-account-delete.ts` passes on
  `dev@quincy.test` (ask the owner before running — it spends nothing, but it
  writes to the production database).
- Manually: a Google-only test account can delete itself (no password asked).

## STOP conditions

- Any `user.id` reference without `onDelete: "cascade"` appears (new table):
  add it to the inventory first.
- Better Auth's `deleteUser` signature differs from the file referenced above.
- `beforeDelete` cannot stop the deletion on failure (the user row is deleted
  even when a step throws).
- The verify script would touch an address outside `@quincy.test`.

## Open questions for the owner

1. Refund the unused part of a paid period on deletion, or not (pricing says
   not on cancel; deletion may deserve different treatment)?
2. Keep the Stripe customer and its invoices (Stripe needs them for tax
   records under Managed Payments), or also delete the customer?
3. Grace period: delete at once on the link, or mark for deletion and purge
   after 7 days with an undo? The current promise says "usually the same day".

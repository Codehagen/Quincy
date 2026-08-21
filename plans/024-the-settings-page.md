# Plan 024: The settings page

> Written from a prototype run at `/prototypes/settings`, three directions
> compared live at full size against worst-case content. This file is the
> decision and what lost, not instructions for an executor.

## Status

- **Priority**: P2 — not a beta blocker on its own, but it is where the one
  unreachable setting in the product lives
- **Effort**: M
- **Risk**: LOW for what shipped. The one destructive control on the page is
  deliberately not wired; see "What this page does not do".
- **Executed at**: 2026-08-11

---

## The decision: Briefing, in third person

Quincy states what it knows about the account, and the facts are the controls.
Pressing the value that is wrong opens the field that fixes it.

- Direction: prose statements, not a form. One editor open at a time, opening
  underneath the sentence it belongs to rather than replacing it.
- Voice: **third person** — "Quincy draws your day in Europe/Oslo", never "I
  draw your day". Argued below; this is the part of the prototype that changed.
- Type: the role scale (`text-body`, `text-eyebrow`), not `.typeset`. This is
  app chrome, not rendered markdown.
- Motion: none on arrival. The editor drawer fades and rises 200ms ease-out
  with `motion-reduce:animate-none`, and that is the only movement on the page.

### Why this direction rather than a form

The page's job is not "change your settings", it is **correct what Quincy
believes about you**. Your name and your time zone are inputs to the drafting,
not profile decoration. Stated as claims, correcting one is obvious. Laid out
as a form, they are inert fields somebody fills once — which is exactly how the
time zone came to be unfixable in the first place.

The frequency argument seconds it: a settings page is opened perhaps three
times in an account's life. Personality is cheap where frequency is low, and
expensive where it is high. This is the cheap end.

### What lost

| Direction | Axis | Why it lost |
| --- | --- | --- |
| **Desk** | A card per concern, form plus Save, in the shape `/settings/billing` already uses | Correct and completely inert. Four card headers to say what one page title says once, and 1600px tall. It is the version to fall back to the day this page holds twelve settings instead of five |
| **Ledger** | Dense hairline rows, values in the open, edit in place | The strongest loser and the closest call. It fits one screen with every value visible and no scroll, which Briefing does not. It lost because a list of label-value pairs describes a profile, and this page is not one — but the day scanning beats reading here, this is the answer |

### The voice, which is the one thing the prototype got wrong

The prototype said "I". The app has two voices and they are split by surface:

- **Inside a transcript** Quincy speaks as "I" — `lib/onboarding.ts`: "right
  now I know nothing about you", "I will turn it into the first draft".
- **On every page** Quincy is third person — `components/riffs/instrument.tsx`,
  `components/welcome/wiring.tsx`, `app/(app)/channels/page.tsx`: "Quincy reads
  through the false starts".

A settings page is not a conversation, so "I" would have been a third voice
belonging to one page. Third person keeps the whole idea and costs one word per
sentence. **If first person is ever wanted here, it is a product-wide rule
change, not a page-level one.**

## The bound that keeps it from ageing

Briefing has no label column, so finding "time zone" means reading rather than
jumping a column. At five statements that is fine. At ten it is not.

**This page holds only facts that change what Quincy does** — the name it
writes with, the clock it schedules against, how you sign in, where you are
signed in, and the way out. Billing, credits and channel strategy have their
own pages and stay there. Adding a sixth statement is fine; adding a section is
the signal to revisit Ledger.

## What shipped

| Piece | Where |
| --- | --- |
| The page | `app/(app)/settings/page.tsx` |
| The surface | `components/settings/settings-briefing.tsx` |
| Mutations | `app/(app)/settings/actions.ts` |
| Zone list and labels | `lib/zones.ts` |
| Browser names from a user agent | `lib/user-agent.ts` |

Six things inside it worth not undoing:

1. **The time zone is now editable, and that is the reason this page exists.**
   `user.timezone` was written once from the browser at signup
   (`components/auth/timezone-sync.tsx`) and could never be corrected. Every
   slot, every rhythm and every date in the product is drawn against it, so a
   person who moved, or whose browser guessed wrong, had their whole schedule
   an hour out with no control anywhere in the app.

2. **The zone list is curated, not `Intl.supportedValuesOf("timeZone")`.** The
   full set is over 400 entries, which wants a searchable combobox rather than
   a select. The account's own zone is prepended when it is not in the list, so
   somebody outside it never sees their setting render as empty — a select
   whose value is not among its options reads as "Quincy does not know where I
   am".

3. **Changing the password revokes other sessions.** `revokeOtherSessions: true`
   on the call. Somebody changing a password usually believes somebody else has
   it; leaving the other sessions alive answers the wrong question.

4. **The session list is one row per browser, not one per session.** This was
   built the obvious way first and then changed after opening it against the
   real table, which is the only reason the problem was visible.

   Sessions accumulate: every sign-in writes a row and nothing removes it until
   it expires 30 days later. `christer.hagen@gmail.com` holds **ten** live
   sessions — nine Chrome on the same laptop, one iPhone. Listed per session,
   that is nine rows reading "Chrome on macOS" whose only distinguishing mark is
   a date, most of them the same date, each with its own "Sign out". The control
   promises a choice the reader has no way to aim.

   Grouped by browser, the list answers the two questions somebody actually came
   with — which browsers hold a key, and is one of them not mine — and the
   phone, the row that *is* distinguishable, is still one press away. The row
   for this browser is never folded in; it is the one the reader has to find
   before the others mean anything.

   The dev account made the shape unmissable: 119 live sessions, 119 rows, three
   browsers.

5. **Revoking a group is one endpoint call and then one statement.** The obvious
   loop over `auth.api.revokeSession` was measured at **34 seconds** for a group
   of 39, button disabled throughout — the endpoint carries origin checks,
   session resolution and freshness middleware, about 900ms each against Neon.
   Nobody waits that out.

   The first token still goes through the endpoint, so `freshSessionMiddleware`
   runs and a stolen day-old session still cannot lock the owner out. The rest
   are deleted in one statement, which is what better-auth does with them
   anyway: with no `secondaryStorage` configured, `internalAdapter.deleteSession`
   is a row delete, and better-auth's own `revokeOtherSessions` maps the adapter
   over the list rather than going through the endpoint. Measured after: **78
   sessions in 1.9 seconds**, and roughly flat in the size of the group.

6. **The displayed fields are read from the `user` row, not from `session.user`.**
   The page was one save behind, and only sometimes, which is the worst way for
   a bug to behave.

   `lib/auth.ts` enables `cookieCache` for five minutes: the session — name,
   email and timezone included — is read from the signed cookie without touching
   the database. `auth.api.updateUser` does refresh that cookie, but the
   refreshed cookie only reaches the *next* request, while the `revalidatePath`
   re-render happens inside the same response and still reads the old one.

   Measured, renaming three times from one page load: saving Alpha showed Dev,
   saving Beta showed Alpha, saving Gamma showed Beta. A reload always corrected
   it, and a first save after a cold load looked fine — so it survives casual
   testing.

   The row is where the write already landed, so the row is what the page reads.
   The session stays the authority on *who* is asking; it is no longer the
   authority on what to display. Worth knowing that the module comment in
   `actions.ts` — going through `auth.api` rather than writing the table by hand
   — is still right about *writes*, and was never a claim about this read.

## What this page does not do, on purpose

- **Delete the account.** The control is not built, and no dead button stands
  in for it. `deleteUser` needs enabling in `lib/auth.ts`, a cascade across the
  app tables, and a Stripe cancel in the same transaction — none of which is a
  design decision. The page says so and gives an address. `/privacy` already
  promises deletion on request, so this is honest rather than missing.
- **Change the email address.** `changeEmail` is not enabled, and turning it on
  needs its own verification flow. The address is shown, verified, read-only,
  with the same address to write to.
- **Hold the theme.** It lives in the user menu and stays there — see the
  argument in `components/user-menu.tsx`. It is a control, not a destination,
  and only a menu can hold System as a third state. A copy here would be a
  second source of truth for one toggle.

## Follow-ups

| # | What | Why |
| --- | --- | --- |
| 1 | Wire account deletion | `/privacy` promises it and a beta user will ask. Needs the cascade and the Stripe cancel, not UI |
| 2 | Export my data | Same paragraph in `/privacy`, same answer today: write to us |
| 3 | Enable `changeEmail` | The one setting a person can want and not have. A typo'd address today means an account that can never be verified |
| 4 | Prune expired sessions | Nothing deletes a `session` row when it expires. The page filters them out of the read, so this is housekeeping rather than a bug — but the table only grows, and every sign-in adds to it |
| 5 | Give a session a name you chose | Grouping makes the list honest, not precise. Two identical laptops are still one row. Better Auth has no field for it, so this is a column and a rename control, not a setting |

# Plan 023: The waitlist front door

> Written after execution, like 018, 019 and 020. The work is done and on this
> branch; this file is the decision and the argument, not instructions for an
> executor.

## Status

- **Priority**: P1 — nothing else can be sold until strangers can be collected
- **Effort**: L
- **Risk**: MEDIUM. It closes signup, which is the one change here that can lock
  a real person out. The gate is in `lib/auth.ts` and the exemption that keeps
  every `verify-*.ts` script working is argued below.
- **Category**: feature + design
- **Executed at**: 2026-08-11, on top of `1eb42e6`

---

## The decision, from `/prototypes/waitlist` (deleted)

Three directions were built behind a live picker and judged at full size with
real content. What shipped is **Ledger**.

- **Direction**: the build log is the pitch. A short hero, the capture field
  immediately under it, then dated entries of what actually shipped.
- **The capture is one field.** Email only. No name, no "what do you make" —
  every extra field is a conversion cost paid before there is anything to
  convert to.
- **Confetti on submit: kept.** Fires from the button rather than the centre of
  the screen, ~2s, `disableForReducedMotion`. Argued below.
- **No login link anywhere on the marketing surface.** The route is untouched.

### What lost, and why it is worth writing down

| Direction | Axis | Why it lost |
| --- | --- | --- |
| **Claim** | The existing page, with the two buttons replaced by one field | It is four claims a stranger cannot check. It was the baseline and it stayed the baseline. Bring it back the day the log goes quiet |
| **Proof** | One real merged PR walked through Quincy: raw material → angle → two channel drafts | The strongest page of the three and the most expensive. It is a recording, and it says so on its face — making it live means a model call on an unauthenticated page, which AGENTS.md would require to carry both a ceiling and a cooldown, and which pays a bill for every crawler that finds it. Revisit when there is a reason to spend there |
| **Ledger quiet** | Ledger with the confetti off | A controlled pair, not a fourth direction, built to settle one question by feel rather than by argument. It lost |

### Three decisions inside Ledger that are easy to undo by accident

1. **No queue position and no signup count.** `docs/vision.md` argues a follower
   number is a vanity number with a story attached, and "1,247 people ahead of
   you" is the same number in a different hat. The only count on the page is of
   work done. If someone later asks for social proof, this is the paragraph to
   re-read first.
2. **The count on the page is derived, never written.** An earlier draft opened
   the closing section with "That is three days", a number that had to agree
   with `DAYS`, with how many files exist, and with how many of those have
   entries. Three places to drift and a page that lies quietly when one moves.
3. **The brass in the confetti is a deliberate exception to the brass rule.**
   AGENTS.md says brass means live and is never a surface you press. A burst is
   not a surface either, it fires once per person ever, and sand-600 in the mix
   stops it reading as a brand splash. It is still the largest brass object the
   site draws. If brass ever has to mean only live, this is the first thing to
   delete — `BURST_COLORS` in `components/waitlist/join-form.tsx`.

---

## What was built

| Piece | Where |
| --- | --- |
| `waitlist` table | `lib/schema-app.ts`, `scripts/waitlist.sql`, `scripts/apply-waitlist.ts` |
| Join, cooldown, invite lifecycle | `lib/waitlist.ts` |
| The public endpoint | `app/api/waitlist/route.ts`, plus `/api/waitlist` in `PUBLIC` in `proxy.ts` |
| The shipped log | `content/changelog/*.md`, `lib/changelog.ts`, `scripts/draft-changelog.ts` |
| The page | `app/(marketing)/page.tsx`, `components/waitlist/join-form.tsx` |
| Header and footer | `app/(marketing)/layout.tsx` |
| The gate | `databaseHooks.user.create.before` in `lib/auth.ts` |
| Signup, closed | `app/(auth)/signup/page.tsx`, `components/auth/signup-form.tsx` |
| Invites | `emails/invite.tsx`, `lib/waitlist-email.ts`, `scripts/invite.ts` |
| Checks | `scripts/verify-waitlist.ts` |

---

## The seven things most likely to be broken by a later change

### 1. The gate is in `lib/auth.ts`, not on `/signup`

`/signup` refuses to render its form without a live code. That is a courtesy —
anyone can POST straight to `/api/auth/sign-up/email` and never load the page.
The gate that counts is `databaseHooks.user.create.before`, because it is the
one choke point both password signup and Google go through. Putting it in the
`hooks.before` middleware instead would mean naming each route and would miss
the OAuth callback.

Measured: `POST /api/auth/sign-up/email` with an uninvited address answers
**403** with `code: "INVITE_REQUIRED"`.

### 2. The invite is spent in the same statement that checks it

`spendInviteFor` is one `UPDATE ... WHERE redeemed_at IS NULL`. A read followed
by a write loses the race between two signups on one link, and the prize for
losing it is two accounts on one invite.

### 3. `@quincy.test` is exempt from the gate, on purpose

`.test` is reserved by RFC 2606 and can never be registered, so nobody can
receive mail at one. A stranger who signs up as `someone@quincy.test` gets an
account they can never verify and so can never sign in to. Without the
exemption, `scripts/dev-account.ts` and every `verify-*.ts` script stop working
the day invites go on — and the guard is on the address rather than on
`NODE_ENV` for the reason stated everywhere else in this repo: there is one
database, so the environment cannot tell you anything and only the target can.

### 4. There is no Google button on an invited signup, and that is the fix

An invite binds one address. Google supplies whatever address the person is
signed in with, and when those differ the gate must reject — but it rejects by
throwing inside an OAuth callback, where the form's `onError` never runs,
because that handler only sees failures the client initiates. The person lands
wherever better-auth's error handling puts them, holding an invite that looks
spent and no sentence explaining it.

Found by an audit of this branch after it was written, not before: the password
path was tested and the OAuth path was assumed. Google is configured in
production, so the untested path was reachable.

The cost is real — an invited tester loses one-click signup. Reopening it means
wiring an error destination that can say "that Google account is not the
invited address", and testing it. `/login` keeps Google throughout: an existing
account has already passed the gate.

### 5. Joining sends no mail, and must not start

A public endpoint that emails whatever address is posted to it is a mail-bomb
primitive aimed at whoever owns that address — the same reason `sendOnSignIn`
stays unset. The page confirms on screen. The only mail this table causes is an
invite, sent deliberately by a person running `scripts/invite.ts`.

That also settles the cost question: joining writes one row and spends nothing,
so the ceiling-and-cooldown rule has no spend to bound here. The per-caller
cooldown exists to stop casual hammering, not to protect a bill.

### 6. `/api/waitlist` has to stay in `PUBLIC` in `proxy.ts`

It is not exempted by the matcher, so without the entry a stranger's POST comes
back 307 to `/login`, the fetch follows it into an HTML document, and the form
reports "could not reach the server" while the endpoint sits there working. The
same invisible failure that swallowed every Resend delivery event once already.

### 7. The changelog is files, and `/` is static

`git log` at build time was the obvious answer and is wrong twice: Vercel clones
shallow, so a build sees one commit unless somebody remembers otherwise and the
failure is a page that renders with one entry; and it hands editorial control of
a public page to commit hygiene. `lib/changelog.ts` reads the filesystem at
module scope, which under `cacheComponents` happens at build and never per
request. **Do not add `revalidate` to `/` without moving that read.**

---

## The answer this page owes and does not yet give

`scripts/invite.ts` is a dry run unless you pass `--send`, and that default is
deliberate: it is the one thing in the repo that mails a list of strangers, and
an inbox cannot be un-sent to. It has been exercised as a dry run. **It has
never sent a real invite**, because the only rows on the list have been on
`@quincy.test`. The first real run is owed, and it should be one person.

---

## Follow-ups

| # | What | Why |
| --- | --- | --- |
| ~~1~~ | ~~`/changelog` with RSS~~ | **DONE.** `/changelog` renders every day with its prose bodies, `/changelog/rss.xml` is a static feed with one item per day, both are in `PUBLIC`, and the page is in the sitemap with a real `lastModified`. Plan 009 Phase 5 is closed |
| 2 | Send one real invite | See above. Nothing has proved the mail renders in a real client |
| 3 | Decide what `/` becomes when Quincy opens | This page is honest only while the product is closed. "Being built in the open" is a claim with an end date |

## One bug this plan found while being written

`nextInLine` was `invited_at IS NULL`, which is a quiet way to lose people. An
invite that lapses unredeemed leaves that column set, so anyone who was told
they were in and then did nothing for a fortnight — most people — would never
appear in the queue again, and nobody would go looking, because from every angle
the row reads as handled.

It is now "has not redeemed **and** is not holding a live invite", ordered by
`created_at` so a lapsed invite does not cost somebody their place. Two
assertions in `verify-waitlist.ts` cover it.

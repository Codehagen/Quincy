# Plan 021: Merged pull requests become riffs

## Status

**BUILT** on `feat/shipped-work`, branched from `feat/circleback-meetings`.
Written 2026-08-09 against GitHub's webhook surface, the live
`winter-grass-66812609` tables, and the 27 merged pull requests in
`Codehagen/Quincy` — which are the only real corpus of this material that
exists.

`scripts/verify-shipped-work.ts`: 37/37 default and 41/41 `--live`, against a
dev server on the real database, teardown clean. `lib/shipped-work.test.ts`:
24/24. Owed: the app itself, which only a human with a browser can create, and
one real merge through it.

**One decision was overturned before execution and the plan text below still
argues for the version that was not built.** Read the next section first.

## Where execution departed from this plan

Decision 2 argued for a **repository webhook** and against a GitHub App, on the
grounds that an App buys the diff and multi-repo installs, that decision 1 says
the diff is not wanted, and that a solo founder has one or two repositories.

The owner overruled it, and the reason is the one this plan did not weigh:
**onboarding a stranger.** `/pricing` asks $49 from people who have never seen
this codebase, and a repository webhook makes their first act "open repository
settings, add a webhook, paste a URL and a secret, tick one event, repeat per
repository". An App makes it a button. That is a product argument the plan
answered with an engineering one.

What changed, and what did not:

- **What did not change: everything downstream of the body.** The payload, the
  gates, `source_item`, the workflow, the riff, the ceiling and decision 1's
  refusal to read the diff are all exactly as argued below. The App is a
  different door onto the same room, which is what decision 2's own closing
  paragraph predicted.
- **The token is derived, not minted.** An App has one webhook URL across every
  installation, so the per-user secret in the path is impossible. Identity
  arrives as `installation.id` in the body, and `source_connection.token` holds
  `ghi_<id>` — which is *not a secret*, unlike every other value in that column.
  `githubInstallationToken` says so at length.
- **So the signature is checked first, before anything is resolved.** The
  Circleback route resolves the token and then verifies, because there the path
  narrows the request to one user. Here the URL is public by design, so
  verifying first is what stops a stranger probing which installations exist.
- **The setup step disappeared rather than halving.** Decision 2 predicted one
  screen instead of Circleback's two, because GitHub lets the receiver choose
  the secret. With an App there is no per-user secret at all: the deployment
  owns it, and connecting is one link out and one redirect home.
- **A field survived, on organisations only.** An App installed on an org knows
  the org's name, not the user's. `shippedGate` refuses everything until the
  user says which login is theirs, because the alternative is drafting a post
  about a colleague's work under their name. On a personal installation the
  account *is* the person and nothing is asked.
- **Creating the app is an operator route, not a plan step.** GitHub has no API
  for it. `/api/connect/github/app` runs the manifest flow and 404s forever once
  `GITHUB_APP_ID` is set.

Decision 9's argument — the riff is created after the selection says yes, not
before — survived and is the reason `startShippedRiff` exists. The `--live`
verification proves it both ways: PR #23 produced a riff with two angles, and
PR #5, a four-line documentation update with a real description on it, produced
a `source_item` and no card.

Depends on 018 (`riff` states, the Workflow pattern, `generateAnglesFromSaid`)
and on 019, which is **built but unmerged** on `feat/circleback-meetings` and
whose migration is **already applied to production**. This plan builds no
connection machinery of its own — it is the second source on a rail 019 laid.
See "What 019 already built".

## Why this matters

`docs/vision.md:3` names three inputs: "a voice note on a walk, a call you
recorded, **a pull request you merged**". 018 built the first. 019 plans the
second. This is the third, and it is the last one the vision statement promises.

It is also the one the catalogue has been promising longest. `lib/rhythms.ts:177`
already carries the entry:

```
id: "shipped-work"
name: "Shipped Work"
promise: "Turns merged pull requests into something worth reading"
trigger: { kind: "event", label: "on merge" }
from: ["github"]
available: false
```

and `lib/sources.ts:117` already lists the source: "GitHub — Pull requests as
they merge". Both are claims nothing keeps.

The material is the argument, and here it is unusually strong. Measured across
all 27 merged PRs in this repository, 2026-08-03 to 2026-08-09:

| | min | median | max |
|---|---|---|---|
| PR description, characters | 413 | **3,369** | 8,095 |
| Lines added | 4 | 1,120 | 26,943 |
| Files changed | 1 | 10 | 104 |

**Zero of the 27 have a description under 200 characters.** Every merge in this
product's history left behind three thousand characters of the author explaining
why the change was right — written the same week, while the reasoning was still
loaded, and then read by nobody but a reviewer. That is the single largest pile
of unpublished original thought in the user's stack, and `docs/vision.md:39`
puts the scarce resource at exactly that: "original thought with a receipt
attached — maybe two or three genuinely new things to say in a week."

Twenty-seven in seven days, with receipts.

## The decisions

### 1. The description is the material. The diff is not

This is the decision the entire integration hangs off, and it is the one the
catalogue currently gets wrong. `lib/rhythms.ts:180` says Quincy "reads the diff
and the description". Half of that is a mistake and it should be corrected in
the same change.

Measured on real merges in this repo:

| PR | Description | Diff | Ratio |
|---|---|---|---|
| #3 | 1,806 ch | 1,701 ch | 0.9× |
| #16 | 2,878 ch | 8,384 ch | 2.9× |
| #29 | 3,891 ch | 82,767 ch | 21× |
| #21 | 5,052 ch | 257,113 ch | 51× |
| #23 | 6,275 ch | 322,074 ch | **51×** |

`MAX_TRANSCRIPT_CHARS` is 19,200. **Every one of the 27 descriptions fits inside
it with room to spare. The largest diff is sixteen times over it.** A diff
cannot reach a prompt without a summarisation pass in front of it, and that pass
would cost more than the drafting it feeds — to recover, at best, the thing the
description already says.

And the description says it better. A diff records *what changed in the files*.
The description is where a person already wrote *why*, in prose, for a human
reader. PR #23's opening line is `Voice notes become riffs. /riffs has listed
"Voice notes — what you said out loud" since…`. There is no reading of 322,074
characters of patch that produces that sentence.

**The corollary is what makes this integration cheap.** The webhook payload
carries `pull_request.body`. The diff does not arrive with it — fetching it
needs a second authenticated API call, which needs a token, which needs a GitHub
App or an OAuth app, which is the entire cost of the integration. Choosing the
description makes GitHub a **zero-credential source**, the same property that
put Circleback first in 019.

So: no diff in v1, and the reason written down at the parse site so nobody later
reads `diff_url` sitting unused in the payload as an oversight and fixes it.

Corrected `how`: "When a pull request merges, Quincy reads what you wrote about
it and turns the reasoning into a draft."

### 2. A repo webhook, and Quincy mints both halves

GitHub's webhook is **cheaper to set up than Circleback's**, and for one reason:
Circleback mints the `whsec_` signing secret, which forced 019 into a two-step
setup with a `waiting` state in between (019, decision 3). GitHub lets the
*receiver* choose the secret.

So Quincy generates the URL and the secret together and setup is one screen with
two copy buttons and one text field:

```
POST /api/webhooks/github/<token>
Secret: <generated>
Events: "Let me select individual events" → Pull requests
```

Everything 019 argued about verification carries over unchanged and is not
re-argued here:

- `X-Hub-Signature-256`, `sha256=` followed by the hex HMAC-SHA256 of the **raw
  body**. Read with `request.text()`, never `request.json()` —
  `app/api/webhooks/resend/route.ts:19`: "Any framework-level reparsing of the
  request would change the bytes and invalidate the signature."
- `crypto.timingSafeEqual`, not `===`.
- **An unsigned request is refused.** GitHub treats the secret as optional; we
  do not. Same route, line 27.

Three things are specific to GitHub:

- **`X-GitHub-Event` must be `pull_request`.** Anything else is answered 200 and
  dropped — a user who ticks "Send me everything" should not get an error page.
- **`ping` is a real event and it is the setup confirmation.** GitHub POSTs one
  the moment the hook is created. Answer 200, write nothing, and flip the
  connection out of `waiting`. This is the confirmation Circleback has no
  equivalent of and it is worth using: it proves the URL and the secret are both
  right before any meeting-shaped guesswork.
- **`X-GitHub-Delivery` is not the dedup key.** It is a per-delivery GUID, so a
  manual redelivery — a documented feature, and the analogue of Circleback's
  re-apply — carries a *new* one for the same pull request. Dedup is structural,
  on `source_item`. See decision 6.

**Why not a GitHub App.** It buys two things: the diff, and install-once-for-all-
repos. Decision 1 says the diff is not wanted, and a solo founder has one or two
repos worth posting about. Against that it costs an app registration, an
installation callback, installation tokens that expire hourly and have to be
minted per call, `installation` and `installation_repositories` events to keep
in sync, and org-owner approval for anything not personal. Revisit when a real
user has five repos or asks for the diff.

**Why not an OAuth app.** Everything above, plus it holds a token that can read
every private repository the user can. That is the worst credential in the
product for the least gain in it.

### 3. Only your own pull requests

This is 019's speaker match, and here it is **exact rather than fuzzy**. A repo
webhook fires for every PR in the repo, including teammates'. The filter is
`pull_request.user.login === connection.login` — one string comparison against
a value GitHub controls.

Because it is exact, 019's hard case does not arise. There is no
"could-not-tell-which-voice-was-yours" failure and therefore no failed riff for
it. A teammate's merge is answered 200 and leaves nothing. That is not a
degraded outcome; it is the correct one.

The login is the **one field the user has to type** during setup. A repo webhook
carries no identity of its own, so it cannot be discovered — and it must not be
inferred from the first payload that arrives, for the same reason 019 refuses
trust-on-first-use.

**`user.login`, not `merged_by.login`.** `docs/vision.md` says "a pull request
you merged", but the material is what you *wrote*. On a team, `merged_by` is a
reviewer, and drafting a post in your voice about somebody else's work is the
exact failure `schema-app.ts:660` exists to prevent: "the distinction that
matters is not where it came from, it is whose words these are."

### 4. Merged, not closed, and into the branch that means shipped

`action: "closed"` fires for both a merge and an abandonment. Three gates, all
free, all from the payload:

- `pull_request.merged === true`. A closed-unmerged PR is a decision *not* to
  ship, and there is a good post in that — it is not this rhythm.
- `pull_request.base.ref === repository.default_branch`. A stacked PR merging
  into its parent feature branch has not shipped anything. This repo has 27
  merges into `main` and the filter costs one comparison.
- `pull_request.draft === false`, which a merged PR always is. Kept as an
  assertion rather than an assumption.

### 5. Selection is a yes/no, and "no" is the common answer

`bookmarksToPosts` in `lib/rhythm-handlers.ts:81` is read, select, draft, and its
comment names the middle step as "the one that makes this a product rather than
a loop". The same argument, differently shaped.

Of the 27 merged PRs, at least two are bookkeeping: #5 (`docs: 004 is done, and
the backlog is empty`, 4 lines added, 1 file) and #7. Several more are one-line
fixes with a long description that is interesting to a reviewer and to nobody
else. A rhythm that leaves a card per merge leaves **twenty-seven cards in a
week**, and `DRAFTS_PER_RUN`'s comment already learned where that ends: "a
drafting surface with a backlog on it stops being read at all."

But the shape differs from both prior selection steps, and getting this wrong is
the likeliest way to ship something annoying:

- `bookmarksToPosts` picks the best 3 of 40 candidates in one run.
- 019 picks the one quotable passage out of one long transcript.
- **This judges one complete item, on its own, with nothing to compare it to.**

A model asked "is there a post in this?" about a single item will say yes,
because saying yes is what it is for. `CHANNEL_ANGLE_RULES` in `lib/adapt.ts`
already fought this exact fight and the fix is the same one: name refusal as a
correct answer, say it twice, and let the schema express it. The prompt has to
be told that most merges are not posts and that returning nothing is the
expected outcome, not a failure.

**Rejected: batch by week.** "Wait until Friday, pick the best three" would give
the model something to compare against and would produce a better post — a week
of shipping is a story, one merge is a changelog entry. It is rejected for v1
because it contradicts the catalogue entry (`{ kind: "event", label: "on
merge" }`), and because Capture's own family note says these rhythms "catch them
before they are gone". It is the strongest follow-up in this plan and it is a
**second rhythm**, "Shipped This Week", not a rewrite of this one.

### 6. `source_item`, and the dedup is free

Add `"github"` to `SOURCE_ITEM_SOURCES`. The existing unique index does the
whole job (019, decision 5):

```
uniqueIndex("source_item_user_source_external_key")
  .on(table.userId, table.source, table.externalId)
```

- `externalId` — `pull_request.node_id`. **Not `owner/repo#number`**: a repo
  rename would change that string and every past PR would re-arrive as new.
- `url` — `html_url`.
- `postedAt` — `merged_at`.
- `body` — `title` then a blank line then `body`. The title is a real part of
  the material in this corpus; "The draft that said it was written and was not"
  is a hook already.
- `meta` — `full_name`, `number`, `additions`, `deletions`, `changed_files`,
  `commits`, `labels`, `base.ref`, `private`. Numbers the platform reported,
  never parsed for logic, exactly as the column comment requires.

`compileVoice` must not read it. Its `sources` default is `["x", "x-archive"]`,
so this holds without a change — but state it, because the temptation is
**stronger here than in 019**. A meeting transcript is speech and the argument
against folding it into voice is easy. A PR description is *writing*, by the
user, unprompted, at length. It is still the wrong instrument: it is written for
an engineer reading a diff, and it is full of file paths, line references and
the second person addressed to a reviewer. Folding it into `voice/x` would
degrade the page everything downstream reads.

### 7. A merged PR is a receipt, and that changes nothing yet

Worth stating because it is the one place GitHub differs from Circleback in the
user's favour, and because the temptation it creates is expensive.

019, decision 2 rules a transcript out of `proof`: "a sentence in a transcript is
something you said in a room, not something you published". A merged PR is not
that. It is dated, immutable, addressable and checkable — `docs/brain.md:162`'s
provenance table would happily take it.

**And v1 writes nothing to the brain anyway.** Two reasons. Private repos: this
one is `private: true`, and a proof point whose receipt nobody can open is not
a receipt. And the front door already exists — the brain compiles stories from
**published posts**, so a PR post that actually goes out is folded in through the
path `docs/brain.md` already describes, having been approved by a human on the
way. Adding a second door here would be adding a way for unreviewed material to
reach the most dangerous field in the system, in exchange for nothing.

### 8. Ceiling and cooldown, when nobody pressed a button

`AGENTS.md` requires both, and is explicit that a claim is not a cooldown. This
is 019's hard case again and slightly worse: a merge queue can land eight PRs in
ten minutes, and unlike a calendar, nothing about it is paced by a human day.

- **Per pull request:** cap the description at `MAX_TRANSCRIPT_CHARS` (19,200),
  and **truncate from the tail** — the opposite of a voice note. `lib/riffs.ts:747`
  head-truncates because "a rambling note circles and lands its point at the
  end". Prose written to be skimmed does the reverse: all 27 descriptions in the
  corpus open with the argument and close with verification notes and known
  limits. Every measured body fits, so this never bites in practice; it is the
  backstop for a generated or templated description.
- **Per user per day:** at most **5** PR riffs in 24 hours, counted from
  `source_item`. Over the ceiling, write the `source_item`, skip the riff,
  answer 200 — the material is there when they come back. The number is a guess
  and should be labelled one in the code; the honest version comes from a month
  of `source_item` rows, the same way `plans/README.md` refuses to write 008
  before the usage data exists.

Meter both model calls through `usage_event` at the going rate. There is no
per-item read cost — GitHub pushes, we do not poll — so no `github:read` label
is needed, which is a small argument for the webhook over a cron that lists PRs.

### 9. The riff exists before the work does — but after the selection

018's two-phase shape, with 019's amendment and one of its own.

018 writes the row first because "somebody who recorded a thought on a walk sees
Quincy holding it". Nobody is watching a merge either, so what carries is the
rest of `workflows/run-voice-riff.ts:23`: external calls back to back, `after()`
is not durable, and a run that dies needs a row that knows it was running.
`RIFF_STUCK_AFTER_MS` and `failVoiceRiff` already exist.

The amendment: **the riff is written after the selection says yes**, not before.
019 moves the row past the speaker match for the same reason — a `working` riff
that a workflow immediately fails is a card that says nothing useful. Here it
goes one step further, because the common answer is no, and *"Quincy read your
PR and there was no post in it"* is a nag the user would receive several times a
day. A rejected PR leaves a `source_item` and nothing else. The user's signal
that the rhythm is alive is `source_connection.lastItemAt` and the `arriving`
state on `/sources`, which is what that state is for.

So the workflow is: select → if yes, insert the riff `working` → angles →
`ready` or `failed`.

`sourceId: "github"`, `sourceLabel: "Pull request"` — the shape, not the vendor
(019, decision 8), because GitLab produces the same card. Note that the demo
fixture at `lib/riffs.ts:351` uses `sourceLabel: "GitHub"`; correct it in the
same change or the first real riff will look different from the one on the demo
account.

The angle generator is **`generateAnglesFromSaid`, unchanged** — same call 019
makes. Its rules are written for speech ("expect false starts, repetition,
filler") and are wrong for prose, but its *contract* is right: the user's own
material, their specifics, fewer angles when fewer are real. A third generator
is not warranted; if the speech-specific rules prove actively harmful on a PR
body, that is a `mode` parameter on the existing prompt, not a new file. Judge
it on the live run, not before.

### 10. Entitlement failures answer 200

019, decision 9, and the reasoning transfers with one correction in our favour:
GitHub does **not** retry a failed delivery automatically — it records it and
offers manual redelivery. So a non-2xx does not become an infinite loop. It
becomes a red cross in the user's repository settings, which is a support
question about a thing that is not broken.

Unentitled, paused, or over the daily ceiling: write the `source_item`, skip the
riff, answer 200. Reserve non-2xx for what it means — **404 for an unknown
token** (not 401, the same reasoning as `docs/brain.md:217`), 401 for a bad
signature.

## What 019 already built

Checked against `feat/circleback-meetings` on 2026-08-09. Plan 019's index entry
still reads "TODO — nothing built"; that is stale, and the branch is unmerged, so
this is easy to miss and expensive to miss.

**The rail exists and this plan reuses it whole:**

- **`source_connection`** — in `lib/schema-app.ts` on that branch, and the table
  is **already in production Neon** with 0 rows (`scripts/apply-source-connections.ts`
  was run; per `AGENTS.md`, a migration run locally *is* the production
  migration). Columns match 019's spec: `token`, `signing_secret`, `state`
  defaulting to `waiting`, `last_item_at`, `last_error`.
- **`lib/source-connections.ts`** — `connectSource`, `setSigningSecret`,
  `resolveByToken`, `verifySignature`, `listSourceConnections`,
  `disconnectSource`, plus `SafeSourceConnection` built by naming what may
  leave. `verifySignature` takes the raw body and the header and answers a
  boolean; **it never hands a caller the secret**, which is the property that
  makes a `===` comparison impossible to write by accident downstream.
- **`app/api/webhooks/circleback/[token]/route.ts`** — 404 tokens, 401
  signatures, `request.text()`, the entitlement-answers-200 rule. The GitHub
  route is this route with different gates.
- **`/sources` connect flow** — `components/sources/circleback-source-row.tsx`,
  `app/(app)/sources/actions.ts`, and `getSourceConnections` reading the table
  and rendering all four states. The GitHub row is a second instance of this.

**Two amendments to what this plan assumed:**

1. **The token is 32 bytes of `randomBytes`, base64url.** 019 landed on 256
   bits with the argument that the URL *is* the authentication. Use the same
   generator; do not mint a GitHub-specific one.
2. **019 resolved the event-rhythm switch, and resolved it better than the
   version drafted here.** The problem is real — `isRunnable`
   (`lib/rhythms.ts:635`) requires `trigger.kind === "clock"`, and
   `rhythm_subscription.nextRunAt` is `notNull` so any event subscription looks
   permanently due to `dueSubscriptions`. 019's answer is not to widen either
   one. It leaves `meeting-notes` at `available: false` and **out of
   `RHYTHM_HANDLERS`**, on the argument that an event rhythm has no switch to
   offer: there is no hour to choose and nothing for the dispatcher to fire, so
   its on/off already lives on `/sources` as connect and disconnect, and a
   switch on `/rhythm` would be a second control over the same fact.

   That is right, and it replaces decision 11 of the draft of this plan.
   `shipped-work` stays `available: false`, gets no handler, and the webhook
   checks `source_connection.state` rather than a subscription row. What it does
   get is the corrected `how` from decision 1.

**One thing GitHub needs that Circleback did not:** the account login from
decision 3. `source_connection` has no column for it and should not grow one for
a single source — add a `meta` jsonb, which is the shape `source_item.meta`
already uses for exactly this, and which the next source will need too.

## What ships

Branched from `feat/circleback-meetings`, not from `main`. Items 1 and 2 exist
there; everything else is new.

1. **`source_connection.meta`** — one additive jsonb column plus a migration in
   the repo's manual `tsx --env-file` convention, for the GitHub login. Check
   `SafeSourceConnection` when adding it: `plans/README.md` records plan 012's
   scope defect, and an `Omit`-based safe type makes every new column required
   in the object it builds.
2. **`lib/source-connections.ts`** — no new functions. `setSigningSecret`
   validates a `whsec_` prefix, which is Circleback-specific, so it needs a
   per-source rule or a sibling that takes a secret Quincy generated.
3. **`app/api/webhooks/github/[token]/route.ts`** — resolve, verify, gate on
   event type, `ping`, merged, base branch, author login; insert `source_item`;
   gate on entitlement, subscription and daily ceiling; `start()` the workflow;
   202. **No model call in the request.**
4. **`workflows/run-shipped-riff.ts`** — select, then (if yes) create the riff
   and generate angles. Mirrors `run-voice-riff.ts`.
5. **`lib/shipped-work.ts`** — the payload type, the gates, and
   `selectShippedMoment` (the new prompt, decision 5). The angle generator is
   `generateAnglesFromSaid`, unchanged.
6. **`lib/sources.ts`** — nothing. `getSourceConnections` already reads the
   table for any source, and the `github` entry's `gives` stays as it is:
   "Pull requests as they merge" is exactly what this delivers.
7. **`/sources`** — a GitHub row modelled on `circleback-source-row.tsx`:
   reveal URL and generated secret with copy buttons, take the GitHub login,
   disconnect behind `<HoldToConfirm>`. One screen, not two, per decision 2.
8. **`lib/rhythms.ts`** — the corrected `how` from decision 1, and `github`
   keeps its node. `shipped-work` stays `available: false` and out of
   `RHYTHM_HANDLERS`, per 019's resolution above.

## Verification

`scripts/verify-shipped-work.ts`, guarded on `@quincy.test` per `AGENTS.md:139`
— the guard is on the target, never on `NODE_ENV`, because there is one
database.

| Request | Expected |
|---|---|
| valid signature, unknown token | `404`, no rows |
| valid token, **tampered body**, original signature | `401`, no rows |
| valid token, **no signature header** | `401`, no rows |
| `X-GitHub-Event: ping` | `200`, no rows, connection leaves `waiting` |
| `closed` with `merged: false` | `200`, no rows |
| merged, but `user.login` is a teammate | `200`, no rows |
| merged into a feature branch, not the default | `200`, no rows |
| merged, own login, selection says no | `200`, one `source_item`, **no riff** |
| merged, own login, selection says yes | `202`, one `source_item`, one `riff` |
| the same body replayed with a new `X-GitHub-Delivery` | `200`, still one of each |

The last row is what distinguishes idempotency from an endpoint that happens to
work once, and it is the row most likely to be got wrong here — the obvious
implementation dedups on the delivery GUID, which changes on redelivery.

Then one live run: a real webhook on `Codehagen/Quincy`, a real merge, and a
human reading the card. The question is not whether a row appeared. **It is
whether the angle is one you would actually post** — and, given decision 5, also
whether the four merges that week that were not posts correctly left nothing
behind.

## STOP conditions

- **The selection prompt cannot say no.** If a `docs:` commit with a 400-character
  description still produces a card, the daily ceiling in decision 8 is treating
  a symptom. Fix the prompt. This is the same STOP condition 019 sets and it is
  more likely to fire here, because the input is one item rather than a field of
  candidates.
- **The description turns out not to be the material on a second corpus.** This
  plan's central measurement is 27 PRs by one author who writes unusually well.
  If a second real user's PRs are `Bump deps` and `fix typo`, decision 1 is
  right about the diff being wrong and wrong about the body being enough — and
  the answer is not to reach for the diff, it is that this rhythm is not for
  them. Bring the numbers back rather than adding a GitHub App to rescue it.
- **Anything here needs a change to `compileVoice`'s `sources` default.** That
  default is a guard (`lib/schema-app.ts:663`). Needing to touch it means
  something upstream is wrong.

## Follow-ups, deliberately not in scope

- **"Shipped This Week."** Decision 5's rejected alternative, as a second
  catalogue entry: Friday, the week's merges read together, one post about the
  through-line. It is a clock rhythm, it fits the dispatcher as it stands, and
  it is probably the better product. Ship the event one first because it is what
  the catalogue promises and because it is the one that tells us whether a
  single merge carries a post at all.
- **Releases and tags.** `release.published` is a better "we shipped" signal than
  any merge and it is a two-line addition to the same route. Deferred because
  this repo has no releases, so there is nothing to measure it against.
- **The diff, via a GitHub App.** Revisit when a real user asks for it, or when
  decision 1's measurement fails on a second corpus.
- **Commit messages.** This repo's subjects are prose ("The take you could not
  hear was going into the earpiece") and are arguably better material than the
  PR body. They arrive on the `push` event, not `pull_request`, which is a
  different route and a different rhythm — and for a squash merge, the merge
  commit already contains them.
- **GitLab, Linear, Vercel deployments.** All the same card — `sourceLabel` is
  already "Pull request" rather than "GitHub" for this reason. None of them
  before this one has a live run behind it.

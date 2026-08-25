# Plan 026: What the merge was about

## Status

**BUILT** on `feat/shipped-work-context`, branched from `main`. Written
2026-08-25 **after execution**, against the live `winter-grass-66812609` tables
audited on 2026-08-24 — the plan is the record of a change already made, in the
shape 018 and 020 use.

`pnpm tsc --noEmit` clean. `pnpm vitest run`: 1053/1053 across 59 files, of which
`lib/shipped-work.test.ts` is 53.

**The migration is applied.** `scripts/riff-context.sql` adds
`riff.source_item_id` and `riff.context`; `scripts/apply-riff-context.ts` runs
it and then asserts the columns are there, `jsonb`, and NOT NULL. Both columns
are additive and defaulted, so the *old* code ran against the new table without
noticing — which is what made "apply before deploy" free and "apply after"
an outage on the feature.

`scripts/apply-riff-context.ts` was run against the live database on
2026-08-25, after decision 7. `riff` now holds **14 columns**, `source_item_id`
and `context` among them. Everything decision 7 adds travels through
`riff.context`, so the beats now reach the writer as well as the angle prompt:
`getOwnedAngle` selects a column that exists.

The merge and the comparison this change exists for were bought the same day —
they are under "What the live run changed". Still owed: **a merge arriving from
GitHub itself**, since the live harness signs a captured body rather than
waiting for a delivery, and **a draft written from one of the new angles**.

Depends on 021, which built the path. This changes what travels down it.

## Why this matters

021 shipped and the numbers came back. Audited against the live database on
2026-08-24:

| | count |
|---|---|
| GitHub `source_item` rows | 5 |
| riffs from them | 4 |
| angles on those riffs | 12 |
| **drafts written from any of them** | **0** |

Zero is not a small number here. The rhythm worked exactly as designed at every
step — the webhook verified, the gate passed, the selection found a passage, the
angles were written, the cards appeared — and the user drafted from none of
them. That is a feature that ran perfectly and delivered nothing, which is worse
than one that failed, because nothing in the logs says so.

What he did instead is the whole diagnosis. On the same day, about the same
merge, he opened /riffs and **pasted 294 characters by hand**:

> took the site from 83/100 to 100/100

That merge is `advantiestate#102`, stored as `si-LenWND6dodRgP2KqfGSM`, and its
generated riff is `rif-Z4nwUJOKTXtKW7ns`. The angles on it were about the
implementation: what was refactored, which pass was added, how the change was
structured. The post he wanted was about **the product outcome and the
experience of shipping it** — a score that moved, on a site somebody else uses.

Both readings are true of the same merge. Only one of them is a post.

Reading the twelve back, the failure is one shape three times over:

1. **The prompt did not know what the software is.** It was told a branch name.
   Nothing else about the world. A model that cannot name the product writes
   about the only subject it can see, which is the code.
2. **The angle prompt was told the material was speech.** `generateAnglesFromSaid`
   instructs the model to expect false starts and read through them to the
   thought underneath. A pull request description has no false starts — it was
   written, read back and merged — so what gets read through is the content.
3. **The writer, one step later, had the same blindness.** `generateDraft` saw a
   hook, a passage and a brain, and wrote around a subject it was never told.

None of that is a bug in 021. It is 021 having built a pipe and never having
been told what to pour down it.

## The decisions

### 1. Stories in full at both tool-less call sites

`renderBrain`'s default `index` mode lists each story as a title and a point and
then tells the model to "call the story tool to read one in full before citing
anything from it". **There is no story tool in this codebase.** In the chat
route that instruction is merely aspirational. In a single `generateObject` with
no tools it is a contradiction: the same prompt names the stories as the
evidence to draw on, forbids inventing anything that is not in them, and
provides no way to open them. `lib/brain.ts` already documents what that did to
`generateDraft` on 2026-08-16 — short, unspecific drafts — and both GitHub calls
were making it.

So `{ stories: "full" }` at `angleContext` in `lib/riffs.ts` and at `selectStep`
in `workflows/run-shipped-riff.ts`. Fixed at `angleContext` rather than at three
call sites, which means voice, meeting, paste and adapt angles all get it too —
they are all tool-less `generateObject` calls and all had the same defect.

The cost is input tokens, on a prompt that was already metered. It is the
cheapest of the six fixes and probably not the smallest in effect.

### 2. A shipped-work angle prompt, in two registers

`generateAnglesFromShipped` in `lib/adapt.ts`, beside `generateAngles` and
`generateAnglesFromSaid` for the reason that section header already gives: the
three are near-inversions and the dangerous mistake is running a scrap through
the wrong one. It says out loud that the material is written prose, that nothing
in it is accidental, and that there are no false starts to read through.

The new half is **two registers**, and it is aimed squarely at the hand-paste:

- **(a) what a user of the product gained** — what is now true for somebody using
  it, in their language rather than the repository's;
- **(b) what a builder who has never seen this codebase would learn** — the
  decision, what it cost, what was rejected.

A set should carry at least one of each when the material allows. Left to
itself, a model reads a pull request description the way the description reads
itself, and every one of the twelve angles was register (b) done badly. "83/100
to 100/100" is register (a), and nothing in the old prompt asked for it.

The privacy rule is restated here rather than left to the selection, because the
selection decides which blocks survive and this decides what is *said* about
them — and this prompt is the first to be handed facts the description never
disclosed.

### 3. A facts paragraph, and one sentence the model may write

`describeFacts` in `lib/shipped-work.ts` prints, above the fence: the repository,
what it is, whether it is private, `+x −y` across files and commits, labels, and
the day it merged. Every line is omitted when it would be a lie — a payload with
no numbers prints no size line, because "+0 −0 across 0 files" reads as a change
that did not happen and a model short of material will reach for it.

The private line is stated even though private is the common case. `SELECT_RULES`
was already reasoning about private repositories **without ever being told
whether this one was**, which is a rule depending on a fact nobody supplied.

The schema then gains `forUser`: one sentence on what is now true for a user of
this product that was not true before, drawn **only from the blocks**, never from
the facts and never from what the model assumes the change does. Empty is a real
answer and the common one — most merges change nothing a user can see, and a
sentence invented to fill this field is precisely the internal-engineering angle
the audit found. It is the one sentence this prompt is allowed to write; the
passage stays code-assembled from indices, as 021 decision 2 requires.

### 4. What the repository says about itself, cached for a week

`lib/github-repo.ts`. One `GET /repos/{full_name}` for `description`, `homepage`
and `topics` — the three things a stranger reads first on a repository page,
one request away, needing only `metadata: read`, which the app manifest already
holds for repository names. **Nothing here widens the grant**, and that is a
condition rather than a note: 021 decision 1's whole argument is that this
integration never reads code.

Cached on `source_connection.meta.repos[fullName]` with a 7-day TTL, because a
description is edited a handful of times in a repository's life and merges land
daily. A failed read returns the stale entry rather than clearing it. It is
threaded into the selection prompt, the angle prompt, and — through
`riff.context` and `describeMaterial` — into `DraftGenerator.about`, which is the
first time the writer has been told what the product is.

Two columns carry it forward: `riff.source_item_id` (the row, where `source_id`
holds only the kind) and `riff.context` (jsonb, `{ forUser, facts }`). The draft
is written minutes or days later by a server action holding a row id, so
anything the writer needs has to be *on the riff*, not in the workflow's memory.

### 5. `flattenMarkdown` keeps the evidence

`SELECT_RULES` defines material as "a decision with a reason behind it, **a
number they measured**". Three constructs were being deleted before the model
ever saw them, and each was where the numbers live:

- **Tables** become `a — b` rows, header included — in a two-column results
  table the header *is* half the sentence ("before — after"). The separator row
  is dropped, being alignment rather than data.
- **Image alt text** survives. It is what the author wrote the screenshot *was*,
  and on a visual change it is often the only description of the result in the
  body.
- **Link URLs** are collected and appended once as a trailing `Links:` sentence
  — a URL mid-sentence is noise and a URL at the end is a citation. http(s)
  only: an anchor or a relative path resolves against a page a reader of a post
  will never be on.

Idempotence is the property that had to survive, and it is asserted over all
three: the output no longer starts with a pipe, so a second pass walks past it,
and the `Links:` sentence holds bare URLs rather than `[text](url)`, so a second
pass collects nothing. 50 tests in `lib/shipped-work.test.ts` before the review
added three more.

### 6. The backfill applies the gate the webhook applies

`findLastMergedPull` in `lib/github-backfill.ts` mirrored three of `shippedGate`'s
four checks — merged, not a draft, authored by them — and silently omitted the
fourth. So "read my last merged pull request" could return a **stacked pull
request landing in its parent feature branch**: real work, and not a thing that
shipped. `base.ref` and `base.repo.default_branch` are on the list rows already,
which makes the gate free here rather than a request per candidate. Tolerant of
a missing `default_branch` in exactly the way `shippedGate` is.

Separately, 403 and 429 from GitHub now log with `retry-after`. Both previously
looked, from outside, exactly like "this account has no merges".

### 7. The story has three beats

Added 2026-08-25, after decisions 1–6 were built and the angles they produce
were read. They fixed what the prompt *knew* — the product, the repository, what
a user gained — and the hooks that came back were still not his.

**The evidence.** His 100 real X posts, read as a corpus. When he writes about
work he does it in three moves, in this order:

1. **What he did.** Verb-first or "I"-first, past simple. He is the subject.
2. **What happened.** The number, on its own line, whole, with its unit and its
   window: "83/100 to 100/100", "110 stars in 24 hours", "69x cheaper".
3. **What it meant.** Short and flat. A consequence, not a moral: "Thats
   something ✨", "Project is growing faster than I expected".

One clause per line, a blank line between beats, roughly 90–200 characters, an
@handle or a slash command where a tool is named, never a file path or a
function name as the subject, no hashtags. Whole:

> Switched from Sonnet 5 to Luna Low.
>
> 69x cheaper for the same job.
>
> Thats something ✨

Against that, the generated GitHub output. The seven surviving generated hooks
contain the word **"I" zero times**. Three chose the kind `Announcement`; **none
chose `Story`**, which has been in `ANGLE_KINDS` since 019 and describes exactly
what these merges were. And the comparison the audit already had, read again
with the beats in hand — his hand-written version of the same pull request, the
294 characters on `riff.scrap` of `rif-Z4nwUJOKTXtKW7ns`:

> It's insane how easy this was.
>
> I just went with a /loop and it made it done.
>
> The PR took www.advantiestate.no from 83/100 to 100/100 on is-agentic.com…

Three beats, himself as the subject of two of them, the tool named as a slash
command, the number whole and with both ends of it. The generated draft for the
same merge made the pull request the subject and dropped the third beat
entirely.

**The root causes, all four in the prompts rather than in the data.**

- `SELECT_RULES` asked for "ONE publishable idea". An idea is a topic; an event
  is a thing that happened to somebody.
- `shippedRules` asked for "directions", in the two static registers decision 2
  added — user-gained and builder-learns — weighted 4:1 toward the builder by
  the material itself. A register names an audience and says nothing about form.
- Nothing anywhere said **the user is the grammatical subject of the hook.**
- `forUser` is deliberately actorless ("the page loads without waiting"), and it
  was the only structured meaning that reached the writer. An actorless input
  produces actorless output.
- `describeFacts` printed `+x −y across N files in N commits` — the only numbers
  above the fence, and the one kind of number that appears in none of his 100
  posts.

**What changed.**

- **The selection returns the beats.** `did` and `happened` are *quoted* out of
  the blocks and checked by `quoteFromBlocks` — normalised whitespace, exact
  substring, case-sensitive, capped — so rule 2 at the top of
  `lib/shipped-work.ts` holds for them as it holds for the passage. A paraphrase
  fails closed to `""`. `learned` is the model's one line and gets `forUser`'s
  treatment. Empty is a supported answer for all three, and "no did and no
  happened" is now stated as evidence that there is no post.
- **The angle prompt tells the event.** The two registers are gone. In their
  place: a merge is an event; the user is the subject of the hook; the result
  carries the number whole, with unit and window, in the hook or the line under
  it; what it meant is a consequence and never a moral; tools are named so a
  stranger can look them up; and when there is a did and a happened, at least
  one angle in the set is kind `Story`. No kind was added — six is a documented
  ceiling and `Story` was already there, unused.
- **The writer composes them.** `buildUserPrompt` prints the beats as a numbered
  form with "write these as three short blocks with a blank line between them,
  in that order", not as three more facts. `describeConstraints` was checked: no
  channel in `CHANNEL_RULES` forbids a line break, so no caveat is needed yet.
- **The diff stat is no longer prompt.** It stays on `ShippedFacts` and in
  `source_item.meta`; it simply is not printed. Offering a model a cheap number
  and then asking it not to use one is not a rule, it is a temptation.

**What was deliberately left.** `SELECT_RULES` keeps "the test is whether a
stranger who will never see this codebase would learn something". It reads like
a root cause and is not one: it decides *whether there is a post*, which is the
refusal job this file exists to do, and the register complaint belongs one step
downstream where the angles are written.

## What the review changed

Written after a second pass over the diff on 2026-08-25, hunting for what the
execution got wrong. Six things were real.

- **The repo fetch sat above every refusal in the webhook route.** It ran before
  the duplicate check, before entitlement, before `paused` and before
  `MAX_MERGES_PER_DAY` — so a redelivery, a lapsed subscriber or a suspended
  installation each bought a GitHub request that was then thrown away. Cached,
  that is usually free; **on a repository whose metadata read fails, nothing is
  cached and every delivery pays again, forever.** Moved below all four gates,
  where it is bounded by the daily ceiling and is the cheapest thing on a path
  that is about to buy a model call. This also removed it from `source_item.meta`
  — nothing read that key, and the backfill path never wrote it, so the two
  paths now agree.
- **The cache write could drop `login`.** `{ ...meta, repos }` from a snapshot
  read at the top of a webhook request is a read-modify-write over a column
  another writer owns. The interleaving that matters: a user sets their GitHub
  login on /sources while a merge is in flight, this write lands last with a
  pre-login snapshot, and `login` disappears — after which `shippedGate` drops
  every merge as `no-login`, silently. Now one SQL expression against the live
  row: `meta || jsonb_build_object('repos', <current repos> || <entry>)`, with a
  `jsonb_typeof` guard because `||` between an array and an object concatenates
  rather than merges. A lost cache entry is an acceptable race; a lost login is
  not.
- **`homepage` was unbounded and no field was newline-stripped.**
  `describeFacts` prints one fact per line and everything above the fence is
  Quincy speaking, so a description containing a newline could forge a fact
  Quincy never stated. `readRepoContext` now collapses every field to one line
  and caps all four. `forUser` gets the same treatment at the point it is
  written, because it is the one string that crosses *out* of the fence.
- **`describeMaterial` could throw on the page somebody pressed Draft on.** It
  cast `riff.context.facts.repo` to a type and handed it to `describeRepo`,
  where `repo.topics.length` on a row that stored `topics` as anything else is a
  `TypeError` in a server action. `riff.context`'s own comment promises it
  degrades to a shorter prompt instead. Now narrowed through `readRepoContext`.
- **A workflow payload in flight across the deploy would have crash-looped.**
  The payload's shape changed — `repository: string` became `facts` — and a run
  started before the deploy resumes into `facts.repository` on an `undefined`,
  which Workflow reads as a transient fault and retries. `readShippedFacts`
  narrows the payload the way jsonb is narrowed everywhere else; the old shape
  degrades to an empty facts paragraph and the merge still becomes a riff.
- **The migration would have died on its first statement.**
  `scripts/riff-context.sql` carries a NOTE saying never to put a statement
  separator in a comment, and its own prose then did, twice. Running the apply
  script's splitter over the file — no database attached — produced three
  statements rather than two, the first being the tail of a paragraph about
  foreign keys. The prose is fixed, and `apply-riff-context.ts` now strips
  whole-line comments *before* splitting, so the rule the NOTE states is
  enforced rather than requested.

Refuted, having been checked: `flattenMarkdown` is stable over a second pass on
every construct that changed, including a table cell containing only a dash, a
row of links, and a `Links:` sentence fed back in (probed directly, sixteen
adversarial inputs, all stable). `startShippedRiff`'s `onConflictDoNothing` is
retry-safe with the new columns — the id is derived from the `source_item`, so a
step retry writes nothing and returns the same id. `ShippedFacts` carries no
`Date` and no `undefined`: `mergedAt` is an ISO string precisely so it survives
the payload, and `repo: null` round-trips. Voice and meeting riffs are unchanged
apart from decision 1's brain mode — `completeSpokenRiff`'s `deps` default is
still `generateAnglesFromSaid` and only the shipped workflow overrides it.

`lib/rhythms.ts`'s `shipped-work` entry was read and left alone. Its `how` says
Quincy "reads the description you already wrote — never the diff", and that is
still exactly true: what this change adds is three lines of repository metadata,
not a line of code.

## What the live run changed

Written 2026-08-25, after the migration was applied and the branch was run
against the real database for the first time.

**A bundling fault that only running could find.** `pnpm dev` died on the first
request. `lib/github-app.ts:93` imports `node:crypto`, and decision 4 had put
that file on a path the workflow bundler walks: `workflows/run-shipped-riff.ts`
→ `lib/shipped-work.ts` → `lib/github-repo.ts` → `lib/github-app.ts`. Node
modules are forbidden in the workflow function's own bundle — a `"use step"`
body may hold them, and this import was reached outside one. The fix splits the
module by purity: `RepoContext`, `describeRepo`, `readRepoContext` and the caps
moved to a new `lib/repo-context.ts` that imports nothing at all;
`lib/github-repo.ts` keeps only `repoContextFor`, the half that talks to
GitHub; `lib/shipped-work.ts` imports from `repo-context` and now carries a
comment saying every import in it must be pure. **Neither `tsc` nor the unit
tests can see this class of fault** — the types are identical either way. Only
a dev server or a build says a word, which is an argument for running one
before calling a branch built.

**52 PASS, 0 FAIL — "Everything holds."** `scripts/verify-shipped-work.ts
--port 3005 --live` against a dev server on the real database, 2026-08-25,
teardown clean: "Cleaned up: 10 pull request(s), 1 riff(s)". The refusal case
went through the new selection prompt and turned down a docs-only merge with a
sentence that names the reason: "This is a documentation update recording plan
completion, not a publishable event."

**The comparison this change exists for.** The real merge — PR #23's captured
body — came back as three angles:

> I raised the voice-note limit after measuring what the old one was throwing away: 37% of a spoken note.

> I turned voice notes into riffs, with a card that can show the work while it is still in flight.

> I replaced a cron-shaped voice-note workflow with a background job that starts when somebody presses stop.

The first two are short posts, the third a thread. The same pull request on
2026-08-21, before decision 7:

> The first background job in the product is not a cron—and that distinction matters.

> after() looked cheaper until we compared it with what Voice Notes could lose.

> At the old 6,000-character ceiling, one live Norwegian voice note silently lost 37% of what the person said.

**Three of three in first person, against zero of three.** The number moved
from the third hook into the first. That is the register the audit said was
missing, on the same material, from the same route.

What the run does not prove, said plainly: no merge has yet arrived **from
GitHub itself** — the harness drives the route with a signed captured body —
and **no draft has been written from one of these angles** through the new
beats block. Both are still owed.

## What ships

Modified:

- `app/(app)/riffs/actions.ts` — `describeMaterial`, `about` into `generateDraft`
- `app/(app)/sources/actions.ts` — repo context on the backfill path
- `app/api/webhooks/github/route.ts` — repo context, below every refusal
- `lib/adapt.ts` — `generateAnglesFromShipped`, `buildShippedAnglePrompt`
- `lib/drafting.ts` — `DraftGenerator.about`
- `lib/github-backfill.ts` — the default-branch gate, 403/429 logging
- `lib/riffs.ts` — `{ stories: "full" }`, `startShippedRiff(context)`, `context`
  on `getOwnedAngle`
- `lib/schema-app.ts` — `riff.source_item_id`, `riff.context`
- `lib/shipped-work.ts` — `ShippedFacts`, `describeFacts`, `readShippedFacts`,
  `forUser`, `flattenMarkdown`; imports repo context from `lib/repo-context.ts`,
  and every import in this file must stay pure
- `lib/shipped-work.test.ts` — 53 tests
- `workflows/run-shipped-riff.ts` — facts through the payload, the shipped angle
  generator

New:

- `lib/repo-context.ts` — the pure half: `RepoContext`, `describeRepo`,
  `readRepoContext`, the caps. Zero imports, so the workflow bundle can reach it
- `lib/github-repo.ts` — `repoContextFor`, the half that calls GitHub
- `scripts/riff-context.sql`
- `scripts/apply-riff-context.ts`

## Verification

What is proved:

- `pnpm tsc --noEmit` — clean.
- `pnpm vitest run` — 1053/1053 across 59 files. `lib/shipped-work.test.ts` is
  53 of them: the flattening of tables, alt text and links plus idempotence over
  each, `describeFacts` printing and omitting, the fenced prompt, and
  `readShippedFacts` against the payload shape this replaced.
- `eslint` clean on every touched file.
- **`pnpm dev` boots.** On the list because it is the only one of these four
  that caught the bundling fault above.
- **`scripts/verify-shipped-work.ts --port 3005 --live`, 2026-08-25 — 52 PASS,
  0 FAIL, "Everything holds."** — against a dev server on the real database,
  teardown clean. The refusal, the real merge and the angles it produced are
  quoted under "What the live run changed".

What is still owed:

- **A merge arriving from GitHub itself**, webhook to card, rather than the
  harness's signed captured body — with the repository context cold so the
  fetch and the cache write both run.
- **A draft written from one of the new angles**, through the beats block in
  `buildUserPrompt`. The angles now read like his; nobody has read a draft.

`scripts/verify-shipped-work.ts` was checked and **needs no change**. It drives
the real HTTP endpoint with signed bodies and never constructs a workflow
payload, so `repository` → `facts` is invisible to it. Its 37 default checks
still describe the route; its `--live` mode now costs slightly more per run,
because the selection prompt carries the brain's stories in full.

## STOP conditions

- **A card appears for a merge that is not a post.** 021's STOP condition, and
  decision 3 raises the risk rather than lowering it: a model handed more facts
  is a model with more to say. If a dependency bump produces a card, the fix is
  the selection prompt.
- **The two registers collapse into one.** If every set comes back as (a)
  because `forUser` is present and (b) is never used, the prompt has traded one
  monoculture for another.
- **`forUser` starts being invented.** It is drawn from the blocks. A sentence
  about a user benefit that the description never claimed is a fabrication with
  the user's name on it, and it would show up as a `forUser` on merges whose
  passage is entirely internal.

## Follow-ups, deliberately not in scope

- **The three-beat sequence belongs in the brain, as one rule. Done 2026-08-25,
  by the owner.** The rule was appended to `voice/x` (`bp-Kr7hipLsHyWZSOpR`), so
  it now reaches the voice-note path, the meeting path and the adapt path as
  well as the merge path, and it is his to edit rather than ours to redeploy.
  `RULE_CAP = 15` meant something had to leave: the purely structural rule
  "Break explanations into short, standalone lines… from a claim to a short
  explanation and then to a link or question" was removed as superseded — the
  beats say the same thing about form, and also say what belongs in each line.
- **Exclude Quincy-authored posts from voice compilation. The one bad row is
  gone, 2026-08-25; the provenance rule is not written.** `si-H9qKZuBJkEEQaLXs`
  — the post `TELLS` quotes as the canonical AI tell, "Building the product is
  one job. Explaining what happened is another. Turns out, sharing the process is
  part of the build too." — is in the X corpus and is also quoted in the
  `story/x-building-in-public` brain page. It was written by Quincy and published
  under his name, which is the product working; the consequence is that the voice
  compiler reads it back as evidence of how *he* writes, and the brain then
  reports the machine's habit as his. `TELLS` is explicitly conditional on the
  examples ("unless the user's own posts show them doing it"), so a Quincy post
  in the corpus does not merely add noise — it **switches off the rule written to
  catch that exact sentence.** The fix is provenance: a draft published through
  Quincy is already known to be Quincy's, so the corpus read and the voice
  compilation should both skip it. Until they do, every post the product writes
  makes the next one more like itself.

  What was done by hand: the post was deleted from the X corpus (100 → 99); its
  hook and three quotes were removed from `story/x-building-in-public`, the hook
  replaced by an owner quote that was already on the page ("Every project i
  built in silence launched to crickets…"); its URL was removed from the `proof`
  of both story pages; and its quoted examples were removed from two voice
  rules. Pre-edit snapshots are in `brain_page_version`, and six `brain_event`
  rows record the edit. The corpus is clean today; nothing yet stops the next
  published draft from entering it.
- **"Shipped This Week."** 021's decision 5 rejected it and then said, in its own
  follow-ups, that it is probably the better product: a clock rhythm that reads
  a week's merges together and writes one post about the through-line. This
  audit strengthens that. Four merges produced twelve angles and no post; the
  week those four merges *add up to* was never a candidate, and it is the thing
  a founder actually announces.
- **The `MAX_MERGES_PER_DAY` read-then-act race.** The webhook counts recent
  `source_item` rows and then inserts, which is two statements. A merge queue
  landing eight pull requests in one second gives all eight `recent = 0` and all
  eight run. Fix it the way `claimVoiceRiff` does — a conditional insert that
  fails when the count is already at the ceiling — rather than by making the
  window smaller.
- **A sweep for `source_item` rows stuck `pending`.** Rows with no riff and no
  `meta.refusal`: the workflow neither produced a card nor recorded why. Live
  example: `si-cdcfqJnPJBFiCgZZGYF2`. Until something looks for these, a
  workflow that dies between the insert and the refusal write is invisible.
- **`release.published` as a second event.** A better "we shipped" signal than
  any single merge and a two-line addition to the same route. 021 deferred it
  for lack of releases to measure against; that has not changed.
- **The README, via a deliberate manifest migration.** A repository's README says
  far more about the product than its description does, and reading it needs
  `contents: read` — a permission every installed user has to re-accept. That is
  a product decision with a migration attached, not a code change, and decision
  4 stops at `metadata: read` on purpose.
- **Repetition awareness per repository.** `riff.source_item_id` now makes it
  possible to ask what was already published about this repository, which is
  what stops the fourth post in a week opening the same way. The column exists;
  nothing reads it yet.
- **The verify harness leaves a riff behind that fails the next run.** The
  first live attempt on 2026-08-25 failed 3 checks for a reason that had nothing
  to do with this branch: the dev account still held `source_item`
  `PR_verify_real` and riff `rif_gh_si-QVfeli3CuyvR7MEF5dHy` from the 2026-08-21
  run. The workflow creates the riff *after* teardown has run, and teardown only
  deletes riffs younger than 30 minutes — so a later run finds the old row, gets
  `200 duplicate` on the real merge, and reads the old angles back as its own
  result. A stale run therefore reports a previous build's output as this
  build's, which is the worst thing a verifier can do. Both rows were removed by
  hand. The fix: teardown should delete every `github` riff on the dev account
  whose `source_item` is gone, not only the recent ones — or `waitForShippedRiff`
  should key on the `source_item` id it just created rather than on recency.
- **`findLastMergedPull` returns the wrong merge.** It sorts repositories by
  `pushed_at` and returns as soon as one of them yields a qualifying merge — so
  what it finds is "the newest merge in the most recently pushed repository that
  has one", not "the newest merge". Inside a repository it asks for
  `sort=updated`, which is not merge order either: a comment on a stale pull
  request reorders the list, and a real merge can be pushed past
  `PULLS_PER_REPO` by conversation alone. Fix it by collecting candidates across
  every scanned repository and sorting them by `merged_at`, which costs the
  early exit.
- **The meeting selection still renders the brain in `index` mode.**
  `selectMeetingMoment` in `run-meeting-riff.ts` is a tool-less `generateObject`
  with exactly the defect decision 1 fixes, and it was left alone because this
  branch is about GitHub. It should get `{ stories: "full" }` next time
  lib/meetings.ts is opened.
- **Nothing caps how many stories `full` mode renders.** `QUOTES_PER_STORY`
  bounds the quotes inside one story; the number of stories is whatever the
  brain holds, and Heartbeat adds to it weekly. Decision 1 just pointed four
  more call sites at that unbounded prompt. Per AGENTS.md a ceiling bounds what
  one run buys — this one is bounded by a table that grows.

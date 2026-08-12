# Plan 021: Stop a multi-channel piece reporting one version's placement as the whole story

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `advisor-plans/README.md`.
>
> **Drift check (run first)**:
>
> ```bash
> git diff --stat 85f2386..HEAD -- components/drafts/drafts-list.tsx components/drafts/draft-card.tsx lib/scheduling.ts
> ```
>
> If any of those changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch, treat
> it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none. Touches only the Drafts receipt; independent of plans
  018–020, which change `lib/scheduling.ts` and `lib/publish-run.ts`.
- **Category**: bug
- **Planned at**: commit `85f2386`, 2026-08-05

## Why this matters

A piece can have one version per channel — that is the whole point of the Drafts
board: an X version and a LinkedIn version of the same idea, side by side. Each
is approved separately, and each is placed in a slot **for its own channel**, so
each gets a different time.

The done row shows one placement for the entire piece. `placements` is keyed by
`draftId`, and each approval overwrites the previous one, so the row reports
whichever version happened to resolve last.

The mild version: a two-channel piece says "All 2 versions approved · going out
Monday 08:00" when one goes out Monday 08:00 on X and the other Tuesday 11:00 on
LinkedIn. Half true.

The bad version is the reason this is worth fixing. Suppose the X version finds
a slot and the LinkedIn version does not, because no LinkedIn slot exists. If
the LinkedIn approval resolves last, the row reads:

> All 2 versions approved · no slot for this channel yet, so it has no time. Add
> one on Lineup.

"this channel" names no channel, and the sentence implies nothing is going out.
Something is: the X version is queued and will publish. The user is being told
their writing is parked when half of it is about to be published in their name.
That is the same class of failure the branch was written to remove — a surface
asserting something the rest of the product does not back up.

## Current state

Files:

- `components/drafts/drafts-list.tsx` — holds list state. `placements` is
  declared around line 163 and written at line 197; the done row reads it at
  line 415.
- `components/drafts/draft-card.tsx` — `doneMessage` composes the sentence;
  `DoneDraft` renders it.
- `lib/scheduling.ts` — exports `ApprovalPlacement`, the shape both files use.

The state, keyed by piece:

```ts
// components/drafts/drafts-list.tsx:163-165
  const [placements, setPlacements] = React.useState<
    Record<string, ApprovalPlacement | undefined>
  >({})
```

The write, which is where the overwrite happens — `approve` is called once per
channel, and `draftId` is the same for every channel of a piece:

```ts
// components/drafts/drafts-list.tsx:195-198
        persist(state, async () => {
          const placement = await approveVersion(versionId, text)
          setPlacements((current) => ({ ...current, [draftId]: placement }))
        })
```

The read:

```tsx
// components/drafts/drafts-list.tsx:413-416
                <DoneDraft
                  draft={draft}
                  placement={placements[draft.id]}
                  takeFocus={focused?.draftId === draft.id}
```

And the sentence, which is built for exactly one placement:

```ts
// components/drafts/draft-card.tsx, doneMessage
function doneMessage(draft: Draft, placement?: ApprovalPlacement) {
  const what =
    draft.versions.length === 1
      ? "Approved"
      : `All ${draft.versions.length} versions approved`

  if (!placement) return what

  if (placement.scheduled) {
    const when = new Date(placement.at).toLocaleString(undefined, {
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
    })

    return `${what} · going out ${when}`
  }

  return placement.reason === "no-slot"
    ? `${what} · no slot for this channel yet, so it has no time. Add one on Lineup.`
    : `${what} · every slot for the next two weeks is taken. Add a slot on Lineup, or free one up.`
}
```

The type being stored:

```ts
// lib/scheduling.ts
export type ApprovalPlacement =
  | { scheduled: true; at: Date }
  | { scheduled: false; reason: "no-slot" | "slots-full" }
```

Note it carries no channel. The caller knows the channel — `approve(draftId,
channel, text)` has it in hand — so the fix does not require changing the server
action's return type.

### Conventions to match

- `placements` is described in its own comment as "presentation rather than
  data, like `focused`". Keep it that way — do not move it into `ListState`.
  `ListState` is the optimistic data model that `persist` rolls back on failure;
  a placement is a server answer that has already arrived and must not be rolled
  back with it.
- The existing keying idiom for per-channel state in this file is the pair
  `{ draftId, channel }` — see `focused` at line 148 and `versionIdFor` at line
  131. Prefer a composite key built the same way over nested records.
- Copy style: state what happened, then the single next step. Short sentences,
  no exclamation, `·` as the separator. Never assert something the product
  cannot back up.
- Comments explain why, not what. `doneMessage` already carries a comment about
  the sentence having to be *earned rather than asserted* — extend that
  reasoning rather than replacing it.

## Commands you will need

| Purpose   | Command                                | Expected on success |
|-----------|----------------------------------------|---------------------|
| Typecheck | `npx tsc --noEmit`                     | exit 0, no output   |
| Tests     | `npx vitest run`                       | all pass            |
| Lint      | `npx eslint components/drafts/drafts-list.tsx components/drafts/draft-card.tsx` | exit 0, no output |
| Build     | `npx next build`                       | exit 0              |

## Scope

**In scope** (the only files you may modify):

- `components/drafts/drafts-list.tsx`
- `components/drafts/draft-card.tsx`

**Out of scope** (do NOT touch, even though they look related):

- `app/(app)/drafts/actions.ts` — `approveVersion` already returns everything
  needed. Do not add a channel to its return value; the caller has it.
- `lib/scheduling.ts` — `ApprovalPlacement` is correct as it stands. Adding a
  channel to it would push a UI grouping concern into the scheduling layer.
- The optimistic-update logic, `persist`, `commit`, `ListState`, and the
  view-transition wrapping in `approve`. They are load-bearing and unrelated;
  the comment at lines 201-203 explains one non-obvious interaction.
- `DoneDraft`'s Undo affordance and focus handling.
- The `slots-full` wording "two weeks" — that is corrected by plan 019. If 019
  has already landed the text will differ; leave whatever is there.

## Git workflow

- Branch: `advisor/021-one-receipt-per-channel-not-per-piece`
- One commit, conventional-commits subject with an explanatory body. See
  `git log --format='%s' -5`.
- Do NOT push or open a PR.

## Steps

### Step 1: Key placements by version, not by piece

In `components/drafts/drafts-list.tsx`, change `placements` so one entry cannot
overwrite another version's answer.

Use a composite key of `draftId` and `channel`, matching how `focused` and
`versionIdFor` already address a version in this file. Add a small helper
alongside `versionIdFor` that builds the key, so the write and the read cannot
disagree about its format.

Update the write at line 197 to store under that key. Update the comment above
`persist` to say why the key is per-version: a piece has one version per channel,
each lands in a slot for *its own* channel, and a single entry per piece would
report whichever approval resolved last.

**Verify**:

- `npx tsc --noEmit` → exit 0, no output.
- `grep -n "\[draftId\]: placement" components/drafts/drafts-list.tsx` → no match.

### Step 2: Pass every channel's placement to the done row

At the `DoneDraft` call site (around line 415), pass the placements for **all**
of that piece's versions instead of one.

Build a `Record<string, ApprovalPlacement | undefined>` keyed by channel, from
`draft.versions`, and pass it as a prop — for example `placements`, replacing
the singular `placement`. A piece whose versions were approved in an earlier
session will have no entries, which must stay valid: the row falls back to
saying only what it can defend.

**Verify**: `npx tsc --noEmit` → exit 0, no output.

### Step 3: Make the sentence tell the truth for every case

In `components/drafts/draft-card.tsx`, change `DoneDraft`'s prop and rewrite
`doneMessage` to take the per-channel map plus the draft.

Required behaviour, in order of precedence:

1. **No placements at all** (a piece approved in an earlier session, or the beat
   before the server answers) — unchanged: `"Approved"` or
   `"All N versions approved"`, and nothing about the Lineup.
2. **Every version scheduled, one version** — unchanged from today: `Approved ·
   going out Monday 08:00`.
3. **Every version scheduled, more than one** — name each channel with its own
   time. Two channels can share a time only by coincidence, so do not collapse
   them unless the instants are actually equal. Use the version's `label` for
   the channel name; `Draft.versions` carries it, and it is what the rest of the
   UI shows.
4. **A mix of scheduled and unplaced** — this is the case that is currently a
   lie. It must say both halves: what is going out, and what has no time and
   why. Never let the unplaced half imply the scheduled half is not happening.
5. **Nothing scheduled** — the existing `no-slot` / `slots-full` wording, but
   with the channel named. "no slot for this channel yet" names no channel when
   the row covers several; say which.

Keep the sentence short. If the composed message would run long with three or
more channels, prefer a compact per-channel list over a paragraph — the row is
one line in a list, not a report.

**Verify**:

- `npx tsc --noEmit` → exit 0, no output.
- `grep -n "no slot for this channel yet" components/drafts/draft-card.tsx` →
  either no match, or a match where the channel is interpolated.

### Step 4: Confirm nothing else regressed

**Verify**:

- `npx vitest run` → all pass, count unchanged (these are components; the vitest
  suite covers pure modules only).
- `npx eslint components/drafts/drafts-list.tsx components/drafts/draft-card.tsx`
  → exit 0, no output.
- `npx next build` → exit 0.
- `git status --short` → only the two in-scope files modified.

### Step 5: Check it by hand

There is no component test infrastructure in this repo, so the cases in Step 3
must be confirmed in a browser. Run `npx next dev`, sign in with the dev account
(`npx tsx --env-file=.env.local scripts/dev-account.ts` creates it), and check at
minimum:

- A two-channel piece where **only one channel has a slot** — the row must name
  the channel that is going out *and* the one that is not. This is the case the
  plan exists for.
- A two-channel piece where **both have slots** — both times shown, each with
  its channel.
- A single-channel piece — the sentence must be no longer than it is today.

Report what you saw for each. If you cannot run the app, say so explicitly
rather than marking the criterion met.

## Test plan

No unit tests. `vitest` in this repo covers pure modules (`lib/*.test.ts`) and
there is no component-test setup; adding one is a larger change than this fix
and is out of scope.

The verification is Step 5's by-hand pass. `doneMessage` is a pure function and
would be the natural thing to test if a component-test harness is ever added —
say so in your report as a follow-up, and do not build the harness here.

## Done criteria

ALL must hold:

- [ ] `npx tsc --noEmit` exits 0 with no output
- [ ] `npx vitest run` exits 0
- [ ] `npx eslint components/drafts/drafts-list.tsx components/drafts/draft-card.tsx` exits 0
- [ ] `npx next build` exits 0
- [ ] `grep -n "\[draftId\]: placement" components/drafts/drafts-list.tsx` returns no match
- [ ] `grep -n "placement={placements\[draft.id\]}" components/drafts/drafts-list.tsx` returns no match
- [ ] `git diff --name-only` lists only the two in-scope files
- [ ] Step 5 performed, with the three cases reported — or an explicit statement
      that the app could not be run
- [ ] `advisor-plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" do not match the live code.
- Getting the channel to the receipt appears to require changing
  `approveVersion`'s return type or `ApprovalPlacement`. It does not — `approve`
  already receives `channel` as its second argument.
- The composed sentence cannot be kept to a reasonable length for a piece with
  three or more channels without dropping information. Report the tension with a
  proposed layout rather than silently truncating; the row's shape is a design
  decision.
- Moving `placements` into `ListState` seems necessary. It is not, and it would
  be wrong — `persist` rolls `ListState` back on a failed write, which would
  discard a server answer that had already arrived.

## Maintenance notes

- **`doneMessage` is now the only place that explains placement to the user**,
  and it has five branches. If a third `ApprovalPlacement` reason is ever added
  in `lib/scheduling.ts`, this function must grow a branch with it — a reviewer
  should check for that whenever the type changes.
- The row is a client-side receipt and only reflects approvals made *in this
  session*. A piece approved earlier renders with no placement text at all,
  which is correct but means the Lineup remains the only durable answer to "when
  is this going out". If that gap ever matters, the fix is to read placement
  from the server on load rather than to cache it harder here.
- A reviewer should scrutinise the mixed case in Step 3 point 4 — that the
  scheduled half is stated first and cannot be misread as not happening.

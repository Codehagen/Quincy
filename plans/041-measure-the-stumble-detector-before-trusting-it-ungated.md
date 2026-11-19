# Plan 041: Measure the stumble detector before it cuts without asking

> **Executor instructions**: Follow each step and verify it. On a STOP
> condition, stop and report. When done, update this plan's row in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat c17719c..HEAD -- lib/editor/disfluency.ts lib/editor/gate.ts lib/editor/disfluency.test.ts`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (it may end with a gate change that makes some runs ask first)
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `c17719c`, 2026-11-19

## Why this matters

`clean_up_speech` is in `EXEMPT_TOOLS` in `lib/editor/gate.ts`. So an agent
run can cut repetitions and false starts without the approval gate. The gate
otherwise applies to runs that remove more than 30 % of the take or whole
sentences. The exemption rests on a claim in its comment: a clean-up only takes
"the first copy of a repeat and an abandoned start, never the sentence said
after them". A false start, though, can be up to six spoken words
(`MAX_FALSE_START_WORDS = 6` in `lib/editor/disfluency.ts`). The detector has
only been tested on hand-made word lists (`lib/editor/disfluency.test.ts`).
Nobody has measured how often it fires on real speech where nothing was
wrong. Every false positive is a cut of something the person meant to say,
made without asking. This plan builds a small labelled set from real
transcripts, measures precision per kind, and only then decides whether the
exemption holds.

## Current state

- `lib/editor/disfluency.ts`: `detectDisfluencies(words: Word[]): Disfluency[]`.
  Kinds are `hesitation | repetition | false_start | discourse`, and
  `DEFAULT_CLEAN_UP` is `hesitation, repetition, false_start`. `Word` is
  `{ text, startUs, endUs, confidence }` from `lib/editor/transcript.ts`.
- Real transcripts: Deepgram responses are stored on `video_asset.transcript`
  and turned into words by `wordsFromDeepgram` (`lib/editor/transcript.ts`).
  The sample recording's manifest (`lib/editor/sample-manifest.ts`) can carry
  a transcript file. Check `public/` or wherever the manifest's `files` point.
- Gate exemption comment, `lib/editor/gate.ts` ~line 52:
  ```ts
  // The first copy of a repeat and an abandoned start, never the sentence
  // said after them (disfluency.ts): the rule names fillers and pauses, and
  // these are the same kind of cut. ...
  "clean_up_speech",
  ```
- `lib/editor/agent.test.ts` requires every tool to be in `EXEMPT_TOOLS` or
  `GATED_TOOLS`.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Tests (area) | `pnpm vitest run lib/editor/disfluency` | all pass |
| All | `pnpm typecheck && pnpm lint && pnpm test` | exit 0 |

## Scope

**In scope**: a new fixture directory `lib/editor/__fixtures__/speech/` (word
lists as JSON), a new test `lib/editor/disfluency.eval.test.ts`,
`lib/editor/disfluency.ts` (only to fix false positives the eval shows),
and `lib/editor/gate.ts` (only in Step 4, only if the threshold is missed).

**Out of scope**: the studio UI, the agent prompt, the transcriber.

## Steps

### Step 1: A labelled set

Build at least 6 fixtures, three English and three Norwegian, each 1–3 minutes
of real speech, as `Word[]` JSON. Take them from the sample transcript and
from public-domain recordings run through the existing transcriber. Use
nothing private, and do not commit personal recordings. Next to each, write
`expected.json`: the list of `{kind, from, to}` a careful human would cut.
Label from the words alone, without looking at the detector's output first.

**Verify**: `ls lib/editor/__fixtures__/speech/*.json | wc -l` → at least 12.

### Step 2: The eval

Write `disfluency.eval.test.ts`. It runs `detectDisfluencies` on each fixture
and prints precision and recall per kind (a match is the same kind with
overlapping indices). It asserts precision ≥ 0.9 for `repetition` and
`false_start`, and ≥ 0.8 for `hesitation`. Recall is printed only.

**Verify**: `pnpm vitest run lib/editor/disfluency.eval.test.ts` → shows the table.

### Step 3: Fix false positives

For each false positive, add the smallest rule change that removes it, for
example a word to `INTENDED_DOUBLES`, with a unit test in
`disfluency.test.ts` that reproduces it. Do not tune to the fixtures at the
cost of the existing tests.

**Verify**: both test files pass.

### Step 4: Decide the gate

If `false_start` precision is still below 0.9 after Step 3, STOP and report
the numbers. The likely change is to let `clean_up_speech` stay exempt only
for `hesitation` and `repetition`, and to send runs that include false starts
through the gate. That is a product decision for the maintainer.

## Done criteria

The eval test exists, passes its thresholds, and its table is pasted into
this plan's status row in `plans/README.md`.

## STOP conditions

- No real transcript can be obtained without private data.
- Step 4's threshold is missed.

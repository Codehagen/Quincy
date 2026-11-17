# Plan 034: Fathom and Granola calls find your voice by the vendor's own attribution, and say why when they can't

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat f217456..HEAD -- lib/fathom.ts lib/granola.ts lib/meetings.ts lib/meeting-intake.ts "app/api/webhooks/granola"`
> On any change, compare the excerpts below with the live code; a mismatch is a STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (pure mappers, fully unit-testable)
- **Depends on**: none (plans/032's script is a useful extra check, not required)
- **Category**: bug
- **Planned at**: commit `f217456`, 2026-11-17 (branch `claude/project-thread-3xdn60`)

## Why this matters

`ownSegments` in `lib/meetings.ts` finds the user's turns through an exact
chain: user email → attendee → attendee name → transcript speaker name. That
chain was built for Circleback. Fathom and Granola both carry something more
exact, and the mappers on this branch use it only partly:

1. **Fathom** labels every transcript item with
   `speaker.matched_calendar_invitee_email`, its own audio-to-calendar match.
   The mapper ignores it and joins on names instead. When the recorder's name
   in `recorded_by.name` ("Christer Hagen") differs from the transcript's
   `display_name` ("Christer"), which happens on any call without a calendar
   invite, the join fails and the call becomes a failed card even though
   Fathom knew exactly whose voice it was.
2. **Granola** recordings made on a phone or watch carry no `attribution`
   (Granola's docs: "Omitted when the attribution is unknown, such as phone and
   watch transcript items that only carry an anonymous `diarization_label`").
   Every such note becomes a failed card reading "Quincy could not find
   Christer Hagen in that transcript", which blames the wrong thing and gives
   the user nothing to do. The honest sentence is that Granola could not tell
   voices apart on that recording.

Failures here are not cheap: a failed card is the only thing the user sees from
a call, and repeated wrong ones teach them the source is broken.

## Current state

- `lib/meetings.ts` `ownSegments(payload, emails, displayName = "", vendor = "Circleback")`
  returns `{ ok: true, speaker, segments }` or `{ ok: false, message }`. The
  messages: not listed as an attendee; "<vendor> did not name you on that
  call"; "Quincy could not find <name> in that transcript". Tests in
  `lib/meetings.test.ts`. **Do not change its join rule**: plans/019 decision 2
  forbids heuristics (no "most talkative speaker").
- `lib/fathom.ts` `parseFathomMeeting`:
  ```ts
  const attendees: MeetingAttendee[] = Array.isArray(raw.calendar_invitees)
    ? raw.calendar_invitees.flatMap((entry) => {
        ...
        return [{ name: asString(a.matched_speaker_display_name) || asString(a.name), email: asString(a.email) }]
      })
    : []
  if (recorderEmail && !attendees.some((a) => a.email.toLowerCase() === recorderEmail.toLowerCase())) {
    attendees.push({ name: recorderName, email: recorderEmail })
  }
  // transcript items: { speaker: asString(speaker.display_name), text, timestamp }
  ```
  The transcript item's `speaker.matched_calendar_invitee_email` is read nowhere.
- `lib/granola.ts` `parseGranolaNote`: a turn's label is the owner's name when
  `speaker.attribution === "me"`, else `speaker.name || speaker.diarization_label || "Them"`.
  It returns a `MeetingPayload` and nothing about whether attribution existed.
- `lib/meeting-intake.ts` `ingestMeeting({ connection, source, payload, url, aliases, meta })`
  calls `ownSegments(payload, [owner.email, ...aliases], owner.name, VENDOR[source])`
  and, on failure, records `match.message` on the connection and writes it to
  a failed riff.
- Exemplar tests: `lib/fathom.test.ts` (`body()` fixture) and
  `lib/granola.test.ts` (`note()` fixture).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `pnpm typecheck` | exit 0 |
| Focused tests | `pnpm vitest run lib/fathom.test.ts lib/granola.test.ts lib/meetings.test.ts` | all pass |
| All tests | `pnpm test` | all pass |
| Lint | `pnpm lint` | 0 errors |

## Scope

**In scope:** `lib/fathom.ts`, `lib/granola.ts`, `lib/meeting-intake.ts`
(one optional field), `app/api/webhooks/granola/[token]/route.ts` (pass the
field), `lib/fathom.test.ts`, `lib/granola.test.ts`.

**Out of scope:** `ownSegments`'s matching logic and its existing messages;
`lib/meetings.test.ts` (must pass unchanged); the Circleback route; any copy
outside the one new sentence.

## Git workflow

Branch `advisor/034-vendor-speaker-attribution`. One commit per step, plain-sentence messages as in `git log`.

## Steps

### Step 1: Fathom names each attendee by the speaker the transcript matched to their email

In `parseFathomMeeting`, first build `spokenAs: Map<lowercased email, display_name>`
from transcript items that have both `speaker.matched_calendar_invitee_email`
and `speaker.display_name` (first one wins). Then an attendee's name is
`spokenAs.get(email) || matched_speaker_display_name || name`, and the recorder's
pushed entry uses `spokenAs.get(recorderEmail) || recorderName`. This keeps the
join exact: the name now *is* the transcript's label for that email.

Add to `lib/fathom.test.ts`:
- No calendar invitees; `recorded_by.name` is "Christer Hagen"; transcript items for the user have `display_name: "Christer"` and `matched_calendar_invitee_email` = the recorder's email → `ownSegments(..., [recorderEmail])` is `ok` with the user's lines only.
- An invitee whose `matched_speaker_display_name` is null but whose email matches transcript items → their name is the transcript label.
- The existing tests pass unchanged.

**Verify**: `pnpm vitest run lib/fathom.test.ts` → all pass, including 2 new.

### Step 2: Granola says when it could not attribute anyone

Change `parseGranolaNote` to return `{ payload, attributed: boolean } | null`,
where `attributed` is true when at least one transcript item has
`speaker.attribution` of `"me"` or `"them"`. Update the route to destructure.

In `lib/meeting-intake.ts`, add an optional `unattributed?: string` to
`MeetingIntake`. When it is set **and** `ownSegments` fails, use it as the
message instead of `match.message`. Do not skip the insert: the empty-body row
is still the dedup key (see the comment above the insert).

In the Granola route, pass
`unattributed: attributed ? undefined : "Granola recorded this call on a phone or watch, where it can't tell voices apart, so I couldn't tell which words were yours."`
(Quincy speaks in the first person on cards; match the voice of the
existing sentences in `lib/connectors.ts` `stateSentence`.)

Add to `lib/granola.test.ts`:
- A note whose items have only `diarization_label` → `attributed` is false.
- The existing fixture → `attributed` is true.

**Verify**: `pnpm vitest run lib/granola.test.ts` → all pass; `pnpm typecheck` → 0.

### Step 3: Whole suite

**Verify**: `pnpm test` → all pass; `pnpm lint` → 0 errors.

## Done criteria

- [ ] `pnpm typecheck` 0, `pnpm lint` 0 errors, `pnpm test` all pass
- [ ] `grep -n "matched_calendar_invitee_email" lib/fathom.ts` shows it read in code, not only in a comment
- [ ] `lib/meetings.test.ts` has no diff
- [ ] Only in-scope files changed (`git status`)

## STOP conditions

- Making either case pass seems to need a change to `ownSegments`'s matching. That rule is a recorded product decision; report instead.
- A real Fathom or Granola payload (from logs, if available) contradicts the field names above.

## Maintenance notes

- If Granola starts naming phone speakers (`speaker.name`), the `attributed` flag still holds: it is about *me/them*, not names.
- plans/033 moves vendor names into a registry; if it lands first, take the vendor from there.

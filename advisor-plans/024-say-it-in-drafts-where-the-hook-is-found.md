# Plan 024: Say it in /drafts too, where a hook-as-post is actually found

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `advisor-plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat efd2e2a..HEAD -- components/drafts/draft-card.tsx components/drafts/draft-parts.tsx lib/drafts.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `efd2e2a`, 2026-08-09

## Why this matters

When `draftAngle`'s model call fails, each channel body falls back to the angle's
hook. That is deliberate — you should get something you can write yourself rather
than an error and nothing. What was missing is anything that *says so*.

Commit `efd2e2a` fixed half of it: /riffs now marks such an angle with "Quincy
could not write this one. The draft is your hook, waiting for you." But /riffs is
a triage surface you pass through once. The place a person actually meets the
draft — opens it, reads it, edits it, approves it — is /drafts, and on
2026-08-08 that is exactly where the bad one was found: a Substack version whose
entire body was the 89-character hook, sitting in the editor looking like
something Quincy had written.

The check costs nothing. `lib/drafts.ts` already loads `from.riffHook` on every
piece, and the body is already in the component. No query, no schema change, no
new state — one comparison.

## Current state

`lib/drafts.ts` — every draft already carries the hook it came from:

```ts
// lib/drafts.ts (in the Draft type)
  /** Where it came from, so a draft can say what it is downstream of. */
  from: {
    /** The angle from lib/riffs.ts this was drafted from, verbatim. */
    riffHook: string
    /* … */
  }
```

`components/drafts/draft-card.tsx:123-150` — every unapproved version renders
through `VersionEditor`, and the card has `draft.from` in hand:

```tsx
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {draft.versions.map((v) =>
          v.state === "approved" ? (
            <ApprovedVersion /* … */ />
          ) : (
            <VersionEditor
              key={v.channel}
              version={v}
              draftId={draft.id}
              idea={draft.idea}
              isLast={draft.versions.length === 1}
              /* … */
            />
          )
        )}
      </div>
```

`components/drafts/draft-parts.tsx:385` — `VersionEditor` holds the body in
local state, which is what lets the notice clear itself the moment somebody
types:

```tsx
export function VersionEditor({
  version,
  draftId,
  idea,
  isLast = false,
  /* … */
}: {
  version: Version
  draftId: string
  /** The piece's name, so the field's label says which text this is. */
  idea: string
  /* … */
}) {
  const [text, setText] = React.useState(version.text)
  const id = `draft-${draftId}-${version.channel}`
  /* … */
  const { used, limit, over } = measurePost(text, version.channel)
```

**The sentence to use, verbatim.** /riffs already ships this copy in
`components/riffs/riff-parts.tsx` (in the `Drafted` component), and the two
surfaces must not drift into two different wordings for one fact:

> Quincy could not write this one. The draft is your hook, waiting for you.

On /drafts the reader is looking straight at the text, so drop the second
sentence's promise and adapt to the place — proposed:

> Quincy could not write this one — this is your hook. Rewrite it and it is
> yours.

Use that. If you think it is wrong, say so in your report rather than inventing
a third variant.

**Conventions to match.**

- Icons are `hugeicons`, never `lucide`. Import from `@hugeicons/react` +
  `@hugeicons/core-free-icons` and render `<HugeiconsIcon icon={X} />`. /riffs
  uses `Alert01Icon` for this exact state — use the same one.
- Colour comes from semantic tokens, never raw values. This notice is **not**
  destructive: nothing is broken and nothing was lost, there is simply a draft
  that is your own line. `/riffs` renders it in `text-muted-foreground`; match
  that. Do not use `text-destructive` or a red fill.
- No `transition-all`; name properties. (You should not need any transition.)
- Prose gets a measure — `max-w-[60ch] text-pretty`, as the neighbouring copy
  in these files does.
- Comments explain *why*, at length, and name the incident or the rejected
  alternative. Read `components/drafts/draft-parts.tsx` before writing; match
  its density.

## Commands you will need

| Purpose   | Command                                          | Expected on success |
|-----------|--------------------------------------------------|---------------------|
| Typecheck | `pnpm typecheck`                                 | exit 0 |
| Tests     | `pnpm test`                                      | 40 files, 701 tests passing |
| Lint      | `pnpm exec eslint <files you changed>`           | no output |
| Format    | `pnpm exec prettier --write <files you changed>` | lists the files |
| Build     | `pnpm build`                                     | exit 0 (run once, at the end) |

There is no DOM test environment in this repo (`vitest` runs
`environment: "node"`), so this change is verified by typecheck, lint, build and
reading — not by a component test. Do not add a testing-library dependency.

## Scope

**In scope** (the only files you should modify):
- `components/drafts/draft-parts.tsx`
- `components/drafts/draft-card.tsx`

**Out of scope** (do NOT touch, even though they look related):
- `lib/drafts.ts` — `from.riffHook` is already loaded. No query change is
  needed and adding one would be pure cost.
- `ApprovedVersion` — an approved version was read and accepted by a person.
  Warning about it after the fact second-guesses a decision they already made,
  and the row is on its way to being published.
- `components/riffs/riff-parts.tsx` — /riffs already says this. Do not
  refactor the two into a shared component as part of this plan; they sit on
  different surfaces with different surrounding chrome, and one shared
  component would have to carry both layouts.
- `lib/riffs.ts` — the `Angle.fellBack` derivation is /riffs' half and is
  already done.
- The over-limit notice (`over > 0`) already in `VersionEditor`. Leave it
  exactly as it is; the two notices are independent and may both show.

## Git workflow

- Branch: `advisor/024-say-it-in-drafts`
- One commit. Message style is a sentence, not a conventional-commit prefix —
  see `git log --oneline -5`.
- Do NOT push or open a PR.

## Steps

### Step 1: Give `VersionEditor` the hook

Add an optional prop to `VersionEditor` in
`components/drafts/draft-parts.tsx`:

```tsx
  /**
   * The angle this piece was drafted from, when it came from one.
   *
   * <Explain: when the drafting model fails, draftAngle falls back to writing
   * the hook into every channel body — deliberately, so you get something you
   * can write yourself. Comparing against it here is what lets the editor say
   * so. Empty for drafts that did not come from an angle, which is a state and
   * not a failure.>
   */
  hook?: string
```

Derive the flag from the **live** text, not from `version.text`:

```tsx
  const isHook = hook !== undefined && hook.trim() !== "" && text.trim() === hook.trim()
```

Using `text` rather than `version.text` is the point: the notice disappears on
the first keystroke, because the moment you have written something it is no
longer your hook sitting there. Say that in a comment.

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Render the notice

Put it directly **above** the textarea, so it is read before the text rather
than discovered under it. Model the markup on the existing over-limit
annotation in the same component (find it via `overId`) — same caption size,
same muted treatment, `max-w-[60ch] text-pretty`.

Wire it for screen readers the way the file already does: give the element a
stable id (`const hookId = \`${id}-hook\``) and add that id to the `describedBy`
list that is already being assembled, so the field announces the reason along
with its label. The existing code builds `describedBy` like this:

```tsx
  const describedBy =
    [
      over > 0 ? overId : null,
      splitAtFold(text, version.channel).hidden.trim() ? foldId : null,
    ]
      .filter(Boolean)
      .join(" ") || undefined
```

Add `isHook ? hookId : null` to that array. The comment above it already
explains why the ids are conditional — an id pointing at an unrendered element
announces nothing and reports no error — so your addition must be conditional
for the same reason.

Markup shape:

```tsx
        {isHook ? (
          <p
            id={hookId}
            className="inline-flex items-start gap-1.5 max-w-[60ch] text-caption text-pretty text-muted-foreground"
          >
            <HugeiconsIcon
              aria-hidden="true"
              icon={Alert01Icon}
              className="mt-px size-3.5 shrink-0"
            />
            Quincy could not write this one — this is your hook. Rewrite it and
            it is yours.
          </p>
        ) : null}
```

Add `Alert01Icon` to the existing `@hugeicons/core-free-icons` import in the
file; do not add a second import statement.

**Verify**: `pnpm typecheck` → exit 0, and
`grep -c "Alert01Icon" components/drafts/draft-parts.tsx` → 2 (import and use).

### Step 3: Pass it from the card

In `components/drafts/draft-card.tsx`, add `hook={draft.from.riffHook}` to the
`<VersionEditor>` call at roughly line 137. Nothing else in that file changes.

**Verify**: `grep -n "hook={draft.from.riffHook}" components/drafts/draft-card.tsx`
→ exactly 1 match.

### Step 4: Format, lint, typecheck, build

**Verify**:
- `pnpm exec prettier --write components/drafts/draft-parts.tsx components/drafts/draft-card.tsx` → exit 0
- `pnpm exec eslint components/drafts/draft-parts.tsx components/drafts/draft-card.tsx` → no output
- `pnpm typecheck` → exit 0
- `pnpm test` → 701 tests pass (unchanged — this plan adds none)
- `pnpm build` → exit 0

## Test plan

No new automated tests. `vitest` runs in `environment: "node"` with no DOM, and
this repo's convention is to extract pure logic when it needs testing (see
`microphoneFailureMessage`) rather than add a DOM harness for one component.
The comparison here is a single `===` on two strings already in scope; extracting
it would be more indirection than it removes.

Instead, verify by reading and by build:

- `pnpm build` exits 0.
- Confirm by inspection that `isHook` reads `text`, not `version.text` — this is
  the difference between a notice that clears when you type and one that does
  not.
- Confirm `hookId` is in the `describedBy` array and only when `isHook`.

If you have a way to run the app and sign in, the real check is: a draft whose
body equals its `riff_hook` shows the line; typing one character removes it.
Report whether you were able to do this.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0 with 701 tests passing
- [ ] `pnpm build` exits 0
- [ ] `pnpm exec eslint` on the two in-scope files produces no output
- [ ] `grep -c "lucide" components/drafts/draft-parts.tsx` returns 0
- [ ] `grep -n "text-destructive" components/drafts/draft-parts.tsx` shows no
      match on the lines you added
- [ ] `git status --short` lists only the two in-scope files
- [ ] `advisor-plans/README.md` status row for 024 updated

## STOP conditions

Stop and report back (do not improvise) if:

- `Draft["from"]["riffHook"]` no longer exists in `lib/drafts.ts`. The whole
  plan rests on the hook already being loaded; if it is not, the fix needs a
  query change and a different plan.
- `VersionEditor` no longer holds the body in local `text` state. The
  clears-on-typing behaviour depends on it, and a controlled-from-above editor
  would need a different approach.
- The existing `describedBy` assembly is not in the file. Do not invent your
  own accessibility wiring; report the drift instead.
- Adding the notice pushes you toward touching `ApprovedVersion` or a shared
  component with /riffs. Both are out of scope for stated reasons.

## Maintenance notes

- **What will interact with this**: if a future change lets Quincy *rewrite* a
  failed draft in place, this notice becomes the natural home for that action —
  it is the one place in the product that knows a specific version is an
  unwritten hook.
- **What a reviewer should scrutinise**: the copy, and that it is not
  destructive-coloured. This state is common enough that a red box would teach
  people to flinch at a row that mostly means "your turn".
- **Deferred**: unifying this sentence with /riffs' version in one exported
  constant. Two surfaces, two sentences, both short — a shared constant that
  neither can adapt is a worse trade than the duplication until there is a
  third.

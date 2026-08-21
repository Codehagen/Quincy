# Plan 015: Make the disclosure panel respect reduced motion

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `advisor-plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat a3ca175..HEAD -- app/globals.css`
> If it changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as
> a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `a3ca175`, 2026-08-04

## Why this matters

`AGENTS.md` states a non-negotiable: *"Every animation needs a
`prefers-reduced-motion` path."* The "Manage connection" disclosure on
`/channels/<platform>` animates its height for 200ms and does not have one.

The comment in `app/globals.css` claims it does — it says the global
reduced-motion block "flattens the duration to 0.01ms, so this needs no
separate opt-out". That is wrong. The global block selects `*, *::before,
*::after`. The universal selector matches **elements**; it does not match
`::details-content`, which is a different pseudo-element. `transition-duration`
is not an inherited property, so the explicit `transition:` shorthand on the
pseudo-element stands at its full 200ms.

The result inverts the reason the animation was added. The chevron beside the
panel *is* a real element, so it *is* flattened to 0.01ms. With reduced motion
on, the chevron snaps instantly while the panel animates its height for 200ms —
exactly the mismatched pair the animation exists to avoid, now only for the
users who asked for less motion.

The wrong comment is the more expensive half. It tells the next reader the case
is handled, so nobody re-checks it.

## Current state

File and role:

- `app/globals.css` — global stylesheet; holds the reduced-motion block and the
  disclosure animation

**The global reduced-motion block** (`app/globals.css:540-550`):

```css
/* Every animation gets a reduced-motion path — including opacity fades. */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
```

Note the selector list: `*`, `*::before`, `*::after`. No `::details-content`.

**The false claim** (`app/globals.css:611-612`, the last lines of the
disclosure's doc comment):

```css
 * The reduced-motion block above flattens the duration to 0.01ms, so this needs
 * no separate opt-out. */
```

**The animation it is wrong about** (`app/globals.css:613-628`):

```css
[data-slot="disclosure"] {
  interpolate-size: allow-keywords;
}

[data-slot="disclosure"]::details-content {
  height: 0;
  overflow: hidden;
  transition:
    height 200ms cubic-bezier(0.32, 0.72, 0, 1),
    content-visibility 200ms cubic-bezier(0.32, 0.72, 0, 1);
  transition-behavior: allow-discrete;
}

[data-slot="disclosure"][open]::details-content {
  height: auto;
}
```

**The chevron that does get flattened**
(`components/channels/connection-strip.tsx`, inside the `<summary>`):

```tsx
          <HugeiconsIcon
            aria-hidden="true"
            icon={ArrowRight01Icon}
            // Same 200ms and same curve as the panel it points at — they are
            // one gesture, and paired elements that disagree on timing read as
            // broken. It was 150ms against a panel that did not animate at all.
            className="size-3.5 transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] group-open:rotate-90"
          />
```

**The element carrying the slot** (same file):

```tsx
      <details data-slot="disclosure" className="group pt-3">
```

### The rule this must satisfy

From `AGENTS.md`:

> **No `transition-all`.** Name the properties. Interactive state uses CSS
> transitions so a reversed toggle retargets instead of restarting; reserve
> keyframes for one-shots. **Every animation needs a `prefers-reduced-motion`
> path.**

### Repo conventions to match

- Comments in `app/globals.css` are prose paragraphs explaining *why*, often
  several sentences. The disclosure block above is the model — match that
  density, and correct rather than delete the wrong sentence.
- The file already has a precedent for a pseudo-element needing its own
  reduced-motion handling; the block at `app/globals.css:550+` continues past
  the universal selector with additional targeted rules.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 (one pre-existing error in `hooks/use-mobile.ts` is expected — see STOP conditions) |
| Unit tests | `pnpm test` | all pass |
| Format | `npx prettier --write app/globals.css` | exit 0 |

**Never run `pnpm build`** (a dev server may share `.next`) and **never run
`pnpm format`**.

CSS is not typechecked, so verification for this plan is primarily `grep` plus
a manual browser check (Step 3).

## Scope

**In scope**:

- `app/globals.css`

**Out of scope** (do NOT touch):

- `components/channels/connection-strip.tsx` — the chevron is already correct;
  it is flattened by the global block because it is a real element.
- The decision to animate `height`. It is a documented, knowing tradeoff (the
  panel must push content below it down, and a transform would slide over that
  content instead). Do not replace it with a transform.
- The global reduced-motion block's universal selector. Do not try to make `*`
  match pseudo-elements — it cannot, and widening it would be guesswork.
- Any other animation in the file.

## Git workflow

- Branch: `advisor/015-disclosure-reduced-motion`
- Conventional-commit style, lower-case imperative subject. Example from
  `git log`: `feat: let the disclosure open instead of appearing`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Give the pseudo-element its own reduced-motion rule

Add a rule targeting `::details-content` inside the existing
`@media (prefers-reduced-motion: reduce)` block at `app/globals.css:541`.
Place it after the universal-selector rule, before the block closes.

```css
  /* `*` matches elements, not `::details-content` — and `transition-duration`
     does not inherit, so the universal rule above cannot reach the disclosure
     panel. Without this the chevron (a real element, so flattened) snaps while
     the panel it points at still animates its height for 200ms, which is the
     mismatched pair the animation was added to prevent, delivered only to the
     people who asked for less motion. */
  [data-slot="disclosure"]::details-content {
    transition-duration: 0.01ms !important;
  }
```

**Verify**: the new rule must sit INSIDE the reduce block. Check with:

```
grep -n "details-content\|prefers-reduced-motion" app/globals.css
```

The `@media (prefers-reduced-motion: reduce)` line must appear BEFORE your new
`[data-slot="disclosure"]::details-content` selector, and that selector must
come before the block's closing brace. Do not count total occurrences — the
doc comment mentions `::details-content` three times in prose, so a raw count
is 7 after this change, not 3.

### Step 2: Correct the comment that says this was unnecessary

Replace the final two lines of the disclosure's doc comment
(`app/globals.css:611-612`):

```css
 * The reduced-motion block above flattens the duration to 0.01ms, so this needs
 * no separate opt-out. */
```

with:

```css
 * Reduced motion needs its own rule up in the reduce block, and this is the
 * trap: the universal selector there matches elements, not `::details-content`,
 * and `transition-duration` does not inherit — so the global flattening does
 * not reach this transition. An earlier version of this comment claimed it did.
 * The visible symptom was the chevron snapping while the panel kept animating,
 * for exactly the users who had asked for neither. */
```

**Verify**: `grep -c "so this needs" app/globals.css` → `0` (the wrong claim is
gone).

### Step 3: Confirm it in a browser

This is a CSS change, so no automated gate proves it. Check by hand.

1. Start the dev server if one is not already running: `pnpm dev`
2. Open `/channels/linkedin` (or any channel with a connection, so the
   "Manage connection" disclosure renders).
3. Enable reduced motion at the OS level:
   - macOS: System Settings → Accessibility → Display → **Reduce motion** on
   - Or in Chrome DevTools: Command menu (Cmd+Shift+P) → *"Emulate CSS
     prefers-reduced-motion: reduce"*
4. Toggle the "Manage connection" disclosure open and closed.

**Verify**: with reduce on, the panel opens **instantly** and the chevron turns
instantly — the two move together. With reduce off, both animate over 200ms and
still move together. The failure you are looking for is the panel gliding while
the chevron snaps.

If no connection exists to render the disclosure, say so in your report and
verify instead by inspecting the computed `transition-duration` on
`::details-content` in DevTools with reduce emulated — it must read `0.01ms`.

### Step 4: Format and final check

```
npx prettier --write app/globals.css
pnpm typecheck && pnpm test
```

**Verify**: typecheck exit 0, tests pass. Prettier may reflow the CSS — check
`git diff` to confirm it only touched formatting of your addition.

## Test plan

There is no CSS test infrastructure in this repo and adding one is out of scope.
Verification is:

- **Structural** (automated): `grep` counts in the Done criteria confirm the
  rule exists and the wrong comment is gone.
- **Behavioural** (manual): Step 3's browser check with reduced motion emulated,
  which is the only way to observe the property this plan is about.

`pnpm typecheck` and `pnpm test` must still pass, though neither exercises CSS —
they are here to confirm nothing outside scope was touched.

## Done criteria

ALL must hold:

- [ ] `grep -c "details-content" app/globals.css` returns `7` (2 selectors that already existed, 1 new selector, 1 comment line in the new rule, 3 prose mentions in the doc comment)
- [ ] `grep -c "so this needs" app/globals.css` returns `0`
- [ ] The new rule sits **inside** the `@media (prefers-reduced-motion: reduce)` block — confirm by reading `app/globals.css` around line 541 and checking the closing brace comes after your addition
- [ ] Step 3's browser check passes, or its DevTools fallback shows `0.01ms`
- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0
- [ ] `git status --short` shows only `app/globals.css` modified
- [ ] `advisor-plans/README.md` status row for 015 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" do not match the live code.
- `pnpm lint` reports any error **other than** the known pre-existing one in
  `hooks/use-mobile.ts` (`react-hooks/set-state-in-effect`). That one is not
  yours and is not in scope; anything else is.
- You cannot place the new rule inside the reduce block without restructuring
  it — report rather than reorganising the block.
- The browser check shows the panel still animating with reduce on. That means
  specificity or ordering is defeating the rule; report what the computed style
  says rather than escalating with more `!important`.
- You are tempted to change the animation from `height` to a transform. That
  tradeoff was made deliberately and is out of scope.

## Maintenance notes

- **The trap to remember**: the global `*, *::before, *::after` reduce block
  does not cover pseudo-elements outside those two. Any future animation on
  `::details-content`, `::backdrop`, `::marker`, or a view-transition
  pseudo-element needs its own rule in the reduce block. A reviewer should
  check for that whenever a new pseudo-element transition appears.
- If the disclosure is ever rebuilt on a JS component instead of native
  `<details>`, this rule becomes dead and should be deleted with it.
- Deliberately deferred: auditing the rest of `app/globals.css` for other
  pseudo-element animations the global block misses. This plan fixes the one
  found on this branch; a sweep of the whole file is separate work.

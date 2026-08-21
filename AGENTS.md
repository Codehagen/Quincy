<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Quincy

An AI agent that acts as Head of Content: you give it raw material, it drafts in
your voice, schedules and publishes. The chat is the primary interface; the pages
are windows onto the same agent state.

## Why, before how

`docs/vision.md` is the argument this file is downstream of. Read it before any
decision about what to build — the rules below say how Quincy should look and
behave, and none of them tell you whether a feature should exist.

Three positions from it decide roadmap questions and are easy to get wrong by
building the obvious thing:

- **Feeds are interest-based.** A post lives or dies on its own merit, not on
  follower count. Every number in the product is stated against the user's own
  baseline; a follower chart is a vanity number with a story attached.
- **Depth is weighted above Volume**, even though Volume demos better. Views are
  rented and relationships are owned, so the job is converting attention into a
  person — drafting a reply to everyone, knowing who keeps showing up.
- **Quincy drafts, you send.** It publishes in your name. Autoposting without
  approval would be a decision made on purpose, never a default that arrives.

The same document lists what we deliberately do not build: a dashboard, a
thousand faceless accounts, follower charts. If a plan proposes one of those,
the plan is answering the wrong question.

## Stack

`pnpm` · Next.js 16 (App Router, RSC) · Tailwind v4 · shadcn `base-nova` on Base UI

## Non-negotiables

**Icons are `hugeicons`, never `lucide`.** Import from `@hugeicons/react` +
`@hugeicons/core-free-icons` and render with `<HugeiconsIcon icon={X} />`. Never
mix two icon libraries on one surface — stroke weights and corner radii diverge
and the mismatch compounds across a card grid.

**Base UI, not Radix.** Use `render` for custom triggers, not `asChild`. Switches
expose `data-checked` / `data-unchecked`.

**Colour comes from the ramps, never raw values.** `--brass-*` and `--sand-*` share
one hue (H 70) with evenly spaced lightness; chroma is a fraction of each step's
own sRGB ceiling. Semantic tokens point at ramp steps. If a pair fails contrast,
move **L only** — chroma and hue carry the colour's identity.

**Brass means one thing: live — and nothing is a brass fill.** `--signal*` is
reserved for "this ritual is running". Brass appears as a dot, a label, a chart
mark or a text selection; it is never a surface you press. `--primary` is a
neutral extreme — near-black in light, near-white in dark — because the primary
fill is Approve, the most repeated control in the product, and because
`--primary` and `--signal` holding the same value meant live signalled nothing.
Menu and list hovers stay neutral too (`--accent` is a sand step on purpose).
`docs/colour.md` is the argument, including the four palettes that lost.

Two corollaries, both learned by breaking them:

- **Never borrow `--primary-foreground` for anything that is not on `--primary`.**
  It flips between modes and `--signal` does not. Text on a signal fill takes
  `--signal-on`.
- **Hover on a filled control is `--primary-hover`, never an alpha.** An alpha
  moves a light fill a little and a near-black one three times as far, toward
  the page — which reads as disabled. `--primary-hover` mixes toward
  `--background`, so it self-corrects in both modes.

**No `transition-all`.** Name the properties. Interactive state uses CSS
transitions so a reversed toggle retargets instead of restarting; reserve
keyframes for one-shots. Every animation needs a `prefers-reduced-motion` path.

**Depth comes from the elevation tokens, not borders.** Each stack opens with a
1px spread ring. In dark mode every stack collapses to a single white ring —
stacked shadows are invisible against a dark ground.

**Derive nested radii.** `inner = outer − padding`. A `rounded-xl` card (20px)
with 16px padding takes `rounded-xs` (4px) children.

## Touch and accessibility

Four project-wide defaults live **unlayered** at the bottom of `globals.css` —
unlayered CSS is the only thing that beats a utility class in Tailwind v4. Don't
move them into `@layer base`; they stop working.

- `touch-action: manipulation` on controls — kills the 300ms tap delay and
  double-tap zoom. Without it every button feels a beat behind on mobile.
- A 16px font-size floor on `input`/`textarea`/`select` under 768px, so iOS
  never zooms the page on focus. Never patch this with `maximum-scale=1`.
- `[data-slot="switch"]::after` widened under `@media (pointer: coarse)` —
  the small switch is 24×14px and its default hit area falls under 44px.
- `[data-slot="button"]::after` as a 44px-tall box centred on the button, also
  under `@media (pointer: coarse)`. The default button is 32px and `xs` is 24px.
  Height-agnostic so one rule covers every size variant; vertical only, because
  buttons sit side by side more often than they stack and growing the width is
  what would make two hit areas overlap. `relative` lives in `button.tsx` rather
  than here — unlayered it would beat the `absolute` on Dialog's and Sheet's
  close buttons.

Per component:

- **Tap targets are ≥44px.** Visual size may be smaller; the hit area may not.
  Grow it with a pseudo-element so nothing reflows.
- **Icon-only buttons need `aria-label`.** Icons sitting beside their own label
  are decorative — mark them `aria-hidden` instead of announcing them twice.
- **Never hardcode `⌘`.** Read the platform after mount so server and client
  markup agree, and fall back to `Ctrl`. Handlers accept both modifiers; only
  the hint has to choose.
- **Hover enhances, never enables.** Nothing may be reachable by hover alone.
  Tailwind v4's `hover:` already gates on `@media (hover: hover)`.
- **Tooltips** are wired globally in `layout.tsx` with `delay={200}`
  `timeout={300}`. The timeout is the warm state: after one tooltip opens,
  neighbours open instantly, so moving down a list doesn't stutter. A tooltip
  must carry information not already on screen — it is not a place for a label.

## Destructive actions

Use `<HoldToConfirm>`, not a confirmation dialog. A dialog is two clicks where
the second becomes reflex; a hold makes the confirmation *part of the action*
and cancelling is just letting go. 1200ms is the calibrated default — don't
change it per call site without a reason.

Four things in it are load-bearing; leave them alone:

- **Progress runs on `requestAnimationFrame`, not a CSS transition.** A
  transition collapses to zero under `prefers-reduced-motion`, which would fire
  the action the instant the button was touched.
- **The hold resumes, it does not restart.** `startT = now − lastP × holdMs`,
  so pressing again while the fill is draining picks up from where the fill
  actually is. Animating from the presentation value rather than the target is
  what makes an interrupted gesture feel continuous.
- **`touchAction: "none"` on the button**, stronger than the global
  `manipulation` — otherwise a hold begun on a scrollable page gets stolen by
  a pan.
- **Keyboard parity.** Space and Enter start and release the hold, and `onBlur`
  releases it. Hold gestures are usually built mouse-only; that removes the
  action for keyboard users entirely.

`onConfirm` may be async and may throw — a throw returns the button to idle so
the action can be retried. `AlertDialog` stays installed for anything genuinely
irreversible that a hold cannot express.

## There is one database

`quincy` on Neon (`winter-grass-66812609`) has a **single branch**, `main`.
`.env.local` and Vercel's production `DATABASE_URL` point at the same one.
There is no staging and no dev copy.

So: a migration run locally *is* the production migration, `drizzle-kit push`
from a laptop rewrites production's schema, and every `scripts/verify-*.ts`
runs against real rows. That is why those scripts are guarded on the
`@quincy.test` address rather than on `NODE_ENV` — the environment cannot tell
you anything, only the target can. Never relax that guard.

This is stated again under "Signing in locally", where it explains why
`dev-account.ts` refuses any other address. It is repeated here because it is
the fact most likely to be missed by someone reading for something else, and
the consequence of missing it is a production write nobody intended.

## Money

Every code path that spends — a model call, an X read, a publish — needs a
**ceiling** and, if a human can trigger it, a **cooldown**. Both, not either.
`docs/billing.md` covers who is allowed to spend; this is about how much.

- **A ceiling bounds what one run buys**, and it counts the thing being bought
  rather than the thing being kept. Those are different numbers, and conflating
  them is exactly how `collectBookmarks` shipped with `maxPosts` limiting the
  rows it stored while nothing limited the pages it paid for.
- **A cooldown bounds how often a person can trigger it.** A claim is not a
  cooldown: a claim stops two runs overlapping and is released the moment one
  ends, so a button guarded only by a claim can be pressed all afternoon.
  `IMPORT_COOLDOWN_MS` and `MANUAL_RUN_COOLDOWN_MS` are the shape.
- **Meter it through `usage_event`.** Non-model spend uses the `model` column as
  a label (`x:read`, `x:post`, `x:bookmark-read`) so /credits can say where the
  money went.

**A comment explaining why a guard is unnecessary is the smell this section
exists for.** Both cost bugs in PR #21 were introduced that way — the prose was
persuasive and wrong in the same commit. If the argument is genuinely right,
write the guard anyway; it is cheaper than the review that finds out.

The one path that has no aggregate ceiling yet is the rhythm dispatcher, which
is the first thing in the product that spends on a schedule with nobody
present. Per-run costs are capped; a per-user daily total is not. See the
follow-ups in plans/016.

## Forms

Follow `FieldGroup` + `Field`; never a raw `div` with `space-y-*`. Wrap in a real
`<form>` so Enter submits, and add ⌘/Ctrl+Enter for textareas. Validate on blur,
then on change once an error has shown — reward early, punish late. Errors render
next to their field, never as a summary. Submit buttons disable and change label
while pending. Destructive actions get a confirmation and sit away from the
confirm button.

## The two type systems

| | Use | Where |
| --- | --- | --- |
| Role scale (`text-body`, `text-caption`, `text-card-title`, `text-section`, `text-display`, `text-eyebrow`) | App chrome | Cards, rows, buttons, sidebar, forms |
| `.typeset` + preset | Rendered markdown | Brain (`/brain`), streaming agent replies (`/riffs`, `/studio`) |

Never put `text-*` utilities inside a `.typeset` container — two rhythm systems
would compete for the same paragraph.

Typeset is installed: `app/typeset.css` is generated and imported from
`app/globals.css`. Regenerate it wholesale at `ui.shadcn.com/typeset` rather
than editing it — the `.typeset-chat` / `.typeset-wiki` presets and the
`--font-heading` alias live in `globals.css` precisely so the generated file
stays replaceable.

Render markdown through `components/ui/markdown.tsx`, never `ReactMarkdown`
directly. It owns the typeset container and the preset choice, and it
deliberately does not enable `rehype-raw`: half of what the brain renders is
written by Heartbeat, and raw HTML would make a compiled memory page an
injection surface.

Markdown means markdown. A single newline folds into the paragraph above it,
so anything seeded or generated for a prose page separates paragraphs with a
blank line. `remark-breaks` is deliberately not installed — turning soft wraps
into hard ones would make the model's own output render differently from what
it wrote.

Use `@tailwindcss/typography`'s `prose` for this instead and streaming will
visibly reflow: its `:last-child` rules restyle earlier blocks as new ones
arrive. Typeset's append-stability contract is the reason it was chosen.

## Signing in locally

Sign-in requires a verified email, and verification is a real Resend delivery.
For a person that is fine — the mail arrives. For a test account it is not: they
live at `@quincy.test`, which is not a domain, so the mail lands nowhere and the
account can never be used.

Do not relax `requireEmailVerification` in development. It is the newest flow in
the app and the least exercised, and switching it off locally means the first
person to run it for real is a stranger. Auth should behave the same everywhere.

Use the account instead:

```
npx tsx --env-file=.env.local scripts/dev-account.ts
```

Idempotent. Creates `dev@quincy.test` verified, or repairs it if the credential
row is missing — which is what the `verify-*.ts` scripts leave behind, since
their teardown deletes what they touched and a user with no credentials exists
but cannot log in. Credentials come from `DEV_ACCOUNT_EMAIL` and
`DEV_ACCOUNT_PASSWORD` in `.env.local`; the password is deliberately not
defaulted, so the script cannot run by accident.

It refuses any address outside `@quincy.test`. It sets `emailVerified` and knows
a password, which against a real address is an account-takeover primitive, and
the dev database is the same Neon branch as everything else — so the guard is on
the target rather than on the environment.

Rate limiting is real (`/sign-in/email` is 5 per 60s, `/sign-up/email` is 3).
Repeated sign-in attempts from a script will hit it, and the limiter answers
**429** — not a bug, and not the same failure as the other two. An unverified
account is **403** with `code: "EMAIL_NOT_VERIFIED"`; a wrong password is
**401** with `code: "INVALID_EMAIL_OR_PASSWORD"`. The status alone identifies
which one you are looking at. A 429 body carries **no `code` field**, which is
why client code has to branch on status for that case rather than on code.

A real person who loses the link is not stuck. Signing in with the right
password against an unverified account, and signing up at all, both land on a
resend affordance (`components/auth/resend-verification.tsx`) that calls
`/send-verification-email` — limited to 3 per 60s, the same as the other
unauthenticated sender. Two things about that endpoint are load-bearing and
should not be "improved": it answers `{ status: true }` for an unknown or
already-verified address behind a 500ms constant-time floor, so the UI can
confirm a send without becoming an oracle for who has an account; and
`sendOnSignIn` stays unset, because sending on every failed sign-in is a
mail-bomb primitive aimed at whoever owns the address.

Run `npx tsx --env-file=.env.local scripts/verify-auth-recovery.ts` whenever
`lib/auth.ts` or `components/auth/**` changes — it asserts the sign-in and
resend status codes above against the real pipeline, rate limiter included.

Signup returns `token: null` under `requireEmailVerification`, so there is no
session to redirect with — the form shows "check your inbox" rather than
pushing to `/studio`. It also answers a duplicate signup with a *synthetic*
success instead of an error, which is why nothing reports "that address is
taken": the response is deliberately indistinguishable.

Rate limiting keys each bucket as `${clientIP}|${path}`, and better-auth
resolves that IP from `x-forwarded-for` by default. Measured against
production on 2026-08-03: Vercel sends a single-value `x-forwarded-for`, so
resolution succeeds and every user gets their own bucket. This is worth
re-checking if the deployment target or proxy chain ever changes — a
multi-value `x-forwarded-for` (e.g. behind an added proxy) resolves to `null`
rather than trusting an entry, which collapses everyone into one shared
per-path bucket (not the same as `x-real-ip`, which better-auth is not
configured to read here). This is invisible in `pnpm dev`, since
`isDevelopment()` short-circuits to `127.0.0.1` locally regardless of
headers. Also: `rateLimit.customRules` keys must be real better-auth route
paths — an unmatched key is not an error, it is simply never applied, and the
endpoint's built-in default quietly takes over instead (this is how a stale
`/forget-password` rule survived unnoticed for a path that is actually named
`/request-password-reset`).

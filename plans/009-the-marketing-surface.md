# Plan 009: The marketing surface

> **Executor instructions**: Read the whole plan before starting. The phases are
> ordered by what a stranger hits first, not by effort. Phase 1 is the one that
> is actively costing something today and should land alone. Run every
> verification step. If anything in "STOP conditions" occurs, stop and report.
>
> **Not an `/improve` artifact.** `plans/README.md` describes a billing audit;
> this is a design plan written against the `marketing-pages` and
> `design-foundations` skills, filed here because `plans/` is where feature
> plans already live (see `005-connect-x-and-linkedin.md`).
>
> **Drift check (run first)**:
>
> ```bash
> git diff --stat a3ca175..HEAD -- "app/(marketing)" app/layout.tsx proxy.ts
> grep -n "metadata" app/layout.tsx
> ls app/sitemap.ts app/robots.ts app/opengraph-image.tsx 2>/dev/null
> ls public/
> ```
>
> Expected: no `metadata` export in `app/layout.tsx`, none of those three files,
> and `public/` empty but for `.gitkeep`. If any exists, someone has started
> this work — STOP.

## Status

- **Priority**: P1 (Phase 1–2) · P2 (Phase 3–4) · P3 (Phase 5)
- **Effort**: L overall — S/M per phase, each independently shippable
- **Risk**: LOW. Nothing here touches auth, billing, publishing or the brain.
  The one exception is Phase 1's route-gating change, called out in its own
  STOP conditions.
- **Depends on**: nothing in code. Phase 4 is blocked on a human decision about
  pricing disclosure; Phase 5 on a legal entity name.
- **Category**: feature + design
- **Planned at**: commit `a3ca175`, 2026-08-04

### Progress

| Phase | Title | Priority | Effort | State |
| --- | --- | --- | --- | --- |
| 1 | Make the link unfurl | P1 | M | **DONE** — `b537db5`. 1.4 withdrawn, see below |
| 2 | Let a stranger read the argument | P1 | S | **DONE** |
| 3 | Show the product instead of describing it | P2 | M | TODO |
| 4 | A pricing page, because $49 is currently a surprise | P2 | M | TODO |
| 5 | Changelog with RSS | P3 | M | TODO |

---

## What the audit found

The good news first, because it is unusual: **there is nothing to remove.** The
`marketing-pages` skill is mostly a list of things not to do — scroll-triggered
fade-ups, parallax, auto-advancing carousels, scroll hijacking, ungated intro
animations, request-time content fetching, nav submenus that only exist on
hover. The current landing page does none of them. It is 80 lines, three claims
and one action, and the comments in it already argue for the 55ch cap and the
`text-balance` choice on the headline.

So this plan is not a cleanup. Every finding below is an **absence**.

| Before | After | Why |
| --- | --- | --- |
| No `metadata` export in `app/layout.tsx` at all | `metadataBase`, `title.template`, default `openGraph` and `twitter` | A product that publishes to X and LinkedIn currently unfurls on X and LinkedIn as a bare grey rectangle |
| `public/` holds only `.gitkeep` | An `opengraph-image` route and a favicon set | There is no share image because there is no image |
| No `robots.ts`, no `sitemap.ts` | Both, with `/prototypes` excluded | `/prototypes/*` sets `robots: {index: false}` per page — a sitemap and a robots file make that a policy rather than eight repetitions |
| `/why` redirects strangers to `/login` | Public | `docs/vision.md` is the single most persuasive asset in the repo and only paying customers can read it |
| ~~The marketing layout `await`s `getSession()`~~ | ~~Suspense boundary~~ | **Withdrawn.** Measured: signed-out visitors never query at all, and the cookie cache covers most signed-in ones. Suspense made it slower. See 1.4 |
| Landing page title is a bare string | Composed from the root template | `/why` currently renders `<title>Why Quincy works this way</title>` with no brand anywhere in it |
| Three text claims, no artefact | One code-built proof of a draft | "It writes like you" is a claim about output; the page shows no output |
| Footer: one Privacy link | Privacy, Terms, contact | We charge $49/month with no terms of service |
| Pricing is undiscoverable pre-signup | A pricing page | The trial is 24 hours and starts at verification — a visitor who wants to know the price has to spend part of the thing they are evaluating to find out |
| `--text-display` is a fixed 2.5rem | A marketing-only fluid display step | 2.5rem is a card-heading size on a 27" display; the app's role scale is app chrome and should not be bent to serve a hero |

### What is already right — do not "fix" these

Listed so a later pass does not undo them:

- **No motion at all on the landing page.** Nothing to gate behind
  `sessionStorage`, nothing that moves without input. If a hero animation is
  ever added, the skill's rule applies: `sessionStorage`, not `localStorage`.
- **Fonts are correct.** `next/font` self-hosts Geist as woff2 and generates a
  metric-matched fallback (`app/layout.tsx` says so). It already emits the
  preload links. Do not hand-add `<link rel="preload">` for fonts.
- **The CTA already knows who is looking** (`app/(marketing)/layout.tsx:39`) —
  "Open Studio" signed in, "Get started" signed out, never both. Phase 1 must
  preserve this behaviour exactly while changing how it is computed.
- **`proxy.ts` deliberately does not bounce signed-in visitors off `/`** — the
  comment explains why, and it is right.
- **The hero copy is capped at 55ch and the headline balances.** Both are
  deliberate and both are correct.
- **The nav has no submenu**, so the "submenu content lives in the DOM even
  when closed" rule does not bite yet. It will the day a "Product" dropdown
  appears — visually hidden, never conditionally mounted.

---

## Phase 1 — Make the link unfurl, and make `/` static

**Priority P1. Effort M. This is the phase with a cost attached today.**

Two problems that share one file.

### 1.1 Root metadata

`app/layout.tsx` exports no `metadata`. Add one, and it has to carry:

- **`metadataBase`** — without it, every relative OG image URL resolves to
  nothing in production and Next logs a warning nobody reads. Source it from
  `VERCEL_PROJECT_PRODUCTION_URL` with a localhost fallback, not a hardcoded
  domain.
- **`title.template`** — `"%s — Quincy"` with a default of the full positioning
  line. The landing page's own `metadata.title` then becomes the absolute
  override it already is, and `/why` stops being brandless.
- **`openGraph` and `twitter`** defaults — `type`, `siteName`, `locale`, card
  type `summary_large_image`.

Read `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md`
before writing this. Do not write it from memory; AGENTS.md opens with a warning
that this is not the Next.js in your training data.

### 1.2 The share image

`public/` is empty. Generate the OG image at build time from an
`app/opengraph-image.tsx` rather than committing a PNG — the wordmark and the
positioning line will change and a committed PNG will not.

Design it from the same tokens as the app: `--sand-*` ground, the brass mark,
the display line, nothing else. The `design-foundations` restraint rule applies
hardest here, because an OG card is 1200×630 of pure temptation.

**Constraint**: the OG image route runs in an isolated context and cannot read
`app/globals.css`. The OKLCH ramp values will have to be repeated inline. That
is the one place in this repo where a raw colour value is acceptable — annotate
it with a pointer back to the `@theme` block so the next person knows to keep
them in step.

### 1.3 `robots.ts` and `sitemap.ts`

Both as route files. `robots.ts` disallows `/prototypes`, `/api`, and every
`(app)` path; `sitemap.ts` lists the public set — which after Phase 2 is `/`,
`/privacy`, `/why`, and after Phase 4 `/pricing`.

The eight per-page `robots: { index: false, follow: false }` exports under
`app/prototypes/` stay. Belt and braces is correct for a surface that would
embarrass us in a search result.

### 1.4 Make `/` static — WITHDRAWN, the premise was wrong

**Do not do this. Measured and closed 2026-08-04.**

The claim was that `app/(marketing)/layout.tsx:16` makes every stranger's first
page load wait on a Neon round trip to choose between two button labels, and
that a Suspense boundary around the header's auth slot would take that off the
critical path. The first half is false, so the second half buys nothing.

**A signed-out visitor never touches the database.** `getSession` reaches
better-auth's session route, which returns at
`node_modules/better-auth/dist/api/routes/session.mjs:45` —
`if (!sessionCookieToken) return null` — before the adapter call at line 180.
No cookie, no query.

**A signed-in visitor usually doesn't either.** `lib/auth.ts:268` enables
`cookieCache` with a 5-minute `maxAge`, so the session is read out of the cookie
without a query. The round trip happens once per five minutes per user, not once
per visit.

Measured against a production build, six runs each, signed out:

| | TTFB | Total |
| --- | --- | --- |
| `await` in the layout (current) | ~5.8ms | ~6.5ms |
| Suspense boundary | ~8.7ms | ~9.5ms |

The Suspense version was consistently **slower**, by roughly the cost of opening
a stream for a boundary with no work to hide. With a real session cookie it was
~6ms either way, because the cookie cache meant there was still no query.

`/` stays `ƒ` in the build output under both, and it will until `cacheComponents`
is enabled — Suspense alone does not prerender a shell. The route is dynamic
because `headers()` is read, and the fix for *that* is a config flag with an
app-wide blast radius, not a boundary.

**What is still true**: `/` is server-rendered per request rather than served
from a CDN. That is a real difference and it is worth revisiting **as part of a
`cacheComponents` migration**, where the Suspense boundary becomes mandatory
rather than optional (see
`node_modules/next/dist/docs/01-app/02-guides/migrating-to-cache-components.md`)
and the shell genuinely prerenders. Doing the refactor now, in advance of that
decision, is structure taken on credit against a migration nobody has committed
to — and it costs 3ms on the common path in the meantime.

Run 3's audit reached the same verdict about `/privacy` from a different angle
and filed it under "true, low value". That judgment was right, and it carries to
`/` after all.

**Done when**

- `curl -s localhost:3000 | grep -c "og:image"` returns 1
- The production URL renders a card in X's and LinkedIn's own post composers.
  Not a validator — the actual composer, because that is the surface we are
  claiming to be good at.
- `/why` and `/privacy` both render titles ending in "— Quincy"
- `/sitemap.xml` and `/robots.txt` both respond 200 and contain no
  `/prototypes` path

---

## Phase 2 — Let a stranger read the argument

**Priority P1. Effort S. The cheapest win in this plan.**

`app/(app)/why/page.tsx` renders `docs/vision.md` and redirects anyone without a
session to `/login`. That document is 208 lines of the clearest argument this
product has — the 300,000-against-9.4-million number, the rented-versus-owned
distinction, and an explicit list of what we refuse to build. It is the reason
someone would choose this over a scheduling tool, and it is behind the paywall.

Move it out. Three edits:

1. Move the route to `app/(marketing)/why/page.tsx` and drop the `redirect`.
2. Add `/why` to the `PUBLIC` set in `proxy.ts`, with a comment in the register
   of the ones already there.
3. ~~Update `outputFileTracingIncludes` in `next.config.ts`~~ — **this warning
   was wrong.** The key *is* the route path, and a route group is not part of the
   route path, so `/why` stays `/why` and the existing key keeps working
   untouched. Verified against a production build. The underlying risk is real
   (`docs/vision.md` lives outside `app/` and 500s if untraced), which is why the
   `pnpm build && pnpm start` check below still matters — it just was not
   triggered by this move.

Keep the user-menu link and the `/rhythm` footer link pointing at `/why`. The
route does not change, only who may see it.

Then add it to the landing page and the footer. The landing page's closing move
today is a grid of three claims and nothing after it. "Why Quincy works this
way" is a better last line than a dead end.

**One design note.** `/why` renders through `.typeset-wiki` at 65ch, which is
correct for prose and settled. Do not restyle it into a marketing page. The
argument is more persuasive as a document than as a landing section — its
credibility comes from reading like something written for ourselves.

Add `text-wrap: balance` to headings in the typeset presets, per the skill's
blog-and-changelog rule. This one CSS declaration covers `/why`, `/privacy`,
and every future long-form page.

**STOP conditions**

- If `docs/vision.md` contains anything not intended for strangers, stop and
  report before publishing it. Read it end to end first. It cites competitors
  by name and states where we disagree with them; that is a feature, but it is
  a decision someone should make deliberately rather than inherit from a file
  move.

**Done when**

- A signed-out `curl -sI localhost:3000/why` returns 200, not 307
- `pnpm build && pnpm start` serves `/why` — this is the check that catches a
  tracing mistake; `pnpm dev` will not

**What it cost, recorded because the plan did not predict it**: `/why` now
renders in the marketing chrome for signed-in users too — no sidebar, and the
header shows "Open Studio" instead. That follows from leaving the `(app)` group
and is the price of one copy of the page rather than two. Judged acceptable: it
is a document reached from a menu, read once, and recovery is one click. If it
ever grates, the fix is a second route rendering the same source, not a second
copy of the source.

---

## Phase 3 — Show the product instead of describing it

**Priority P2. Effort M. The largest design decision in the plan.**

Three claims, all of them assertions:

> It knows how you write · It learns while you work · It never makes anything up

Each is true and none is demonstrated. `design-foundations` puts it as
*specific beats generic*; `marketing-pages` puts it as *show what the code
produces, don't just describe it*. The rule is written for docs and it applies
doubled here, because the entire proposition is about the quality of an output.

**Build the proof from DOM elements, not a screenshot.** A screenshot goes stale
the day the UI changes, needs an intrinsic size to avoid layout shift, and
cannot be read by a crawler. A code-built illustration using the real
`components/drafts` and `components/riffs` primitives stays honest by
construction — when the draft card changes, the landing page changes.

The skill's three requirements are non-negotiable:

```jsx
<div
  role="img"
  aria-label="A draft Quincy wrote, with the source it came from"
  style={{ userSelect: "none", pointerEvents: "none" }}
>
```

`pointerEvents: "none"` because it is a picture of a control, not a control.
Nothing kills trust faster than a button on a landing page that does nothing.

**What to show — one artefact, not three.** The strongest is the pair the
product is actually about: a piece of raw material on the left, the draft
Quincy made from it on the right, and the provenance line connecting them. That
single image proves claim one and claim three at once, and it is the thing no
competitor's landing page shows, because per `docs/vision.md` "nobody shows
lineage; everybody shows a calendar."

**Content, not lorem.** Write one real example and keep it in a module beside
the page. Fake copy in a product demo reads as fake instantly.

### The display type question

`--text-display` is 2.5rem fixed. That is a role-scale token and AGENTS.md is
explicit that the role scale is app chrome — cards, rows, buttons, sidebar,
forms. A hero headline is not chrome.

Do not change the token. Add a marketing-only step with a `clamp()`, defined
next to the `@theme` block with a comment saying why it is separate. The app's
`text-display` keeps its meaning; the landing page gets a size that works from
375px to 2560px.

**STOP conditions**

- If the illustration cannot be built without importing something from
  `app/(app)`, stop. The marketing group deliberately does not reach into the
  app shell (`app/(marketing)/layout.tsx` opens by saying so). Lift the shared
  piece into `components/` first, as its own commit.
- If it needs an animation to be legible, it is the wrong illustration.

**Done when**

- The section renders identically with JavaScript disabled
- No layout shift on load — measure, do not assume
- `prefers-reduced-motion` is irrelevant because nothing moves. If that stops
  being true, the reduced-motion path is required (AGENTS.md non-negotiable)

---

## Phase 4 — A pricing page

**Priority P2. Effort M. Blocked on one decision.**

`docs/billing.md`: one day free, then $49/month, no card until the day is over.
That is a genuinely good offer and the landing page never mentions it.

The problem is sharper than a missing page. The trial is **24 hours** and starts
at email verification. A visitor who signs up to find out the price has spent
part of the trial finding out the price. The skill's *CTAs know who's looking*
rule generalises: the page should answer the question the visitor came with,
and after "what is it" the question is always "what does it cost".

Every claim on the page comes from `docs/billing.md` and `lib/` — not from
marketing instinct. Same discipline the privacy page already holds itself to:
if the scope list changes, the page changes in the same commit.

Three things the page must be honest about, because the code is:

- The free day starts at **verification**, not at signup. Say so.
- When it ends, the account goes **read-only** — work is not deleted, not
  locked. That is a reassurance and it is currently a secret.
- Stripe sees nothing until someone pays. "No card required" is literally true
  here and most products saying it are lying.

**The decision needed before this ships**: is $49/month the public number? Once
it is on a page it is quotable, screenshottable, and awkward to move. If there
is any chance of it changing in the next quarter, ship the page without the
number and with a "what you get" list instead — worse for conversion, better
than a public price you have to walk back.

**Design notes**

- One plan means no pricing table. A pricing table with one column is a table
  apologising for itself. A single card, the number, what is included, one CTA.
- The number takes `font-variant-numeric: tabular-nums` — `design-foundations`
  is explicit that price figures do.
- The CTA is auth-aware, same as the header: a paying customer reaching
  `/pricing` gets "Manage billing", not "Get started".
- One primary action on the page. The FAQ links are text links, not buttons.

**STOP conditions**

- If any claim on the page cannot be traced to `docs/billing.md` or to code,
  cut the claim. Do not write around it.

---

## Phase 5 — Changelog with RSS

**Priority P3. Effort M. Do this last, and only if the first four are done.**

The skill covers blogs, docs and changelogs. Taking each in turn:

- **Docs — not yet.** There is no public API and no self-serve integration. The
  copy-button and `.md`-URL rules matter when there is code to paste; there
  isn't. Revisit if an API ships.
- **Blog — not yet.** A blog is a standing content commitment, and an abandoned
  blog whose last post is four months old is worse than no blog on a product
  that sells consistency. `/why` carries the argument in the meantime.
- **Changelog — yes, eventually.** The git log reads like one already: "let
  Quincy actually post, and know what it cost", "notice when someone takes a
  channel back". That voice is an asset. And there is a pleasing correctness in
  a content product shipping an RSS feed.

If built, the skill's rules apply in full:

- `generateStaticParams` + `revalidate`, never a request-time fetch
- `/changelog/rss.xml` at exactly that path
- `text-wrap: balance` on entry headings (already done in Phase 2)
- Entries in MDX or markdown files in the repo. Not a CMS. Not a database
  table. The whole point is that writing one costs the same as writing a commit
  message.

**Explicitly do not** auto-generate it from commits. The commit messages are
good because a person wrote them for other engineers; a changelog is written
for users and the audience is different.

---

## What this plan deliberately does not build

Recorded so the question does not get re-asked:

- **Scroll-triggered anything.** Fade-ups as sections enter, parallax,
  scroll-hijacked section snapping. All are the current house style of AI
  landing pages, all move without the user asking, and all are on the skill's
  never list.
- **A carousel of testimonials.** No customers yet, and auto-advancing
  carousels are banned regardless.
- **A logo wall.** `docs/vision.md` names "a page ends up a logo wall" as a
  failure mode for `/channels`. Same reasoning applies here.
- **A hero animation.** If one is ever added it is `sessionStorage`-gated, once
  per session, with a `prefers-reduced-motion` path. Not before Phase 3 proves
  the static version works.
- **A second nav level.** Five public pages do not need a dropdown. When they
  do, the submenu markup lives in the DOM at all times, visually hidden.
- **A dark-mode toggle in the marketing header.** `next-themes` is already
  wired with `disableTransitionOnChange`; the marketing pages inherit it. A
  toggle in the header is a control competing with the one action that matters.

---

## Pre-ship checklist

Adapted from the `marketing-pages` skill, with the rows that do not apply to
this site struck out and why:

- [ ] No scroll-triggered animation, hijacking, non-1:1 parallax, or
      auto-advancing carousel
- [ ] ~~Intro animation gated behind `sessionStorage`~~ — there is no intro
      animation, and adding one is out of scope
- [ ] Fonts preloaded, no layout shift — already true via `next/font`; verify
      it stays true after Phase 3
- [ ] Above-the-fold images preloaded — Phase 3's illustration is DOM, so this
      reduces to "it has no intrinsic-size gap"
- [ ] All content pages statically generated with revalidation (Phase 1.4,
      Phase 5)
- [ ] ~~Nav submenu content present in the DOM when closed~~ — no submenu
- [ ] CTAs switch copy and destination on auth state — already true in the
      header; must stay true through Phase 1.4 and be extended to Phase 4
- [ ] ~~Docs snippets have copy buttons; `.md` URLs~~ — no docs site
- [ ] ~~Docs show visual examples~~ — but the *principle* is Phase 3
- [ ] RSS feed live for the changelog (Phase 5)
- [ ] `text-wrap: balance` on article headings (Phase 2)
- [ ] Code-built illustrations carry `aria-label`, `user-select: none`,
      `pointer-events: none` (Phase 3)

And from `design-foundations`, the rows this surface can actually fail:

- [ ] One visually primary button per view
- [ ] Semantic tokens only — no raw hex, with the annotated OG-image exception
- [ ] Body text under 65ch
- [ ] `gap`, not per-child margins
- [ ] Focus rings present and replaced, never removed
- [ ] Tabular figures on the price
- [ ] No `transition-all` (AGENTS.md non-negotiable)
- [ ] Every animation has a `prefers-reduced-motion` path (AGENTS.md
      non-negotiable — currently vacuous here, and should stay vacuous)

---

## Ordering, and why

Phase 1 first because it is the only phase fixing something that is wrong right
now rather than adding something missing: every link to this product shared on
the two platforms it publishes to rendered as a blank rectangle, and
`/robots.txt`, `/sitemap.xml` and the card itself all answered 307 to `/login`.
(The second half of that argument used to be "and every stranger's first page
load waits on a database". It doesn't — see 1.4.)

Phase 2 second because it is an afternoon and it unlocks the best writing in
the repo.

Phase 3 third because it is the one that needs taste and iteration, and it
should not be the thing blocking the two cheap fixes.

Phases 4 and 5 are genuinely optional and each carries a prerequisite decision.

No phase depends on another's code. 1 and 2 both touch `app/(marketing)/` and
`proxy.ts` is Phase 2 alone; run them in either order, expect a trivial merge in
the layout if run in parallel.

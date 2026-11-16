# Marketing: the shell, Section, the ink button, WaitlistForm

The landing page (`/`) is the visual reference for the whole product since
2026-11-16: the app's ground, its ink action, its air and its title size
were taken from it (plans/029, revision).

The public pages are `/`, `/pricing`, `/why`, `/changelog` and `/privacy`. Parts in
`components/marketing/` (import from `@/components/marketing`); pictures in
`components/showcase/demos/` (showcase.md). Never in an app page: the app is
`KitPage` and Stages (page.md).

## MarketingShell, MarketingHeader, MarketingFooter

`app/(marketing)/layout.tsx` renders `<MarketingShell>` around every
marketing page: KitRoot ground, header, `<main>`, footer. No props. A
marketing page never renders its own header, footer or KitRoot. Use
MarketingShell yourself only for a marketing page outside that route group
(`/prototypes/landing`).

- **Header**: the lockup home, "How it works" (`/#how`, hidden under 40rem),
  then the auth slot. Signed out: Pricing and **Join the waitlist**
  (`/#join`). Signed in: **Open Studio** only. The session read sits behind
  Suspense with the signed-out state as the fallback, so every page
  prerenders. Anchors carry the path (`/#join`), because the header renders
  on pages that have no `#join`.
- **Footer**: "Quincy" and four links. No company line, no tagline.
- **NavLink** (`narrow` `show` | `hide`): a header or footer link. Inside a
  sentence use the kit's `TextLink`.
- **Hit areas.** NavLink, the lockup and MarketingButton carry `HIT_40_44`
  (control-styles.ts): 40px tall under a mouse, 44px on touch, vertical
  only. The footer's links wrap 44px apart (`gap-6`) so wrapped rows never
  overlap. The footer pads the bottom safe area.

## Section and its parts

A marketing page is a column of `Section`s: headline, line, then the proof.
The parts set every gap. Never a hand-made `<section className="mt-24 …">`.

`Section`: `labelledBy` (the heading's id), `id` (an anchor), `position`
`first` | `middle` (default) | `last`, `layout` `stack` (default) | `split`.
`SectionHeading`: `id`, `title` (a string, or two strings for two lines),
`size`, `align` `center` (default) | `start`, children = the subline.

```
Which SectionHeading size?
 ├── The page's one h1 (the hero)          → xl (renders h1, lede subline)
 ├── The price                             → price
 ├── The heading of a layout="split" Section → md, align="start"
 └── Default                               → lg (renders h2)
Under the heading, in this order:
 ├── Actions or a form → SectionActions
 ├── A picture → SectionPicture width: sm (a thread) | md (one object)
 │                | lg (two side by side, the hero) | full (the picture caps itself)
 │   gap="lg" under the hero, or before an object standing on the ground
 └── The friend goes ABOVE the heading → SectionMark, once per page
```

Two lines are the page's voice: a pair of claims, one per line. Pass them as
a pair, never one string `text-balance` breaks where it likes. In a `split`
Section, put the picture in directly, not in SectionPicture.

```tsx
// Correct
<Section labelledBy="ideas-title" id="how">
  <SectionHeading id="ideas-title" title="It brings you ideas, not a feed.">
    Two or three from one merge, each named by where it came from.
  </SectionHeading>
  <SectionPicture width="md"><IdeasPicture /></SectionPicture>
</Section>

// Incorrect: a guessed shell, a raw size, the break left to the browser
<section className="mx-auto max-w-6xl px-6 mt-32">
  <h2 className="text-5xl font-semibold">It reads where you work. It posts where you are.</h2>
</section>
```

## Display type

`text-kit-display-xl | lg | md | price | lede | body | cta`, fluid from a
360 phone to a 1440 laptop (globals.css, kit section). SectionHeading
applies them; reach for one directly only inside a picture (the median
card's `1.6×` is `md`). Never in an app page: the app's scale is closed at
body size (type.md), and hierarchy there is weight and grey.

## MarketingButton and MarketingButtonLink

The page's call to action. Variants: `ink` (default), `quiet`. Sizes: `md`
(36px; header, a form), `lg` (44px; under the h1 only). Nothing else exists.

- `ink`: an ink pill on the ground, in both modes. The app's
  `Button variant="action"` is the same pill (since 2026-11-16 it reads
  `--kit-primary`, which is ink); the marketing one reads `--kit-ink`
  directly. Same value, two names, until the two buttons share one token.
- `quiet`: the kit's white control as a pill, for a second, lesser door.

Superseded 2026-11-16: this section used to argue the CTA must not be the
kit's blue because the pictures paint Approve blue. The app's action is now
ink too, and the pictures' blue Approve is legacy, to be rebuilt from real
components (showcase.md).

`MarketingButton` takes `pending` + `pendingLabel` (reserves the wider
label, announces it). `MarketingButtonLink` is a real `<a>` with no
`pending` and no `disabled`. Navigation is always the Link.

```tsx
// Correct
<MarketingButtonLink href="#join" size="lg">Join the waitlist</MarketingButtonLink>

// Incorrect: the app's Button as a marketing CTA, a link as a button
<Button variant="action" render={<Link href="#join" />}>Join the waitlist</Button>
```

## WaitlistForm

The one form a stranger fills in. Props: `id`, `source`, `label` (default
"Your email"). It posts `{ email, source }` to `/api/waitlist`, validates on
blur then on change, and replaces itself with a `role="status"`
confirmation. It remembers a join in localStorage (`quincy.waitlist`), never
by asking the server: the endpoint answers a new and a known address the
same on purpose.

- **No flash on refresh, no script.** localStorage cannot be read before
  hydration, and an inline `<script>` in the React tree is an error (React
  creates it on any client render, and never runs it there). So the slot
  is `invisible` in the server HTML and a `useLayoutEffect` reads storage
  and reveals the right state before the first client paint. The height
  never moves: an invisible, `inert` copy of the confirmation (the taller
  state) shares the grid cell. A cookie was rejected because reading it
  makes `/` dynamic; Next's `beforeInteractive` lives only in the root
  layout and does not block hydration.
- **`source` is analytics.** Keep the value a page's rows were counted
  under: the homepage is `landing-top`. A new page gets a new value (at most
  32 characters).
- One form per page. The header and the hero CTA both link to it (`#join`).

```tsx
// Correct
<SectionActions><WaitlistForm id="waitlist-form" source="landing-top" /></SectionActions>

// Incorrect: a second implementation on components/ui
<form onSubmit={…}><Input /><Button>Join</Button></form>
```

## Example content

**Demo, fixture and showcase content always shows what a real user would
get: a relatable before→after number from their own work (for example
41% → 68% from a merged PR). Never a contrived finance or currency
example. All pictures tell one story.**
Why: a visitor judges the product by whether the example looks like their
own week. A made-up currency figure reads as a template, and five pictures
with five examples read as five products. The one story is decisions.md,
"The onboarding story".
<!-- 2026-11-15: "eksempelet med currency er veldig dårlig. Ta noe som er bedre som vil være litt mer som faktisk de får" -->

## Never

- `className` or `style` on any part. A missing size or gap is a token.
- Brass, sand, `--primary`, the role scale or `components/ui` in a new
  marketing body. `/pricing`, `/why`, `/changelog` and `/privacy` still use
  them inside the new chrome until each one is redrawn as a whole.
- Copy: no em dashes, never "riff", no customer, logo, signup count or queue
  position, never another product's name.

# Plan 020: The pricing page

> Written **after** execution, like 018. The interesting decisions here were
> made by looking at four built directions and at the database, not by
> reasoning in advance — a plan written first would have argued for the wrong
> sequence, because the wrong sequence is the obvious one.

## Status

- **Priority**: P1 — `$49` was in `docs/billing.md` and in Stripe, and nowhere a
  stranger could read it.
- **Effort**: M
- **Risk**: LOW — one new public route, plus two small edits to surfaces already
  in production (`app/(marketing)/layout.tsx`, `proxy.ts`).
- **Depends on**: 009 (the marketing surface), the billing work in 001–007.
- **Category**: feature
- **Executed at**: 2026-08-09, branch `pricing-page`

## What shipped

- `app/(marketing)/pricing/page.tsx` — the page. Server component.
- `app/(marketing)/pricing/copy.ts` — every claim, with its source named.
- `app/(marketing)/pricing/track.tsx` — the five-step track. The only client
  island, because only the entrance needs an observer.
- `app/(marketing)/layout.tsx` — "Pricing" added to the header (signed-out) and
  the footer (both states).
- `proxy.ts` — `/pricing` added to `PUBLIC`.

## The four directions

Built as a live picker at `app/prototypes/pricing`, still on disk.

| # | Direction | Axis |
|---|-----------|------|
| 1 | Ledger | Two columns: what it buys, what it refuses |
| 2 | Sequence | The ledger's left column becomes the five steps |
| 3 | You and it | The steps as **You** / **Quincy**, alternating |
| 4 | **Day one** | The steps *are* the page; the contract closes it |

**Day one won.** A list of nouns ("a brain you edit directly") tells a stranger
what exists; a list of steps tells them what Tuesday looks like, and at a price
the second is the better answer. Once the steps are the argument they should not
be sitting in the narrower half of a 3fr/2fr split, which is what Sequence did.

Its known cost, recorded so nobody rediscovers it: this is the least
conventional-looking pricing page of the four. Someone who came to compare a
number against a competitor finds a product tour with a price on top. Mitigated
by keeping the number and both CTAs above the fold and closing with the terms.

"You and it" is the one worth revisiting. Its two columns made the reversal
below structural rather than stated, and it lost mostly on its own stated cost —
below `md` the columns stack and the alternation flattens into ten paragraphs.

## The sequence, and why the obvious order is wrong

The first draft opened with *"write down how you sound"*. That is backwards, and
it sells a worse product than the one that exists. **You never describe yourself
to Quincy.** You connect an account, `lib/corpus-x.ts` reads what you already
published, and `lib/voice.ts` writes the description. Your job is to correct it.

The chain, all of it live:

1. `channel_connection` — OAuth. `x:active`, `linkedin:active`.
2. `lib/corpus-x.ts` — one press on /sources reads your timeline into
   `source_item`, verbatim, interpreting nothing. 57 rows. Metered at ~$0.005 a
   post; X removed the free tier in February 2026.
3. `lib/voice.ts` — the single model call, same press. Emits a `portrait`, rules
   stated as frequencies rather than absolutes, and stories with verbatim quotes
   and proof URLs. Written `provenance: "published"`.
4. `lib/voice.ts:240`, inheriting `lib/heartbeat.ts:195` verbatim — a page whose
   provenance is `user` is yours and no later compile overwrites it.
5. `riff` → `draft` → the approval gate.

Step 4 is the best thing on the page and it is not a slogan. In production the
brain is **16 `user` pages against 4 `published` ones**: the corrections are the
majority of it.

## What is deliberately not claimed

- **Scheduling.** `scheduled_post` is empty.
- **Sources beyond your own channels.** `source_connection` is empty and
  `lib/sources.ts` returns `{}` for every real account.
- **Connector-fed material.** This is the intended design for step four and it
  does not work: `bookmarks-to-posts` is scheduled, has run 5 times and failed
  5 times — `403 Forbidden` from the bookmarks endpoint, which is an API-tier
  problem rather than a bug a retry clears. Step four therefore stands on voice
  notes, which produce 6 of the 10 riffs that exist.
- **Tax**, and **"cancel and pay nothing more"**. Neither is true yet; see
  `copy.ts`.

**Rewrite step four the day one bookmarks run returns `ok`.** It is the better
sentence and it will be true then.

## The motion

An earlier version walked a spotlight down the five steps on a button press,
dimming four rows to light one. Autoplaying that was rejected: someone who
scrolled down to read step five would watch it sit dim for two and a half
seconds, and an animation that fights the reader on a page they came to read is
the wrong trade at any easing.

What ships is an entrance — nothing dims, the rows arrive. 70ms apart, 320ms
each, `translateY(8px)`, `cubic-bezier(0.23, 1, 0.32, 1)`, transform and opacity
only, and once (`disconnect()` on first hit).

**Reduced motion is CSS, not JS, and this is the part worth reading.** The
obvious implementation reads the media query with `useSyncExternalStore` and
resolves the row to shown. It has a bug that only fires for the people it is
meant to protect: the server has no media query, so it renders the rows hidden,
a reduced-motion client renders them shown, and hydration reconciles by
transitioning — playing the exact animation that visitor asked not to see, on
top of a real server/client mismatch. The `@media (prefers-reduced-motion)` rule
in `track.tsx` has neither problem.

## Making it reachable

`/pricing` was gated by `proxy.ts` and answered `307 → /login`. Every reader a
pricing page is written for is signed out by definition, so this is the same
failure the `/privacy` comment in that file already describes, at its sharpest.

The header link is signed-out only — a subscriber changes plan through the
billing portal from /settings, and a permanent nav row pointing at the price
they already pay is a worse answer. It is a link rather than a button so the
layout's "one action" rule survives: navigation is not an action.

## Verification

`tsc` clean, `eslint` clean on the touched paths, 745 tests pass. `/pricing`
returns 200 signed out and signed in; the copy is in the server HTML (5
`data-step` rows, no `data-shown`, so the entrance still has somewhere to play
from); no console errors; no horizontal overflow at 375, 768 or 1440.

## Follow-ups

- **Not done:** the prototype at `app/prototypes/pricing` is still on disk, as
  the marketing prototype was after 009. Delete both together.
- `buttonVariants` tops out at `lg` = 36px, which is app chrome. Both CTAs here
  override to `h-11` by hand, and so does the marketing prototype. A `marketing`
  size belongs in the variants file the day a third surface needs it.
- `app/(app)/sources/page.tsx`'s doc comment is stale: it says heartbeat is the
  only rhythm with `available: true` (there are three) and that no
  `source_connection` table exists (it does, and is empty). The behaviour it
  describes is still right; the reasons have drifted.

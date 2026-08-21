# The palette, and the four that lost

Decided 2026-08-10 from `/prototypes/theme`, which put five palettes behind a
live picker over the real app shell, the real Numbers page and a real ritual
card. This is the record. `app/globals.css` holds the values; `AGENTS.md` holds
the rules. Neither of those says what was rejected, which is the part that
otherwise gets re-argued in three weeks.

The complaint that started it: *"I don't feel the brass."*

## The finding that decided it

Brass is not under-saturated. It is at the ceiling.

Chroma in OKLCH is bounded by lightness and hue together, and the bound is
lumpy. At L 0.70 the sRGB ceiling for hue 70 is **0.152**. The shipped
`brass-400` sits at **0.124** — **82% of everything that hue can do at that
lightness.** Turning chroma up does nothing; the value clips. The hue is the
ceiling, not the setting.

So there were only ever two ways to make the brand felt:

1. **Move the hue.** Hue 42's ceiling at the same L is 0.200 — 32% more room.
   That is the Ember variant below.
2. **Stop asking the fill to carry it.** Give brass less to do, so the little
   that remains reads loud. That is what shipped.

## What shipped

**Ink, on the warm neutrals.** Both ramps are unchanged — this was never a
problem with the ramps. Four tokens moved:

| Token | Was | Now (light) | Now (dark) |
| --- | --- | --- | --- |
| `--primary` | `brass-400` | `sand-950` | `sand-50` |
| `--primary-foreground` | `sand-950` | `sand-50` | `sand-950` |
| `--sidebar-primary` | `brass-400` | `sand-950` | `sand-50` |
| `--sidebar-primary-foreground` | `sand-950` | `sand-50` | `sand-950` |

Contrast went from 6.10:1 to **15.29:1**, in both modes.

Two tokens were added, both because repointing `--primary` broke something that
had been working by coincidence:

- **`--signal-on`** = `sand-950`, in both modes. Text that sits on a `--signal`
  fill. `node-chip.tsx` had been using `--primary-foreground` for this; the two
  held the same value, so it passed. `--signal` is brass-400 in both modes and
  `--primary-foreground` now flips, so the borrowed token would have shipped
  white-on-brass at 3.73:1 in light mode.
- **`--primary-hover`** = `color-mix(in oklch, var(--primary) 93%, var(--background))`.
  `bg-primary/80` was tuned against brass and moved lightness by 0.052. Against
  a near-black fill the same alpha moves it **0.170**, and toward the page — a
  button that goes pale under the cursor reads as disabled. Mixing toward
  `--background` self-corrects, because both operands flip with the theme.

Two more call sites moved for the same reason: `lineup-parts.tsx` drew its
cadence bars in `--primary` and would have gone grey, so it takes `--chart-1`
like every other data mark; `export-button.tsx` used `hover:brightness-105`,
which is invisible on a near-black fill.

**Why it is the answer to the original complaint.** Brass now appears in four
places and nowhere else: the live dot, the "next up" label, chart marks, and
text selection. It reads as loud again because nothing else competes for the
same job. The rule in `AGENTS.md` — *brass means live* — was false before this
change, because the largest brass object on any screen was a button.

## What was rejected

**Brass, unchanged.** The incumbent, and the control the other four were
measured against. Rejected because it cannot be fixed by tuning: 82% of the
ceiling is the end of the road for hue 70 at L 0.70, and the fill would keep
reading tan rather than gold.

**Ember — hue 42, chroma 0.163.** The literal answer to "make it warmer": same
warmth, 32% more chroma, the only variant that made the fill genuinely feel like
something. Rejected on two counts. Hue 42 sits close to the danger red, so
*Approve* and *Failed to publish* read as one family — visible on the ritual card
in the prototype. And it does not solve the deeper problem: the loudest colour
on the screen is still bolted to the control pressed most often, and `--primary`
and `--signal` still collide.

**Iris — violet, hue 285, on cool neutrals.** The 2026 software default: cool
ground, saturated mid-tone fill, light text. Well executed and wrong for this
product. It drops the warm paper, so Quincy stops looking like a writing tool
and starts looking like a dashboard, and violet-on-grey is the most-copied
palette of the year, so it cannot differentiate.

**Moss — green, hue 160, on warm paper.** The most attractive of the losers, and
it fails on meaning rather than looks. Green already means *success* everywhere
in the product, so the live dot and the done state become the same colour, and
the Numbers bars read as "good" when they only mean "above your median".

**Ink on cool neutrals (hue 265).** The shipped direction with the wrong ground.
This is what made the first Ink look generic: it was the cool grey that threw
the personality away, not the neutral button. Keeping the warm sand ramp gets
the restraint without the anonymity.

## Two things deliberately not changed

- **The dark surfaces.** The prototype carried a "Deep" control that dropped the
  dark page from L 0.235 to 0.175 with the sidebar at 0.135. It looks current
  and every text pair gains contrast under it. It was held back because it is a
  separate decision from the hue, and bundling the two would have made the
  change impossible to attribute if something felt wrong afterwards. Worth
  revisiting on its own.
- **The switch and the checked-field tint.** `data-checked:bg-primary` now gives
  a near-black switch, and a checked field gets a faint grey wash instead of a
  faint brass one. Both are standard and both read fine, but an *on* switch is
  arguably a live state and may want `--signal` instead. Left alone rather than
  quietly widened into this change.

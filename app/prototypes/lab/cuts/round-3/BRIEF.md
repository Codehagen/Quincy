# Cuts, round 3 — narrow

## Picks

The owner kept **02, 06, 07, 09, 10, 12, 14, 16, 21, 22, 24, 30, 31, 32, 38,
40** (2026-11-17). In his words:

> "Keep: 02, 06, 07, 09, 10, 12, 14, 16, 21, 22, 24, 30, 31, 32, 38, 40 -
> Kanskje 29 kan også passe inn men vet ikke hva vil være best UX. Vi skal
> ikke bruke mer AI elements, jeg ønsker shadcn som nevnt."

In English: keep those. Maybe 29 fits too, but he does not know what the
best UX is. Stop rebuilding AI Elements on our kit; use shadcn, as he said.

## What the kept pieces share — keep all of it

- 02's desk under everything: a large preview, the full lanes, the chat as
  a narrow margin.
- Quincy's cursor reads the chat's tool parts and presses where each op
  lands (21 the name tag, 22 the friend, 24 at speed). The lanes are
  read-only while it works (06), and Stop keeps what landed (30).
- The first run: the sample opens free (14), the reading (31), starters that
  say what Quincy read (32).
- The receipt in prose with the length against the take (07), and one run
  as one undo (09).
- Several cuts from one take (16), as columns (40), with the self-check
  (38).

## Discarded from round 2 — leave out

23 (numbered presses), 25 (the tag says the op), 26 (steps as the receipt),
27 (undo runs backwards), 28 (undo just reverts, as its own piece), 33 (the
sample replayed in the desk), 34 (the reading ends in a plan), 35 (two
pointers), 36 (three stacked lanes), 37 (three small previews over the
lanes), 39 (the A/B/C switch).

## Decision: the chat margin is real shadcn

The owner chose real shadcn for the chat margin. The margin is built from
shadcn registry components installed with the CLI (`components/ui/`:
button, message, bubble, trace, marker, item, collapsible, separator,
checkbox, message-scroller). The AI Elements patterns are copied as shadcn
instructs into `components/ai-elements/` (tool, task, subagent,
confirmation, checkpoint, suggestion, status-icon), with hugeicons for
lucide and the friend for a spinner.

This departs from AGENTS.md's "new UI uses the kit" for this one surface. If
it survives the round, write it into `docs/design/decisions.md`; this round
does not edit decisions.md.

To make the margin read as the kit, `round-3/shadcn-scope.css` (now `components/editor/cuts-shadcn.css`) maps shadcn's
variables (`--background`, `--foreground`, `--muted`, `--border`,
`--primary`, `--ring` …) to the `--kit-*` tokens inside one wrapper class,
`.cuts-shadcn`, used only around the margin. The result: an ink primary, the
well grey for muted, hairline borders, and no blue. `app/globals.css` is
untouched. The same scope also enforces two kit rules on shadcn's button:
named transition properties, and `--kit-primary-hover` on hover. The chat
still runs on `@shadcn/helpers/ai-sdk` and `useChat`, and the cursor still
reads tool parts. Round 2's own elements stay where they are, for round 2's
pieces only.

## The asks: 8 pieces, 41–48, each a whole flow in the 02 desk

Every piece runs the same story end to end. Open the sample, free (14).
The scan reads the take (31). The starters say what Quincy read (32). Pick
one. The cursor runs with the lanes read-only and the steps in the margin
(06, 21/22/24). The prose receipt gives the length against the take (07).
There is one checkpoint and one Undo (09). Each piece has Replay.

- **41–43, the cursor:** 41 the name tag (21), 42 the friend (22), 43 the
  highlighter at speed (24). One script; only the cursor differs.
- **44–46, the gate:** the owner is unsure about 29, so here are three
  answers, all on 41's cursor:
  - 44, just go, with Stop (30): no question. Esc or Stop parks the cursor
    and keeps what landed.
  - 45, ask every time (29/10): the receipt in advance, lines to untick,
    Go or Enter.
  - 46, ask when it matters (the recommendation to test): ask once per
    project, and again only when a run would remove spoken words or touch
    more than 30% of the take. Otherwise go, with Stop always there. One
    session shows both: captions go straight through, and "under 20 s"
    asks again.
- **47–48, several cuts:** 47 as three columns (40), with a self-check
  inside each cut's run (38) and the pick in words. 48 the same run in the
  desk the 16 way: one large preview, three spines in the lanes panel. 47
  against 48 decides the layout.

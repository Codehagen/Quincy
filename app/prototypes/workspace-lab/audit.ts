/**
 * Why today's components read cheap, with values. Measured from the kit
 * (components/kit, app/globals.css) and today's /ideas on fixtures
 * (/prototypes/ideas), against the landing's finished cards
 * (components/showcase/demos/ideas-card.css, median-card.css,
 * channels-card.css). Shown in the lab header and copied into DECISION.md.
 */
export const AUDIT: { what: string; today: string; bar: string; candidate: string }[] = [
  {
    what: "Flat type scale",
    today: "Every title, label, button and paragraph is 14/20 (text-kit-body); the only steps are weight 460 → 560 and small 12.5.",
    bar: "The landing cards run three voices in 2px: titles 13/560, meta in 11 mono, group labels 12/600.",
    candidate: "Row title 13/560, meta 12/460, mono 12 for age and counts, page name 15/600 in the toolbar.",
  },
  {
    what: "Page chrome eats the first screen",
    today: "KitPage top 64 + 28px title + 56 gap + a Stage lead + 28 lead gap + the capture Card puts the first idea about 290px down an 860px window (34%).",
    bar: "A working surface shows the first row under its toolbar.",
    candidate: "Two toolbar rows (52 + 44): the first idea is at 110px.",
  },
  {
    what: "Rows are tall and say one thing",
    today: "ListRow is min 44, 60 with titleLines 2; the list shows the hook and one muted line, capped at 6 rows in a 24rem column. Source, shape, channels and age are not columns, so nothing can be read down the page.",
    bar: "The median card's rows are 40 with a hairline, the number tabular at the right.",
    candidate: "36px rows (control: 28–48), five columns: glyph, idea, shape, for, age (right-aligned mono).",
  },
  {
    what: "Hover and selected barely show",
    today: "Row hover is L .975 on white (1.07:1); selected is .961 (1.12:1). No other cue: no bar, no weight change.",
    bar: "IdeasPicture marks the picked idea with the grey AND the only 560 title in the group.",
    candidate: "Grey plus a 3px ink bar at the row's start (control: grey / bar / lifted).",
  },
  {
    what: "Every control floats",
    today: "Quiet Button: white, 7% ring, 4/12 fall, 36px pill, 14/560 label. Record + Paste + Dismiss is three shadows; a toolbar of six would be six.",
    bar: "The landing's in-card buttons are size small; the IdeasPicture chip is 32px with 12.5 text.",
    candidate: "Toolbar controls at 28–32px; ghost (no surface at rest) for secondary, ring-only for filters and search, ink pill for the one action.",
  },
  {
    what: "Objects everywhere, no panes",
    today: "Card (18 radius, 28 × 24 pad, shadow) per source, List (a Card) for the rows, Card for capture: a stack of floating sheets with no shared edges and no toolbar. The kit has no toolbar, table, pane or filter pattern; KitPage allows two header actions.",
    bar: "App-grade workspaces are one surface divided by 1px rules, with one raised thing at most.",
    candidate: "Panel with its own scroll; hairline dividers between panes (control: hairline / raised).",
  },
  {
    what: "Tags are louder than the facts",
    today: "Tag: 24px tall, 12.5 text, inset ring, 8 radius; beside a 14px title it is 89% of the title.",
    bar: "The landing prints the same facts as one muted line: \"#212 · Story · Thread\".",
    candidate: "Shape as muted text in its own column (control: text / outline 20px / fill).",
  },
  {
    what: "Icons heavier than the text",
    today: "NavRow 18 at stroke 2, Button and SearchField 16 at stroke 2, beside 14px text.",
    bar: "The landing's source icon is 14px in a 28px well tile.",
    candidate: "16 at stroke 1.75 beside 13px text (control: 14 / 16 / 18 and 1.5 / 1.75 / 2).",
  },
  {
    what: "Three left edges in one column",
    today: "Card content starts 28px in, ListRow text 6 + 16 = 22px in, a Stage lead at 0.",
    bar: "One left edge per pane.",
    candidate: "Every pane pads 20 (kit-group); rows inset 8 + 12 = 20, so titles sit on the toolbar's edge.",
  },
  {
    what: "Prose leads doing a toolbar's job",
    today: "\"Say what happened.\" and \"What I marked.\" name regions at body size and add about 48px each.",
    bar: "The landing's group label is one 12/600 line.",
    candidate: "Regions are named by the toolbar and a 12px pane heading; the voice moves into the margin notes.",
  },
]

import type { Piece } from "../../types"

import TheWeek from "./26-the-week"
import ApproveIntoItsSlot from "./27-approve-into-its-slot"
import WhyThisHour from "./28-why-this-hour"
import Today from "./29-today"
import ItCameBack from "./30-it-came-back"

/**
 * Group b — Planning: the week and the decision to send. Each piece is a
 * surface someone would open daily (the lineup, one slot, the morning list,
 * a post coming back), built on the round-2 kit. Order is display order.
 */
export const pieces: Piece[] = [
  {
    n: 26,
    title: "The week",
    take: "Kept 19's slot grid and 08's drag, as the lineup page itself: slots hold the hour and your median, posts move between them by drag or Space and arrows, and the week makes room.",
    Component: TheWeek,
  },
  {
    n: 27,
    title: "Approve into its slot",
    take: "Kept 07's press-causes-move without the cursor or the split: the draft is a small card over the week, Approve folds it to one line and slides the post into Wednesday, Undo runs it back.",
    Component: ApproveIntoItsSlot,
  },
  {
    n: 28,
    title: "Why this hour",
    take: "Kept 19's number against your own median and 01's margin note: one slot opened up, where picking another hour recounts the figure and Quincy's note changes its mind.",
    Component: WhyThisHour,
  },
  {
    n: 29,
    title: "Today",
    take: "Kept the one blue action and the margin hand, as a morning list in order: only the top item is open, clearing it folds it away, and the note gives the reason for the next.",
    Component: Today,
  },
  {
    n: 30,
    title: "It came back",
    take: "Kept 02's three beats in blue pen and the number on its own line: a published post returns as a story, compared to your median at the same age, with a toggle for how long it has been out.",
    Component: ItCameBack,
  },
]

import type { Piece } from "../../../types"
import { MergedOnFriday } from "./26-merged-on-friday"
import { DarkAbovePaperBelow } from "./27-dark-above-paper-below"
import { TheReceiptIsThePage } from "./28-the-receipt-is-the-page"
import { OneLongPicture } from "./29-one-long-picture"
import { SmallAndInked } from "./30-small-and-inked"

/** Round 2, group b: the dark family, grown from 02 and 07. */
export const pieces: Piece[] = [
  {
    n: 26,
    title: "Merged on Friday",
    take: "02's marked PR and receipt as a wide hero window on a fully dark page, then the same PR followed in four alternating cropped steps, a median strip, the refusals beside the price: the classic long page, medium density.",
    Component: MergedOnFriday,
  },
  {
    n: 27,
    title: "Dark above, paper below",
    take: "07's dark hero and full app window, but the window lies across the seam onto a light page, so everything under it reads as marked-up paper (three columns, a median table, the plan as a contract) before the dark band closes the page.",
    Component: DarkAbovePaperBelow,
  },
  {
    n: 28,
    title: "The receipt is the page",
    take: "The checked receipt becomes the page's spine: one rule with a check per line, each followed by a hard crop of the product where it happened, ending on held for your read, then a dashed line to the one step not built yet, and the plan printed as a bill.",
    Component: TheReceiptIsThePage,
  },
  {
    n: 29,
    title: "One long picture",
    take: "After the hero the page is one continuous product picture: a single stage that follows PR #212 through ideas, the three-beat draft, Approve, Monday and the result, joined by one blue pen line, with short captions in the stage's margin.",
    Component: OneLongPicture,
  },
  {
    n: 30,
    title: "Small and inked",
    take: "Quincy as a small ink character that peeks over each close-up and looks at what matters on it, then at you beside Approve, and is asleep by the final call (nothing goes out without you): the airiest page, big centred type, one object per section.",
    Component: SmallAndInked,
  },
]

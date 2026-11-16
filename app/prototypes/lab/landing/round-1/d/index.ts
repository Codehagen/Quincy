import type { Piece } from "../../../types"
import TheWeekStrip from "./16-the-week-strip"
import TheFridayLetter from "./17-the-friday-letter"
import TheWeekReceipt from "./18-the-week-receipt"
import TheLedger from "./19-the-ledger"
import OneFriday from "./20-one-friday"

export const pieces: Piece[] = [
  {
    n: 16,
    title: "The week on a desktop",
    take: "Takes a reference's centred two-line headline and its product window on a landscape, and pushes it into a Monday-to-Friday lineup drawn on grey dusk hills, where Friday stays empty until you press Approve and next Monday's number is cut off at the edge.",
    Component: TheWeekStrip,
  },
  {
    n: 17,
    title: "The Friday letter",
    take: "Takes the kit's highlighter and puts it in a letter Quincy writes you every Friday, set in a reading serif (Newsreader, the letter only) because a letter is read, not scanned.",
    Component: TheFridayLetter,
  },
  {
    n: 18,
    title: "The week as a receipt",
    take: "Takes a reference's dark ground, two-beat headline and the agent's checked list of work, and turns the list into the week (heard, read, found, drafted, checked) ending on one post held for your read, with nothing sent.",
    Component: TheWeekReceipt,
  },
  {
    n: 19,
    title: "The ledger",
    take: "Takes the reference's confidence of type for a two-line headline and pushes it into a bookkeeper's page of in and out, with the editor's blue pen in the margin and an honest 0.8× on the last row.",
    Component: TheLedger,
  },
  {
    n: 20,
    title: "One Friday",
    take: "Zooms the week to a single day column that runs off both edges, and makes Depth the subject: the post at 08:30, then the person who keeps answering, highlighted, with a Send that is yours.",
    Component: OneFriday,
  },
]

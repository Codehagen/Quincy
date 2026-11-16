import type { Piece } from "../../types"
import { OnTheDesk } from "./31-on-the-desk"
import { ItTextsFirst } from "./32-it-texts-first"
import { TheDeskDense } from "./33-the-desk-dense"
import { DeskAndPocket } from "./34-desk-and-pocket"
import { AFewLines } from "./35-a-few-lines"

/** Round 3, pieces 31–35: one direction (30 in light, Pixel friend), five variants. */
export const pieces31: Piece[] = [
  {
    n: 31,
    title: "On the desk",
    take: "Nearest to 30, in light: airy centred page, the desk window and its receipt as hero, the friend (48) perched on every picture in that picture's state, connectors straight after the hero, Quincy's notes as one quiet row of three further down.",
    Component: OnTheDesk,
  },
  {
    n: 32,
    title: "It texts first",
    take: "Quincy coming to you is the hero: a phone rises with the thread arriving one note at a time, the friend as the sender's avatar; how it works is told as those notes, each opening its crop. Large friend (64), seen three times; connectors late.",
    Component: ItTextsFirst,
  },
  {
    n: 33,
    title: "The desk, dense",
    take: "The working version: left-aligned hero over a desk window with the notes arriving in the Studio thread beside the draft they point to; connectors high as a register; two-column sections; the friend small (16) and only where the product puts it.",
    Component: TheDeskDense,
  },
  {
    n: 34,
    title: "Desk and pocket",
    take: "A phone stands over the desk window's edge with Quincy's notes landing on the lock screen one by one, the draft open behind it; how it works as a strip of five small stages; the 'posted, 1.6×' note beside the median; connectors late with the friend reading between both sides.",
    Component: DeskAndPocket,
  },
  {
    n: 35,
    title: "A few lines",
    take: "The quietest: the thread itself at reading size is the hero picture, no device, friend (48) as the avatar; connectors as one line under the button, the highest of the five; three plain rows, wide gaps, friend seen twice.",
    Component: AFewLines,
  },
]

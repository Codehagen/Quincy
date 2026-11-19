import type { Piece } from "../../../types"
import { JustGoWithStop } from "./44-just-go-with-stop"
import { AskEveryTime } from "./45-ask-every-time"
import { AskWhenItMatters } from "./46-ask-when-it-matters"

/** Round 3, group b: three answers to the gate, on 41's cursor. */
export const pieces: Piece[] = [
  {
    n: 44,
    title: "Just go, with Stop",
    take: "Never asks: the pick runs at once, Stop or Esc parks the cursor and keeps what landed, and Finish the run does only the rest.",
    Component: JustGoWithStop,
  },
  {
    n: 45,
    title: "Ask every time",
    take: "Starts every run as the receipt in advance, lines to untick, Go or Enter, and only then the cursor, skipping what was unticked.",
    Component: AskEveryTime,
  },
  {
    n: 46,
    title: "Ask when it matters",
    take: "Asks once per project and again only when a run removes spoken words or more than 30% of the take, saying why; captions go straight through, under 20 s asks.",
    Component: AskWhenItMatters,
  },
]

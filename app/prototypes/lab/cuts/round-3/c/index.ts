import type { Piece } from "../../../types"
import { ThreeColumnsFlow } from "./47-three-columns"
import { ThreeSpinesFlow } from "./48-three-spines"

/** Round 3, group c: several cuts from one take, two homes in the desk. */
export const pieces: Piece[] = [
  {
    n: 47,
    title: "Three cuts as three columns",
    take: "Gives the preview's place to three columns, each with its own cursor and a self-check inside its run, then Quincy's pick in words.",
    Component: ThreeColumnsFlow,
  },
  {
    n: 48,
    title: "Three cuts in the desk, 16's way",
    take: "Keeps one large preview of the recommended cut and puts three spines in the lanes panel, same self-checks and pick, so 47 against 48 decides the layout.",
    Component: ThreeSpinesFlow,
  },
]

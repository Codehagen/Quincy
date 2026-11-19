import type { Piece } from "../../../types"
import { TheCutReady } from "./52-the-cut-ready"
import { ThreeCutsReady } from "./53-three-cuts-ready"

/** Round 5: ready. The decided cursor, gate and layout, with the audit fixed. */
export const pieces: Piece[] = [
  {
    n: 52,
    title: "The cut, ready",
    take: "Puts the decisions in one flow: 49's choreography and ink name tag with the owner's gate (tighten and captions go straight through; only under 20 s, which removes whole sentences and 40% of the take, asks, saying why), Stop and Esc, the receipt in words, one checkpoint, next steps under it, and a tune panel for the timing.",
    Component: TheCutReady,
  },
  {
    n: 53,
    title: "Three cuts, ready",
    take: "51 with the audit fixed: one scale for ruler and clips, a filmstrip with its waveform in every clip, no slivers, captions that stay, one time on screen, the friend once.",
    Component: ThreeCutsReady,
  },
]

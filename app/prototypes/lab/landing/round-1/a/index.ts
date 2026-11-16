import type { Piece } from "../../../types"

import TheTranscript from "./01-the-transcript"
import ThePullRequest from "./02-the-pull-request"
import OneLine from "./03-one-line"
import TheProof from "./04-the-proof"
import OnTheWallpaper from "./05-on-the-wallpaper"

/** Round 1, group "a": the editor's page. The landing page is a page Quincy has marked up. */
export const pieces: Piece[] = [
  {
    n: 1,
    title: "The transcript",
    take: "The kit's highlighter, made the hero: a voice-note transcript set in a book serif sweeps its one line and gets a margin note on first sight, and the headline only comes after you have read what was said.",
    Component: TheTranscript,
  },
  {
    n: 2,
    title: "The pull request",
    take: "A reference's dark ground and centred two-beat headline, but the product picture is a merged PR with every editor mark on it, next to Quincy's checked receipt of what it did, ending on \"held for your read\".",
    Component: ThePullRequest,
  },
  {
    n: 3,
    title: "One line",
    take: "The reference landing's confidence of type, given to the person's own sentence: their quote is the 66px headline, one blue pen line under the part Quincy would post, and Quincy's own claim sits small below it.",
    Component: OneLine,
  },
  {
    n: 4,
    title: "The proof",
    take: "A galley proof: a display serif headline (Instrument Serif, for the magazine register an editor's page implies) over what you said in your italic and what Quincy drafted in plain type, beats in blue pen between them.",
    Component: TheProof,
  },
  {
    n: 5,
    title: "On the wallpaper",
    take: "A reference's app window on a landscape wallpaper, pushed into greys only: Quincy (a small ink blob) hears a voice note, highlights its one line, shows a work receipt and holds a bracketed three-beat draft for you to send.",
    Component: OnTheWallpaper,
  },
]

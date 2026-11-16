import type { Piece } from "../../../types"

import HeardWritten from "./11-heard-written"
import InQuotes from "./12-in-quotes"
import Listening from "./13-listening"
import YourVoiceTwice from "./14-your-voice-twice"
import SaidThenSet from "./15-said-then-set"

/** Icons round 1, group "c": voice and speech, without the microphone. */
export const pieces: Piece[] = [
  {
    n: 11,
    title: "Heard, written",
    take: "Three waveform bars settle into one blue line of text: a voice note becoming a draft, read left to right; 2px bars on 1px gaps are the finest waveform 16px can hold.",
    Component: HeardWritten,
  },
  {
    n: 12,
    title: "In quotes",
    take: "A closing quote, the first drop ink (you) and the second blue (Quincy quoting you back); two solid 5px drops stay marks at 16 instead of thinning into punctuation.",
    Component: InQuotes,
  },
  {
    n: 13,
    title: "Listening",
    take: "An ear reduced to its rim and inner curl: it listens before it writes; the curl drops out at 16, where two curves 2px apart would fuse, and the rim alone still reads.",
    Component: Listening,
  },
  {
    n: 14,
    title: "Your voice, twice",
    take: "Your bubble in solid ink with the same bubble behind it in blue outline, the second voice that sounds like yours; solid front, so it covers the back on any ground.",
    Component: YourVoiceTwice,
  },
  {
    n: 15,
    title: "Said, then set",
    take: "A spoken wave above a straight blue line: the same thing before and after Quincy; one full wave period in a 2px stroke, so at 16 it is a wave and not a dash.",
    Component: SaidThenSet,
  },
]

import type { Piece } from "../../../types"

import MarginBracket from "./06-margin-bracket"
import InsertHere from "./07-insert-here"
import TheOneLine from "./08-the-one-line"
import ApprovedInBrackets from "./09-approved-in-brackets"
import PilcrowQ from "./10-pilcrow-q"

/** Icons round 1, group "b": editor's marks, what Quincy writes on a page. */
export const pieces: Piece[] = [
  {
    n: 6,
    title: "Margin bracket",
    take: "Three lines of your text and Quincy's blue bracket in the margin; every part is a whole-pixel rectangle, so at 16 it is three bars and a bracket, nothing soft.",
    Component: MarginBracket,
  },
  {
    n: 7,
    title: "Insert here",
    take: "The proofreader's caret pointing into a gap in a line: something belongs here; a 4px gap and a 2px chevron are the two things 16px has to carry, and they do.",
    Component: InsertHere,
  },
  {
    n: 8,
    title: "The one line",
    take: "Three lines with the highlighter under the middle one, the kit's own gesture as a mark; a 4px yellow band reads as colour at 16, and the marked line stays ink on dark.",
    Component: TheOneLine,
  },
  {
    n: 9,
    title: "Approved in brackets",
    take: "A blue check inside square brackets: marked up, and yours to approve; whole-pixel brackets frame the check so it does not read as a generic tick at 16.",
    Component: ApprovedInBrackets,
  },
  {
    n: 10,
    title: "Pilcrow q",
    take: "The paragraph mark, which is already a q: an editor's sign that spells the name; a solid bowl and two 2px stems are heavy enough to be the boldest thing in a tab bar.",
    Component: PilcrowQ,
  },
]

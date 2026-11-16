import type { Piece } from "../../../types"
import { ApproveOnAGreyMorning } from "./06-approve-on-a-grey-morning"
import { HeldForYourRead } from "./07-held-for-your-read"
import { WednesdayIsOpen } from "./08-wednesday-is-open"
import { ThePenOutsideThePhone } from "./09-the-pen-outside-the-phone"
import { TheChatIsThePage } from "./10-the-chat-is-the-page"

export const pieces: Piece[] = [
  {
    n: 6,
    title: "Approve on a grey morning",
    take: "Takes a reference's centred 64px type and its window-on-a-landscape, draws the landscape in the kit's own greys so the only colour left is the pen and Approve, and lets the frame cut the draft so pressing Approve is the page's one change.",
    Component: ApproveOnAGreyMorning,
  },
  {
    n: 7,
    title: "Held for your read",
    take: "Takes a reference's near-black page, full app window and checked receipt, and turns the receipt into a run on a merged PR whose last line is Quincy's promise: drafted, held for your read, nothing sent.",
    Component: HeldForYourRead,
  },
  {
    n: 8,
    title: "Wednesday is open",
    take: "Takes the product-as-hero and builds the headline into it: the week runs past both edges and the empty Wednesday slot says, in Quincy's voice, what to do next.",
    Component: WednesdayIsOpen,
  },
  {
    n: 9,
    title: "The pen outside the phone",
    take: "Takes the kit's beat brackets out of the screen: a phone rises from the hero's bottom edge and Quincy's blue pen names the three beats on the page beside it, like an editor's margin.",
    Component: ThePenOutsideThePhone,
  },
  {
    n: 10,
    title: "The chat is the page",
    take: "Takes Stageshow's real-UI register to full bleed, with Quincy's reply set as the headline, plus a reference's character and two-beat section line: one ink blob with dot eyes, because Quincy is one editor, not a crew of bots.",
    Component: TheChatIsThePage,
  },
]

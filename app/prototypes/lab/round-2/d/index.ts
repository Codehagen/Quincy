import type { Piece } from "../../types"

import TheShell from "./36-the-shell"
import PageHeader from "./37-page-header"
import NothingToSend from "./38-nothing-to-send"
import PublishingSettings from "./39-publishing-settings"
import TheComposer from "./40-the-composer"

/** Round-2 "d": chrome, the frame every screen lives in. */
export const pieces: Piece[] = [
  {
    n: 36,
    title: "The shell",
    take: "Keeps the one white window cropped by the corner and builds the real sidebar inside it; adds the accent as a single dot where something waits for you, which clears when you open that page.",
    Component: TheShell,
  },
  {
    n: 37,
    title: "Page header",
    take: "Keeps the one blue action and a margin note on the riff that earns it; adds a header line that says what Quincy is doing, which changes when you press Draft.",
    Component: PageHeader,
  },
  {
    n: 38,
    title: "Nothing to send",
    take: "Keeps the lead-in-a-card pattern and the median line; adds an empty Drafts page that asks for your week, where picking a way in brings the editor's next question.",
    Component: NothingToSend,
  },
  {
    n: 39,
    title: "Publishing settings",
    take: "Keeps the margin note and the figure against your own median; adds a settings section where the note answers the number you set and the switch says what turning off approval means.",
    Component: PublishingSettings,
  },
  {
    n: 40,
    title: "The composer",
    take: "Keeps the record take from 17 and the caused arrival; adds Studio's composer with real attach, a simulated take with a ceiling, and a platform-read Cmd or Ctrl Enter hint.",
    Component: TheComposer,
  },
]

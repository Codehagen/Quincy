import { VisualTrack } from "./track"

/**
 * The visual lab: a numbered grid for the curation loop.
 *
 * The agent makes many, the person keeps few, the next round is made from what
 * was kept. Pieces here are deliberately allowed to break the app's current
 * system — finding a new one is the point. Nothing here inherits the app's
 * tokens, fonts or components; each piece holds exactly one accent. See README.md in this folder for how a round is run.
 */
export const metadata = {
  title: "Lab",
  robots: { index: false, follow: false },
}

export default function LabPage() {
  return <VisualTrack />
}

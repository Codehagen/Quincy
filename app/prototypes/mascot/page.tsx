import { KitPage, KitRoot } from "@/components/kit"

import { MascotBoard } from "./board"

/**
 * The state board for the mascot (docs/design/mascot.md): every state live,
 * smooth and pixel side by side at 128 on one clock, then smooth 32 and pixel
 * 16, on both grounds; every pixel frame as a contact sheet, a speed
 * control, and exports of the current frame (SVG, PNG) and of a whole state
 * (GIF).
 */
export const metadata = {
  title: "Mascot",
  robots: { index: false, follow: false },
}

export default function MascotPage() {
  return (
    <KitRoot>
      {/* KitPage is not a landmark; the frame owns <main> (app-shell.md). */}
      <main>
        <KitPage title="Quincy's friend" summary="Nine states. Smooth from 32px, pixel under it, on one clock.">
          <MascotBoard />
        </KitPage>
      </main>
    </KitRoot>
  )
}

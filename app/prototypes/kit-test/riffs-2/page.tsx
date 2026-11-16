import { KitRoot } from "@/components/kit"

import { RIFFS } from "./data"
import { RiffsScreen } from "./riffs-screen"

/**
 * Riffs, rebuilt from the kit alone (docs/design/). Fixture data, stubbed
 * actions: nothing reads or writes the database. The empty state is at
 * ./empty.
 */
export const metadata = {
  title: "Riffs (kit test 2)",
  robots: { index: false, follow: false },
}

export default function Page() {
  return (
    <KitRoot>
      {/* KitPage is not a landmark; the frame owns <main> (app-shell.md). */}
      <main>
        <RiffsScreen initialRiffs={RIFFS} />
      </main>
    </KitRoot>
  )
}

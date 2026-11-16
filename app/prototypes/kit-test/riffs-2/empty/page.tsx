import { KitRoot } from "@/components/kit"

import { RiffsScreen } from "../riffs-screen"

/** The same screen for an account with nothing waiting. */
export const metadata = {
  title: "Riffs, empty (kit test 2)",
  robots: { index: false, follow: false },
}

export default function Page() {
  return (
    <KitRoot>
      <RiffsScreen initialRiffs={[]} />
    </KitRoot>
  )
}

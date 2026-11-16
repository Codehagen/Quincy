import { Suspense } from "react"

import { ShellLab } from "./shell-lab"

/**
 * Prototype surface: four directions for the app shell, judged against the
 * landing's pictures (owner's decision, 2026-11-16). Outside app/(app), so it
 * needs no session. Nothing imports from here; when a direction is chosen it
 * is rebuilt in components/quincy/shell/ and this folder is deleted.
 */
export const metadata = {
  title: "Prototype — Shell lab",
  robots: { index: false, follow: false },
}

export default function ShellLabPage() {
  // Suspense is what useSearchParams needs to read ?d= without opting the
  // route out of static rendering.
  return (
    <Suspense>
      <ShellLab />
    </Suspense>
  )
}

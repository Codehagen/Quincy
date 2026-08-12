import { Suspense } from "react"

import { Harness } from "./harness"

/**
 * Prototype surface, outside the `(app)` route group so it inherits none of
 * that layout's chrome — the harness renders its own copy of the shell.
 *
 * It still needs a session. `proxy.ts` gates every path outside its `PUBLIC`
 * set, and that runs ahead of any route group, so `/prototypes/*` answers 307
 * to `/login` for a signed-out visitor. The older prototypes in this directory
 * carry a comment claiming the opposite; it was wrong when it was written and
 * has been copied forward since.
 *
 * Nothing in `app/(app)` or `components/` imports from here — when a variant
 * is chosen, it gets rebuilt in place and this directory is deleted.
 */
export const metadata = {
  title: "Prototype — Numbers",
  robots: { index: false, follow: false },
}

export default function NumbersPrototypePage() {
  // No wrapper of our own: the harness renders the real SidebarProvider shell,
  // which owns its height and background. Suspense is what useSearchParams
  // needs to read ?v=N without opting the whole route out of static rendering.
  return (
    <Suspense>
      <Harness />
    </Suspense>
  )
}

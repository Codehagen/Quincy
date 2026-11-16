/**
 * First run, in its own group. See plans/022.
 *
 * **Deliberately outside the (app) group, and the reason is the same one
 * written at the top of app/(auth)/layout.tsx**: someone who cannot log in has
 * nothing to navigate to, and neither does someone who has not finished first
 * run. The `(app)` layout redirects every route in its group to /welcome until
 * `onboardedAt` is set — so while the sidebar was rendered here, every item in
 * it silently bounced back to this page. A menu where nothing works is worse
 * than no menu, and it was the first thing the first real user reached for.
 *
 * Moving the route out rather than hiding the chrome also removed the machinery
 * that made the gate possible from inside the group: a layout cannot see its
 * own pathname, so `proxy.ts` had been forwarding it in a header purely so this
 * one page could be excluded from a redirect to itself. Nothing needs that now.
 *
 * The mark is the only chrome. It says which product this is, on the one screen
 * where that is not yet obvious from anything else. The frame is the kit's
 * (components/welcome/welcome-frame.tsx), shared with the prototype harness.
 */
import { Suspense } from "react"

import { WelcomeFrame } from "@/components/welcome/welcome-frame"

export default function WelcomeLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <WelcomeFrame>
      {/* cacheComponents: the page reads the session and the interview rows on
          every render, so it needs a boundary above it. The mark paints from
          the static shell; the questions stream. */}
      <Suspense>{children}</Suspense>
    </WelcomeFrame>
  )
}

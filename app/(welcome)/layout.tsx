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
 * where that is not yet obvious from anything else.
 */
import { Suspense } from "react"

export default function WelcomeLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2.5 px-6">
        <span
          aria-hidden="true"
          className="flex size-5 shrink-0 items-center justify-center rounded bg-foreground font-mono text-[0.6875rem] leading-none font-semibold text-background select-none"
        >
          Q
        </span>
        <span className="text-card-title">Quincy</span>
      </header>
      {/* cacheComponents: the page reads the session and the interview rows on
          every render, so it needs a boundary above it. The mark paints from
          the static shell; the questions stream. */}
      <div className="flex min-h-0 flex-1 flex-col">
        <Suspense>{children}</Suspense>
      </div>
    </div>
  )
}

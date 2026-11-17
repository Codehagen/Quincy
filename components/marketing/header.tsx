import { Suspense } from "react"
import Link from "next/link"

import { FOCUS_RING, HIT_40_44 } from "@/components/kit/control-styles"
import { QuincyMark } from "@/components/mascot"
import { getSession } from "@/lib/session"

import { MarketingButtonLink } from "./button"
import { NavLink } from "./nav-link"

/**
 * Signed out: Pricing as a link and one action, the waitlist. Rendered twice,
 * as the real answer for a visitor with no session and as the Suspense
 * fallback while the session resolves, so a stranger (this surface's
 * audience) sees the right header in the first paint with nothing streaming.
 *
 * `/#join`, not `#join`: this header renders on /pricing, /why, /changelog
 * and /privacy too, where an anchor with no path scrolls to nothing. There
 * is no "Log in": /signup refuses anyone without an invite, and an invited
 * tester reaches /login from the link in their mail (plans/023).
 */
function SignedOut() {
  return (
    <>
      <NavLink href="/pricing">Pricing</NavLink>
      <MarketingButtonLink href="/#join">Join the waitlist</MarketingButtonLink>
    </>
  )
}

/**
 * The one per-request read on the marketing surface, behind Suspense so
 * every page prerenders into a static shell. Signed in, the door is the app,
 * and Pricing goes: a subscriber changes plan from /settings.
 */
async function Auth() {
  const session = await getSession()
  if (!session) return <SignedOut />
  return <MarketingButtonLink href="/studio">Open Studio</MarketingButtonLink>
}

/** The marketing header: the lockup home, How it works, and the auth slot. No props. */
export function MarketingHeader() {
  return (
    <header className="mx-auto flex h-kit-header w-full max-w-kit-marketing items-center justify-between gap-kit-related px-kit-page-gutter">
      <Link
        href="/"
        aria-label="Quincy"
        className={`relative rounded-kit-chip text-kit-ink transition-[color] duration-(--kit-duration-state) ease-kit-out hover:text-kit-ink-hover motion-reduce:transition-none ${FOCUS_RING} ${HIT_40_44}`}
      >
        <QuincyMark size="sm" />
      </Link>
      <nav aria-label="Main" className="flex items-center gap-5 sm:gap-6">
        <NavLink href="/#how" narrow="hide">
          How it works
        </NavLink>
        {/* One grid cell holds the signed-out cluster, hidden, under the real
            answer, so the slot is always as wide as the wider of the two and
            "Open Studio" streaming in for a signed-in visitor moves nothing. */}
        <span className="grid items-center justify-items-end">
          <span aria-hidden inert className="invisible col-start-1 row-start-1 flex items-center gap-5 sm:gap-6">
            <SignedOut />
          </span>
          <span className="col-start-1 row-start-1 flex items-center gap-5 sm:gap-6">
            <Suspense fallback={<SignedOut />}>
              <Auth />
            </Suspense>
          </span>
        </span>
      </nav>
    </header>
  )
}

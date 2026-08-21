import { Suspense } from "react"
import Link from "next/link"

import { getSession } from "@/lib/session"
import { Button } from "@/components/ui/button"

/**
 * Outside the (app) group on purpose: no sidebar, no conversation list, no
 * database read beyond the session. A stranger should get a page, not an app
 * shell with everything in it disabled.
 */

/**
 * The signed-out header actions, extracted because they are used twice: as the
 * real content for a visitor with no session, and as the Suspense fallback
 * while the session resolves. That doubling is what keeps the static shell
 * honest — a stranger, who is the audience of this surface, sees the correct
 * header in the first paint with nothing streaming behind it.
 */
function SignedOutActions() {
  return (
    <div className="flex items-center gap-2">
      {/* The 44px vertical hit area is added by hand because globals.css
          grows `[data-slot="button"]` on coarse pointers, and this is
          deliberately not a button. */}
      <Link
        href="/pricing"
        className="relative mr-1 rounded-sm px-1 text-body text-muted-foreground underline-offset-4 ring-ring outline-hidden transition-colors duration-150 hover:text-foreground focus-visible:ring-2 pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:top-1/2 pointer-coarse:after:h-11 pointer-coarse:after:-translate-y-1/2"
      >
        Pricing
      </Link>
      {/* One action, and "Get started" and "Log in" are both gone with the
          waitlist in front (plans/023). Neither door opens for a stranger:
          `/signup` refuses anyone without an invite code, and a person who has
          not joined has nothing to log in to. Advertising them here is an
          invitation to fail.

          `/#join` rather than `#join`, because this header renders on
          `/pricing`, `/why` and `/privacy` too, and on those an anchor with no
          path scrolls to nothing.

          An invited tester reaches `/login` from the link in their mail and
          never reads this header. The route is untouched — it is removed from
          the page, not from the app. */}
      <Button nativeButton={false} size="sm" render={<Link href="/#join" />}>
        Join the waitlist
      </Button>
    </div>
  )
}

/**
 * The one per-request read on the whole marketing surface, isolated behind
 * Suspense so the rest of the page prerenders into a static shell. Reading the
 * session in the layout body used to make every marketing page dynamic —
 * a serverless render per anonymous visit, all to decide which button the
 * header shows.
 *
 * One action, and it says which door it opens. Signed in, the door is
 * the app; signed out, it is the sign-up. Neither state shows both.
 *
 * Pricing sits beside it as a *link*, not a second button, so that
 * rule survives intact — navigation is not an action. Signed-out only:
 * a subscriber who wants to change plan goes through the billing
 * portal from /settings, and a permanent nav row pointing at the price
 * they already pay is a worse answer to that.
 *
 * The fallback is the signed-out state, not a skeleton. For a stranger the
 * streamed answer is identical to the fallback, so nothing moves. A signed-in
 * owner sees the signed-out buttons for a beat before "Open Studio" replaces
 * them — and if they click "Log in" inside that beat, proxy.ts already
 * redirects a session-holder to /studio, so the wrong door opens on the right
 * room.
 */
async function HeaderAuth() {
  const session = await getSession()

  if (!session) {
    return <SignedOutActions />
  }

  return (
    <Button nativeButton={false} size="sm" render={<Link href="/studio" />}>
      Open Studio
    </Button>
  )
}

export default function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
        <Link
          href="/"
          aria-label="Quincy"
          className="flex items-center gap-2.5 rounded-md ring-ring outline-hidden focus-visible:ring-2"
        >
          <span
            aria-hidden="true"
            className="flex size-5 shrink-0 items-center justify-center rounded bg-foreground font-mono text-[0.6875rem] leading-none font-semibold text-background select-none"
          >
            Q
          </span>
          <span aria-hidden="true" className="text-card-title">
            Quincy
          </span>
        </Link>

        <Suspense fallback={<SignedOutActions />}>
          <HeaderAuth />
        </Suspense>
      </header>

      <main className="flex-1">{children}</main>

      {/* The privacy link lives here rather than in the app shell because this
          is the surface a stranger reaches — including LinkedIn's app reviewer,
          who is required to find a valid policy before granting Standard tier.

          "Why it works this way" sits beside it because the headline makes a
          claim that invites the question, and a visitor who wants the argument
          should not have to sign up to find it. Two links, both text — the one
          primary action on this surface is in the header. */}
      {/* Stacked below `sm`, a row above it. Held in one line at every width,
          375px squeezed the three links into a column two words wide and
          "Why it works this way" wrapped over four lines. The breakpoint is
          where the content breaks, not where a device is. */}
      <footer className="mx-auto flex w-full max-w-5xl flex-col items-start gap-4 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-caption text-muted-foreground">
          Quincy. Writes in your voice, sends nothing without you.
        </p>
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {/* In both states here, unlike the header: the footer is where a
              signed-in reader goes looking for terms, and it costs nothing. */}
          <Link
            href="/pricing"
            className="rounded-sm text-caption text-muted-foreground underline-offset-4 ring-ring outline-hidden transition-colors duration-150 hover:text-foreground hover:underline focus-visible:ring-2"
          >
            Pricing
          </Link>
          <Link
            href="/changelog"
            className="rounded-sm text-caption text-muted-foreground underline-offset-4 ring-ring outline-hidden transition-colors duration-150 hover:text-foreground hover:underline focus-visible:ring-2"
          >
            Changelog
          </Link>
          <Link
            href="/why"
            className="rounded-sm text-caption text-muted-foreground underline-offset-4 ring-ring outline-hidden transition-colors duration-150 hover:text-foreground hover:underline focus-visible:ring-2"
          >
            Why it works this way
          </Link>
          <Link
            href="/privacy"
            className="rounded-sm text-caption text-muted-foreground underline-offset-4 ring-ring outline-hidden transition-colors duration-150 hover:text-foreground hover:underline focus-visible:ring-2"
          >
            Privacy
          </Link>
        </nav>
      </footer>
    </div>
  )
}

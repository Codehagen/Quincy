"use client"

import Link from "next/link"

import { Button } from "@/components/ui/button"

/**
 * The marketing chrome, mirroring `app/(marketing)/layout.tsx`, so each variant
 * is judged inside the frame it ships in rather than at bare viewport.
 *
 * A copy rather than the production component because that one is an async
 * server component that reads the session, and this harness is a client tree.
 * It is a second copy alongside `app/prototypes/marketing/chrome.tsx` on
 * purpose: these two prototypes are deleted on different days, and a shared
 * import would mean promoting one breaks the other.
 *
 * **The one deliberate difference from production, and it is part of what this
 * run is deciding: a pricing page has to be reachable.** Today the header
 * carries one action and the footer carries two text links; nothing anywhere
 * points at a price. Here "Pricing" is added in both places — in the header as
 * a *link*, not a second button, so the layout's own rule survives intact (one
 * action, and it says which door it opens). Navigation is not an action.
 *
 * If a variant wins, the header link is the part worth arguing about
 * separately: it is the highest-traffic route to the page and also the one
 * change that touches a surface already in production.
 *
 * Rendered signed-out, which is the only state a pricing page has to win.
 */
export function Chrome({ children }: { children: React.ReactNode }) {
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

        <div className="flex items-center gap-2">
          {/* `aria-current="page"` because this prototype *is* the pricing
              page; without it the link is the only nav item that lies about
              where the reader already is. The 44px vertical hit area is added
              by hand for the same reason `chrome.tsx` in the marketing
              prototype does it: globals.css grows `[data-slot="button"]` on
              coarse pointers, and this is deliberately not a button. */}
          <Link
            href="/prototypes/pricing"
            aria-current="page"
            className="relative mr-1 rounded-sm px-1 text-body text-muted-foreground underline-offset-4 ring-ring outline-hidden transition-colors duration-150 hover:text-foreground focus-visible:ring-2 pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:top-1/2 pointer-coarse:after:h-11 pointer-coarse:after:-translate-y-1/2"
          >
            Pricing
          </Link>
          <Button
            nativeButton={false}
            variant="ghost"
            size="sm"
            render={<Link href="/login" />}
          >
            Log in
          </Button>
          <Button
            nativeButton={false}
            size="sm"
            render={<Link href="/signup" />}
          >
            Get started
          </Button>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-6 py-8">
        <p className="text-caption text-muted-foreground">
          Quincy. Writes in your voice, sends nothing without you.
        </p>
        {/* Production ships these at ~22px tall. The 44px pseudo-element is
            the fix the last run wrote down and has not landed yet; it is
            carried here so this prototype is not judged with a known bug in
            its frame. */}
        <nav className="flex items-center gap-5">
          {[
            { href: "/prototypes/pricing", label: "Pricing" },
            { href: "/why", label: "Why it works this way" },
            { href: "/privacy", label: "Privacy" },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="relative rounded-sm text-caption text-muted-foreground underline-offset-4 ring-ring outline-hidden transition-colors duration-150 hover:text-foreground hover:underline focus-visible:ring-2 pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:top-1/2 pointer-coarse:after:h-11 pointer-coarse:after:-translate-y-1/2"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </footer>
    </div>
  )
}

/**
 * The call-to-action pair, shared by all three variants so the comparison is
 * about the page rather than about the button.
 *
 * Identical to the marketing prototype's `HeroActions`, including the 44px
 * height override: `buttonVariants` tops out at `lg` = 36px, which is app
 * chrome, and the same "add a marketing size" note applies at promotion.
 *
 * The label is "Start the free day" rather than "Get started" in every variant.
 * On a pricing page the generic label wastes the one place a visitor is most
 * likely to hesitate: it should say what pressing it costs, which is nothing.
 */
export function CallToAction({
  secondary,
}: {
  secondary: { href: string; label: string }
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        nativeButton={false}
        size="lg"
        className="h-11 px-5 text-[0.9375rem]"
        render={<Link href="/signup" />}
      >
        Start the free day
      </Button>
      <Link
        href={secondary.href}
        className="relative rounded-sm text-[0.9375rem] text-muted-foreground underline-offset-4 ring-ring outline-hidden transition-colors duration-150 hover:text-foreground hover:underline focus-visible:ring-2 pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:top-1/2 pointer-coarse:after:h-11 pointer-coarse:after:-translate-y-1/2"
      >
        {secondary.label}
      </Link>
    </div>
  )
}

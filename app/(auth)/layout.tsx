import { Suspense } from "react"
import Link from "next/link"

import { KitRoot } from "@/components/kit"
import { FOCUS_RING, HIT_40_44 } from "@/components/kit/control-styles"
import { QuincyMark } from "@/components/mascot"

/**
 * Deliberately outside the (app) group: no sidebar, no chat chrome. Someone who
 * cannot log in has nothing to navigate to.
 *
 * On the kit (plans/029): the white ground, the landing's lockup on top as the
 * one way home, and each page's one object under it. The lockup is the friend
 * at rest (`idle`): nothing is running for someone who is not signed in yet.
 *
 * The Suspense boundary is for cacheComponents: /login and /reset-password
 * read their searchParams (the `next` path, the reset token), and every
 * per-request read has to sit under a boundary. The mark and the centering
 * shell prerender; the form streams into them.
 */
export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <KitRoot>
      <main className="flex min-h-dvh flex-col items-center px-kit-page-gutter py-12 sm:justify-center sm:py-16">
        {/* The landing's object padding (28 × 24) from 40rem, as KitPage
            sets it, so the Card here matches the cards in the app. */}
        <div className="flex w-full max-w-[25rem] flex-col gap-kit-under-mark sm:[--kit-object-pad-x:var(--spacing-kit-pad-x)] sm:[--kit-object-pad-y:var(--spacing-kit-pad-y)]">
          <Link
            href="/"
            aria-label="Quincy"
            className={`relative self-start rounded-kit-chip text-kit-ink transition-[color] duration-(--kit-duration-state) ease-kit-out hover:text-kit-ink-hover motion-reduce:transition-none ${FOCUS_RING} ${HIT_40_44}`}
          >
            <QuincyMark size="md" />
          </Link>
          <Suspense>{children}</Suspense>
        </div>
      </main>
    </KitRoot>
  )
}

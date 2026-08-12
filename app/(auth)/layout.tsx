import { Suspense } from "react"

/**
 * Deliberately outside the (app) group: no sidebar, no chat chrome. Someone who
 * cannot log in has nothing to navigate to.
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
    <div className="flex min-h-svh flex-col items-center justify-center px-6 py-12">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex size-5 shrink-0 items-center justify-center rounded bg-foreground font-mono text-[0.6875rem] leading-none font-semibold text-background select-none"
          >
            Q
          </span>
          <span className="text-card-title">Quincy</span>
        </div>
        <Suspense>{children}</Suspense>
      </div>
    </div>
  )
}

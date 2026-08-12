import { notFound } from "next/navigation"
import { Suspense } from "react"

import { AppProviders } from "@/components/app-providers"

/**
 * Where the prototypes are reachable, and where they are not.
 *
 * Production says no. These are ~13k lines of design exploration — variant
 * pickers holding losing directions, fixtures that assert things no real
 * account has, and half-wired controls — and until now the only thing between
 * them and the public web was `proxy.ts`, which is a cookie *presence* check
 * by its own admission, not a gate. A stranger who signed up could read every
 * abandoned idea in the product.
 *
 * Preview keeps them, because that is where a direction gets judged on a real
 * device and shown to someone else. `VERCEL_ENV` is the only variable that can
 * tell the two apart: `NODE_ENV` is `production` on a preview build too.
 *
 * `notFound()` rather than a redirect — a route that should not exist here
 * should answer as if it does not.
 */
const VISIBLE =
  process.env.NODE_ENV !== "production" || process.env.VERCEL_ENV === "preview"

/**
 * Exists for one reason: the prototype pages reach for the same client
 * machinery as the real ones (TanStack Query, nuqs), and those providers no
 * longer mount at the root. Without this layout every `useQueryState` in a
 * variant throws at hydration.
 */
export default function PrototypesLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  if (!VISIBLE) notFound()

  return (
    <AppProviders>
      {/* cacheComponents: /prototypes/rhythm/[id] awaits its params, and a
          per-request read needs a boundary above it. Costs the static pages
          nothing. */}
      <Suspense>{children}</Suspense>
    </AppProviders>
  )
}

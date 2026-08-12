import { Suspense } from "react"

import { AppProviders } from "@/components/app-providers"

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
  return (
    <AppProviders>
      {/* cacheComponents: /prototypes/rhythm/[id] awaits its params, and a
          per-request read needs a boundary above it. Costs the static pages
          nothing. */}
      <Suspense>{children}</Suspense>
    </AppProviders>
  )
}

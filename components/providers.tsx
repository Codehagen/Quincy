"use client"

import * as React from "react"

import { ThemeProvider } from "@/components/theme-provider"

/**
 * Root providers, and deliberately only one: the theme. next-themes writes the
 * class on <html>, so it has to wrap the whole document — and every surface,
 * marketing included, renders in both themes.
 *
 * TanStack Query, nuqs, and the tooltip context used to live here too, which
 * meant a stranger on the landing page hydrated three libraries the page never
 * calls. They now mount in AppProviders, inside the groups that consume them —
 * see components/app-providers.tsx.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>
}

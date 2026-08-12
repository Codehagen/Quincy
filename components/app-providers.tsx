"use client"

import * as React from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { NuqsAdapter } from "nuqs/adapters/next/app"

import { TooltipProvider } from "@/components/ui/tooltip"

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Anything above zero stops the immediate refetch on mount that
        // otherwise throws away server-rendered data the moment it hydrates.
        staleTime: 60 * 1000,
        gcTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
        // A 404 or a 401 will not fix itself on the third attempt.
        retry: (failureCount, error) => {
          const status = (error as { status?: number })?.status
          if (status && status >= 400 && status < 500) {
            return false
          }
          return failureCount < 2
        },
      },
    },
  })
}

/**
 * The providers only product surfaces consume: TanStack Query, nuqs, and the
 * tooltip timing context. Deliberately not in the root layout — every consumer
 * of these three lives under (app) or /prototypes, and mounting them at the
 * root shipped all three libraries to the marketing page, which uses none of
 * them. The only provider the whole document needs is the theme, and that one
 * stays in app/layout.tsx.
 */
export function AppProviders({ children }: { children: React.ReactNode }) {
  // useState initializer, never module scope. A module-level client is created
  // once per server process and shared by every request, which leaks one user's
  // cached data into another's render. This gives each browser session its own,
  // and the initializer form means it survives re-renders without being rebuilt
  // on each one.
  const [queryClient] = React.useState(makeQueryClient)

  return (
    <QueryClientProvider client={queryClient}>
      {/* NuqsAdapter has to sit above anything calling useQueryState. */}
      <NuqsAdapter>
        {/* delay: incidental mouse travel shouldn't fire a tooltip.
            timeout: once one has opened, neighbours open instantly for
            this long — otherwise moving down a list feels sluggish. */}
        <TooltipProvider delay={200} closeDelay={0} timeout={300}>
          {children}
        </TooltipProvider>
      </NuqsAdapter>
    </QueryClientProvider>
  )
}

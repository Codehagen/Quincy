import { cache } from "react"
import { QueryClient } from "@tanstack/react-query"

/**
 * A QueryClient for prefetching inside a Server Component.
 *
 * `cache` makes it one per request, which is the whole safety property: a
 * module-level client would be created once per server process and shared by
 * every request, so one account's prefetched brain would be handed to the next
 * person to hit the route. Providers.tsx says the same thing about the browser
 * client and gets it with useState; on the server, `cache` is the equivalent.
 *
 * staleTime above zero on purpose. Prefetching and then immediately refetching
 * on mount throws away the data that was just embedded in the HTML, which is
 * the whole point of dehydrating it.
 */
export const getServerQueryClient = cache(
  () =>
    new QueryClient({
      defaultOptions: {
        queries: { staleTime: 60 * 1000 },
      },
    })
)

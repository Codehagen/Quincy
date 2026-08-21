import { Suspense } from "react"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { getSession } from "@/lib/session"
import { getEntitlement, type Entitlement } from "@/lib/billing"
import {
  listConversations,
  type ConversationSummary,
} from "@/lib/conversations"
import { AppProviders } from "@/components/app-providers"
import { BillingBanner } from "@/components/billing/billing-banner"
import { TimeZoneSync } from "@/components/auth/timezone-sync"
import { AppSidebar } from "@/components/app-sidebar"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"

/**
 * A route group rather than the root layout: the chrome belongs to the product
 * surfaces, and a marketing page added later should not have to opt out of it.
 *
 * Split in two since cacheComponents: the outer layout is static and mounts
 * the providers; every per-request read (cookies, session, conversations,
 * entitlement) lives in AppShell behind the Suspense boundary. That boundary
 * also covers the pages below it, so a page in this group is free to read the
 * session or its params without declaring a boundary of its own.
 */
export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    // Query, nuqs and tooltips mount here rather than at the root: every
    // consumer lives in this group (or /prototypes, which has its own copy),
    // and the root layout should not ship them to the marketing page.
    <AppProviders>
      {/* No fallback shell: the sidebar cannot render honestly without the
          session and conversation list, and a fake one that swaps would move
          more than it saves. The static shell paints theme and fonts; content
          streams as one piece — the same order of events as before, minus the
          fully blank first byte. */}
      <Suspense>
        <AppShell>{children}</AppShell>
      </Suspense>
    </AppProviders>
  )
}

async function AppShell({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // SidebarProvider writes this cookie but cannot read it during SSR. Seeding
  // defaultOpen here is what stops a collapsed sidebar from flashing open on
  // every navigation.
  const cookieStore = await cookies()
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false"

  // The proxy only checks that a session cookie exists; this is the real read,
  // and it is the gate for every route in the group.
  //
  // Degrading to an empty conversation list was not enough. A cookie named like
  // a session with any value at all satisfied the proxy, and this layout then
  // rendered the whole app shell around it — signed out, but looking signed in.
  // Nothing leaked, because every route that reads data checks the session and
  // /api/chat answers 401, but "you are in the app" is the wrong answer to give
  // someone who is not.
  //
  // One redirect here rather than one per page: a new surface added to this
  // group is gated by existing, not by remembering.
  const session = await getSession()

  if (!session) {
    redirect("/login?next=/studio")
  }

  /**
   * First run, gated in the same place and for the same reason as the session:
   * a surface added to this group later is covered by existing, not by
   * somebody remembering. See plans/022.
   *
   * `onboardedAt` rides along on the session this request already fetched, so
   * for every account but the newest this costs nothing — which is what makes
   * a check on every navigation in the group affordable at all.
   *
   * Null means "has not been asked", and it is deliberately not derived from
   * whether the brain is empty: a person who skips every question has an empty
   * brain, and a derived check would send them back here forever.
   *
   * No pathname check, because /welcome lives in its own group and cannot
   * reach this layout. It used to sit inside this one, which meant excluding
   * it from a redirect to itself — and a layout cannot see its own pathname,
   * so `proxy.ts` forwarded it in a header for this single comparison. Moving
   * the route deleted all of that.
   */
  if (!session.user.onboardedAt) {
    redirect("/welcome")
  }

  /**
   * Entitlement is resolved here and nowhere else in the group, but note that
   * it does **not** gate: an expired account still gets the whole shell. Read
   * -only means they keep looking at the work that makes subscribing worth it.
   * The gates that matter are in app/api/chat and lib/heartbeat — the places
   * that spend money. See docs/billing.md.
   *
   * Concurrent with the conversation list rather than after it. `getEntitlement`
   * reads the same cached session, and during the free day it answers from the
   * session alone without touching the database, so the common case adds no
   * round trip at all.
   */
  const [conversations, entitlement]: [
    ConversationSummary[],
    Entitlement | null,
  ] = await Promise.all([listConversations(session.user.id), getEntitlement()])

  return (
    <>
      {/* h-svh, not the provider's default min-h-svh. A min-height lets the shell
        grow with its content, which leaves any percentage height inside it
        resolving against nothing — MessageScroller's viewport expanded to fit
        the whole transcript and never scrolled. A definite height here is what
        gives every scroll container below a ceiling to work against. */}
      <SidebarProvider defaultOpen={defaultOpen} className="h-svh">
        {/* Renders nothing, and only for an account that has no timezone yet:
          a Google sign-up, or one older than the column. The check is here
          rather than inside the component so the common case ships no client
          component at all. */}
        {session.user.timezone ? null : <TimeZoneSync />}
        <AppSidebar conversations={conversations} user={session.user} />
        <SidebarInset className="min-h-0 overflow-hidden">
          {/* The rail and ⌘B both toggle the sidebar, but neither is visible.
            This is the affordance that tells you the panel is collapsible —
            and on mobile, where the sidebar is a sheet, it is the only way in.

            No longer sticky: the bar now sits outside the scroll container
            rather than riding along inside it, so it stays put structurally. */}
          <div className="flex h-12 shrink-0 items-center gap-2 bg-background px-3">
            <SidebarTrigger />
          </div>
          {/* Outside the scroll container, like the trigger bar above it — the
            state of the account is not something to scroll past. */}
          {entitlement ? <BillingBanner entitlement={entitlement} /> : null}
          {/* The scroll container for ordinary pages. The chat fills it exactly
            and scrolls inside its own viewport, so this never doubles up. */}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </>
  )
}

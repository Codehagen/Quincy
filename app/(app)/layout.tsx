import { Suspense } from "react"
import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"

import { getSession } from "@/lib/session"
import { getEntitlement, type Entitlement } from "@/lib/billing"
import { safeNextPath } from "@/lib/auth-validation"
import {
  listConversations,
  type ConversationSummary,
} from "@/lib/conversations"
import { AppProviders } from "@/components/app-providers"
import { BillingBanner } from "@/components/billing/billing-banner"
import { TimeZoneSync } from "@/components/auth/timezone-sync"
import { AppShell } from "@/components/quincy/shell/app-shell"
import { SIDEBAR_COOKIE } from "@/components/quincy/shell/shell-cookie"

/**
 * A route group rather than the root layout: the chrome belongs to the product
 * surfaces, and a marketing page added later should not have to opt out of it.
 *
 * Split in two since cacheComponents: the outer layout is static and mounts
 * the providers; every per-request read (cookies, session, conversations,
 * entitlement) lives in Gate behind the Suspense boundary. That boundary
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
        <Gate>{children}</Gate>
      </Suspense>
    </AppProviders>
  )
}

async function Gate({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // The shell writes this cookie but cannot read it during SSR. Seeding
  // defaultOpen here is what stops a collapsed sidebar from flashing open on
  // every navigation.
  const cookieStore = await cookies()
  const defaultOpen = cookieStore.get(SIDEBAR_COOKIE)?.value !== "false"

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
    // Back to the page that was asked for, not to Studio. A layout cannot see
    // its own pathname, so proxy.ts forwards it (`x-quincy-path`); a request
    // that skipped the proxy falls back to Studio. Sanitised here as well as
    // on /login, so this redirect is never the open one. `next` is also the
    // proxy's tell that this is a return to /login, not a visit: without it a
    // stale cookie bounces straight back here.
    const requested = (await headers()).get("x-quincy-path") ?? undefined
    redirect(`/login?next=${encodeURIComponent(safeNextPath(requested))}`)
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
   * the route deleted that comparison. (The header is back, for one other
   * reason: the signed-out redirect above returns you to the page you asked
   * for.)
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
      {/* Renders nothing, and only for an account that has no timezone yet:
          a Google sign-up, or one older than the column. The check is here
          rather than inside the component so the common case ships no client
          component at all. */}
      {session.user.timezone ? null : <TimeZoneSync />}
      {/* The frame (docs/design/app-shell.md). The banner sits outside the
          scroll container: the state of the account is not something to
          scroll past. */}
      <AppShell
        defaultOpen={defaultOpen}
        conversations={conversations}
        timeZone={session.user.timezone}
        user={session.user}
        banner={entitlement ? <BillingBanner entitlement={entitlement} /> : null}
      >
        {children}
      </AppShell>
    </>
  )
}

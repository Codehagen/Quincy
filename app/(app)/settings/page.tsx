import { Suspense } from "react"
import { redirect } from "next/navigation"
import { and, count, desc, eq, gt, isNull, sql } from "drizzle-orm"

import { getBillingSnapshot } from "@/lib/billing"
import { MANAGED_PAYMENTS } from "@/lib/billing-flags"
import { db } from "@/lib/db"
import { MAIL_REPLY_TO } from "@/lib/mail"
import { MCP_CLIENTS_PER_USER } from "@/lib/mcp-gate"
import { constructMetadata } from "@/lib/metadata"
import { formatMicros } from "@/lib/pricing"
// Aliased: `session` is what the auth object is called everywhere else in this
// app, and one of the two names has to give way.
import {
  account as accountTable,
  oauthAccessToken,
  oauthClient,
  oauthConsent,
  oauthRefreshToken,
  session as sessionTable,
  user,
} from "@/lib/schema"
import { getSession } from "@/lib/session"
import { isBillingConfigured, PLAN_PRICE_USD } from "@/lib/stripe"
import { calendarDayIn, resolveTimeZone, startOfDayIn } from "@/lib/timezone"
import { TRIAL_DAYS } from "@/lib/trial"
import { summariseUsage } from "@/lib/usage"
import { describeUserAgent } from "@/lib/user-agent"
import { SettingsDesk } from "@/components/settings/settings-desk"
import { SettingsLoading } from "@/components/settings/settings-loading"
import {
  describeWhen,
  type SettingsBrowser,
  type SettingsData,
  type SettingsPlan,
} from "@/components/settings/settings-rows"

/**
 * Settings, with Plan & billing folded in. A working surface since
 * 2026-11-17 (docs/design/decisions.md, "Settings is a working surface";
 * decided on /prototypes/settings-lab, "Desk"): every setting, browser and
 * agent is a row, the open row in a pane beside the list. See
 * components/settings/settings-desk.tsx. plans/024 has the page's first
 * argument (correct what Quincy believes about you); the rows keep it.
 *
 * Everything is read here and handed down worded: dates in the account's
 * zone, the plan in the billing page's own copy. The client owns which row
 * is open and nothing else.
 */
export const metadata = constructMetadata({
  title: "Settings",
  noIndex: true,
})

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * The reads sit under the page's own Suspense, not only the layout's: on a
 * client navigation the layout's boundary is above what re-renders, so the
 * old page held until every read landed. The same boundary covers
 * `searchParams` (`?checkout=done`) and nuqs's `?section=`: under
 * cacheComponents a read above it would block the prerender. The fallback is
 * the desk's own frame at its final size (SettingsLoading), so nothing moves
 * when the account lands.
 */
export default function SettingsPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<SettingsLoading />}>
      <Settings searchParams={searchParams} />
    </Suspense>
  )
}

async function Settings({ searchParams }: Props) {
  // The snapshot, not the gate: `getEntitlement` short-circuits on the trial
  // and would offer Subscribe to somebody who had already subscribed
  // (lib/billing.ts). It reads the session itself, deduped with this one.
  const [session, snapshot] = await Promise.all([getSession(), getBillingSnapshot()])

  // The layout has already redirected anyone without a session. This is the
  // narrowing, not the gate.
  if (!session || !snapshot) {
    redirect("/login?next=/settings")
  }

  const now = new Date()
  const userId = session.user.id

  /**
   * The displayed fields come from the table, not from `session.user`, and
   * this is a correctness fix rather than a preference. `lib/auth.ts` enables
   * `cookieCache` with a five-minute window, so `session.user` is read from
   * the signed cookie. A save here refreshes that cookie for the *next*
   * request only; the `revalidatePath` re-render inside the same response
   * still sees the old one, and the page would paint one save behind. The
   * row is where the write landed. The session stays the authority on *who*
   * is asking (`user.id`, and the token that marks this browser below).
   *
   * The time zone is read first: "this month" and every date on the page
   * start at midnight where the reader is.
   */
  const [account] = await db
    .select({
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      timezone: user.timezone,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)

  // The row is gone but the session is not: an account deleted underneath a
  // live cookie. Nothing here can be drawn honestly.
  if (!account) {
    redirect("/login?next=/settings")
  }

  const zone = resolveTimeZone(account.timezone)
  const today = calendarDayIn(now, zone)
  const monthStart = startOfDayIn({ ...today, day: 1 }, zone)
  const lastMonthStart = startOfDayIn(
    today.month === 1
      ? { year: today.year - 1, month: 12, day: 1 }
      : { year: today.year, month: today.month - 1, day: 1 },
    zone
  )

  const [ways, rows, agents, [registered], thisMonth, lastMonth] = await Promise.all([
    /**
     * How this account signs in: a `credential` row with a password, a
     * `google` row, or both. The old page always said "with a password",
     * also to an account that only ever signed in with Google and has none,
     * and offered it a password form that could only fail.
     */
    db
      .select({
        providerId: accountTable.providerId,
        hasPassword: sql<boolean>`${accountTable.password} is not null`,
      })
      .from(accountTable)
      .where(eq(accountTable.userId, userId)),
    /**
     * Read from the table rather than through `auth.api.listSessions`: that
     * endpoint sits behind `freshSessionMiddleware` and throws "Session is
     * not fresh" for any session older than a day, which is the right gate
     * on revoking and the wrong one for a page. The gate still applies on the
     * actions, which turn it into a sentence.
     *
     * `expiresAt` is filtered because this query does not inherit the
     * endpoint's housekeeping. `token` never leaves this function: it is the
     * credential the httpOnly cookie holds. Rows are named by id, and
     * `revokeSessions` looks the tokens up again behind an ownership check.
     *
     * The user agent and the two dates are all a session row says about a
     * browser. No place is resolved from the IP and no version is parsed:
     * nothing on this page claims more than the row holds.
     */
    db
      .select({
        id: sessionTable.id,
        token: sessionTable.token,
        userAgent: sessionTable.userAgent,
        createdAt: sessionTable.createdAt,
        updatedAt: sessionTable.updatedAt,
      })
      .from(sessionTable)
      .where(and(eq(sessionTable.userId, userId), gt(sessionTable.expiresAt, now))),
    /**
     * The MCP clients this account has authorized, newest first. Keyed on
     * `oauth_consent`, not on `oauth_client`: a client that identifies itself
     * with a Client ID Metadata Document is owned by nobody, and a list keyed
     * on `oauth_client.user_id` would miss exactly the agents a stranger's
     * software brought. One row per client; `greatest(max(), max())` over the
     * two token tables says when it last took a key (revoked refresh rows
     * are joined out). `owned` says how far removal goes: a client this
     * account registered is deleted, one that arrived by CIMD loses its
     * consent and keys.
     */
    db
      .select({
        clientId: oauthConsent.clientId,
        name: oauthClient.name,
        owner: oauthClient.userId,
        createdAt: oauthConsent.createdAt,
        lastToken: sql<string | Date | null>`greatest(
          max(${oauthAccessToken.createdAt}),
          max(${oauthRefreshToken.createdAt})
        )`,
      })
      .from(oauthConsent)
      .leftJoin(oauthClient, eq(oauthClient.clientId, oauthConsent.clientId))
      .leftJoin(
        oauthAccessToken,
        and(
          eq(oauthAccessToken.clientId, oauthConsent.clientId),
          eq(oauthAccessToken.userId, userId),
          isNull(oauthAccessToken.revoked)
        )
      )
      .leftJoin(
        oauthRefreshToken,
        and(
          eq(oauthRefreshToken.clientId, oauthConsent.clientId),
          eq(oauthRefreshToken.userId, userId),
          isNull(oauthRefreshToken.revoked)
        )
      )
      .where(eq(oauthConsent.userId, userId))
      .groupBy(oauthConsent.clientId, oauthClient.name, oauthClient.userId, oauthConsent.createdAt)
      .orderBy(desc(oauthConsent.createdAt)),
    /**
     * The clients this account registered by hand, consented to or not: the
     * number `registerAgent` holds against MCP_CLIENTS_PER_USER, counted the
     * same way, so the row's "19/20" and the refusal agree.
     */
    db.select({ clients: count() }).from(oauthClient).where(eq(oauthClient.userId, userId)),
    // This month and last month from `usage_event`, as /credits reads it, so
    // the month is stated against the person's own last one (vision.md).
    summariseUsage(userId, monthStart),
    summariseUsage(userId, lastMonthStart, monthStart),
  ])

  /**
   * One row per browser, not one per session: a row is a decision, and nine
   * rows reading "Chrome on macOS" are nine decisions nobody can tell apart.
   * This browser is never folded into a group: it is the row the reader has
   * to identify before any of the others mean anything.
   */
  const groups = new Map<
    string,
    { ids: string[]; name: string; current: boolean; updatedAt: Date; createdAt: Date }
  >()
  for (const row of rows) {
    const current = row.token === session.session.token
    const name = describeUserAgent(row.userAgent)
    const key = current ? "current" : name
    const existing = groups.get(key)
    if (!existing) {
      groups.set(key, { ids: [row.id], name, current, updatedAt: row.updatedAt, createdAt: row.createdAt })
      continue
    }
    existing.ids.push(row.id)
    if (row.updatedAt > existing.updatedAt) existing.updatedAt = row.updatedAt
    if (row.createdAt < existing.createdAt) existing.createdAt = row.createdAt
  }
  const browsers: SettingsBrowser[] = [...groups.values()]
    .sort((a, b) => {
      if (a.current !== b.current) return a.current ? -1 : 1
      return b.updatedAt.getTime() - a.updatedAt.getTime()
    })
    .map((g) => ({
      id: g.ids[0]!,
      ids: g.ids,
      name: g.name,
      count: g.ids.length,
      current: g.current,
      lastUsed: describeWhen(g.updatedAt, zone, now),
      signedIn: describeWhen(g.createdAt, zone, now),
    }))

  /**
   * `lastToken` comes back from an aggregate, so it may arrive as a string
   * depending on what the driver parsed. Normalised rather than trusted: a
   * `RangeError` on a settings page is a settings page nobody can open.
   */
  const connected = agents.map((agent) => {
    const last = agent.lastToken ? new Date(agent.lastToken) : null
    return {
      clientId: agent.clientId,
      name: agent.name?.trim() || "Unnamed agent",
      owned: agent.owner === userId,
      connected: agent.createdAt ? describeWhen(agent.createdAt, zone, now) : null,
      lastKey: last && !Number.isNaN(last.getTime()) ? describeWhen(last, zone, now) : null,
    }
  })

  // ── The plan, in the billing page's own copy ──────────────────────────────

  // A period that ends at 23:30 UTC is already the next day in Oslo, and
  // "renews on 31 August" against a card that charges on 1 September is the
  // kind of small wrongness people screenshot.
  const renews = snapshot.periodEnd?.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: zone,
  })
  const renewsShort = snapshot.periodEnd?.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: zone,
  })
  const trialEnds = snapshot.trialEndsAt?.toLocaleString("en-GB", {
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: zone,
  })

  const copy: Pick<SettingsPlan, "title" | "body" | "mode"> = {
    trialing: {
      title: trialEnds ? `Free until ${trialEnds}.` : "Your free trial is on.",
      body: `Your ${TRIAL_DAYS === 1 ? "day" : `${TRIAL_DAYS} days`} is on us. Everything is switched on, and no card is needed to finish it. Subscribe whenever you are ready and the trial rolls straight into a plan.`,
      mode: "subscribe" as const,
    },
    active: snapshot.cancelAtPeriodEnd
      ? {
          title: `Ends ${renews ?? "at the end of the period"}.`,
          body: "Your plan is cancelled but still running. Nothing changes until the date above, and restarting before then costs nothing.",
          mode: "manage" as const,
        }
      : {
          title: "You are on the plan.",
          body: `Everything is switched on${renews ? `, and renews ${renews}` : ""}. Change your card or pull an invoice from the Stripe portal. It is the same billing account, not a copy of it.`,
          mode: "manage" as const,
        },
    expired: {
      title: "Your free day is over.",
      body: "Your brain, your conversations and your drafts are all still here and always will be. What has stopped is Quincy writing. Subscribe and it picks up mid-sentence.",
      mode: "subscribe" as const,
    },
    lapsed: snapshot.recoverable
      ? {
          title: "A payment did not go through.",
          body: "Your subscription is still open, but the last charge failed. Nothing has been deleted. Update your card in the Stripe portal and the same plan switches back on.",
          mode: "manage" as const,
        }
      : {
          title: "Your subscription is no longer active.",
          body: "The plan was cancelled. Nothing has been deleted. Start the plan again and everything switches back on.",
          mode: "subscribe" as const,
        },
  }[snapshot.state]

  const plan: SettingsPlan = {
    state: snapshot.state,
    ending: snapshot.cancelAtPeriodEnd,
    recoverable: snapshot.recoverable,
    title: copy.title,
    body: copy.body,
    // A past_due or unpaid subscription is still open in Stripe. Whatever the
    // state word says, the way out is the portal: a Subscribe here would
    // start a second subscription, and both would bill once the card is
    // fixed. Only cancelled or none subscribes.
    mode: snapshot.recoverable ? "manage" : copy.mode,
    trialEnds,
    renews,
    renewsShort,
  }

  // Back from Checkout (billing-actions.tsx sets this successUrl). Confirmed
  // when the snapshot already says active; pending when it does not yet, and
  // pending never renders Subscribe, because a second Checkout during the
  // lag opens a second subscription. An active plan already ending is not a
  // purchase that just happened, so it gets the ordinary pane.
  const { checkout } = await searchParams
  const back = checkout === "done"
  const checkoutState =
    back && snapshot.state === "active" && !snapshot.cancelAtPeriodEnd
      ? ("confirmed" as const)
      : back && snapshot.state !== "active"
        ? ("pending" as const)
        : null

  const data: SettingsData = {
    name: account.name ?? "",
    email: account.email,
    emailVerified: account.emailVerified,
    password: ways.some((w) => w.providerId === "credential" && w.hasPassword),
    google: ways.some((w) => w.providerId === "google"),
    timezone: zone,
    nowIso: now.toISOString(),
    browsers,
    agents: connected,
    registered: registered?.clients ?? 0,
    agentLimit: MCP_CLIENTS_PER_USER,
    plan,
    usage: {
      turns: thisMonth.turns,
      cost: formatMicros(thisMonth.costMicros),
      lastMonthTurns: lastMonth.turns > 0 ? lastMonth.turns : null,
    },
    billing: {
      configured: isBillingConfigured,
      price: PLAN_PRICE_USD,
      managed: MANAGED_PAYMENTS,
      checkout: checkoutState,
    },
    supportEmail: MAIL_REPLY_TO,
  }

  return <SettingsDesk data={data} />
}

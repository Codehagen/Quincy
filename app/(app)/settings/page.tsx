import { redirect } from "next/navigation"
import { and, desc, eq, gt, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { formatConversationDate } from "@/lib/format-date"
import { MAIL_REPLY_TO } from "@/lib/mail"
import { constructMetadata } from "@/lib/metadata"
// Aliased: `session` is what the auth object is called everywhere else in this
// app, and one of the two names has to give way.
import {
  oauthAccessToken,
  oauthApplication,
  session as sessionTable,
  user,
} from "@/lib/schema"
import { getSession } from "@/lib/session"
import { resolveTimeZone } from "@/lib/timezone"
import { describeUserAgent } from "@/lib/user-agent"
import {
  PageHeader,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from "@/components/page-header"
import { SettingsBriefing } from "@/components/settings/settings-briefing"

/**
 * Settings. See plans/024 for the decision and the two directions that lost.
 *
 * Everything is read on the server and handed down whole: the client component
 * owns which drawer is open and nothing else. The session read is deduped with
 * the layout's by `getSession`, so this page costs one extra round trip — the
 * session list — rather than two.
 */
export const metadata = constructMetadata({
  title: "Settings",
  noIndex: true,
})

export default async function SettingsPage() {
  const session = await getSession()

  // The layout has already redirected anyone without a session. This is the
  // narrowing, not the gate.
  if (!session) {
    redirect("/login?next=/settings")
  }

  const now = new Date()

  /**
   * The displayed fields come from the table, not from `session.user`, and this
   * is a correctness fix rather than a preference.
   *
   * `lib/auth.ts` enables `cookieCache` with a five-minute window: the session
   * — name, email and timezone included — is read from the signed cookie
   * without touching the database. A server action here writes through
   * `auth.api.updateUser`, which does refresh that cookie, but the refreshed
   * cookie only reaches the *next* request. The `revalidatePath` re-render
   * happens inside the same response and still sees the old one, so the page
   * paints the value from before the save.
   *
   * The symptom is a page permanently one save behind: rename to Alpha and it
   * still says Dev, rename to Beta and it says Alpha. Reloading corrects it,
   * which is what makes it easy to miss — and it only shows up when the cookie
   * cache is warm, so a first save after a cold load looks fine.
   *
   * Reading the row directly is the fix, because the row is where the write
   * already landed. The session is still the authority on *who* is asking
   * (`user.id`, and the token that marks the current browser below); it is no
   * longer the authority on what to display.
   */
  const [[account], rows, agents] = await Promise.all([
    db
      .select({
        name: user.name,
        email: user.email,
        timezone: user.timezone,
      })
      .from(user)
      .where(eq(user.id, session.user.id))
      .limit(1),
    /**
     * Read from the table rather than through `auth.api.listSessions`, and not
     * as a preference — that endpoint sits behind `freshSessionMiddleware`, so
     * it throws `APIError: Session is not fresh` for any session older than
     * `freshAge` (a day by default). That is the right gate for a sensitive
     * *action* and the wrong one for a page: a settings page that 500s because
     * you signed in yesterday is a settings page nobody can reach when they need
     * it. Found by opening it, not by reading the types.
     *
     * The freshness gate still applies where it belongs — on revoking — and
     * `actions.ts` turns that error into a sentence instead of a crash.
     *
     * `expiresAt` is filtered here because this query does not inherit the
     * endpoint's housekeeping: an expired row sits in the table until something
     * deletes it, and listing it would say a browser is signed in when it is not.
     *
     * `token` never leaves this function. It is the credential the `httpOnly`
     * cookie holds, and putting it in the markup would hand every session to any
     * script that runs on this page. Rows are named by id, and `revokeSessions`
     * looks the tokens up again behind an ownership check.
     */
    db
      .select({
        id: sessionTable.id,
        token: sessionTable.token,
        userAgent: sessionTable.userAgent,
        updatedAt: sessionTable.updatedAt,
      })
      .from(sessionTable)
      .where(
        and(
          eq(sessionTable.userId, session.user.id),
          gt(sessionTable.expiresAt, now)
        )
      ),
    /**
     * The MCP clients this account has authorized, newest first.
     *
     * One row per registered client, not one per token: a client that has been
     * connected for a month holds a chain of `oauth_access_token` rows — one per
     * hour of use, plus one for every refresh — and listing those would be the
     * same mistake the session list already learned, nine rows nobody can tell
     * apart. `max(created_at)` over the join answers the only question the
     * chain is good for: when did this thing last take a key.
     *
     * A left join, so a client registered and never authorized still appears.
     * That row is exactly the one worth seeing — something asked for access and
     * the person may not remember saying yes.
     *
     * `client_id`, not the row id, because that is what the tokens reference and
     * what the removal names. It is not a credential: it travels in the query
     * string of every authorization request.
     */
    db
      .select({
        clientId: oauthApplication.clientId,
        name: oauthApplication.name,
        createdAt: oauthApplication.createdAt,
        lastToken: sql<
          string | Date | null
        >`max(${oauthAccessToken.createdAt})`,
      })
      .from(oauthApplication)
      .leftJoin(
        oauthAccessToken,
        eq(oauthAccessToken.clientId, oauthApplication.clientId)
      )
      .where(eq(oauthApplication.userId, session.user.id))
      .groupBy(
        oauthApplication.clientId,
        oauthApplication.name,
        oauthApplication.createdAt
      )
      .orderBy(desc(oauthApplication.createdAt)),
  ])

  // The row is gone but the session is not: an account deleted underneath a
  // live cookie. Nothing on this page can be drawn honestly, so send them to
  // sign in rather than render a page about a user that no longer exists.
  if (!account) {
    redirect("/login?next=/settings")
  }

  const zone = resolveTimeZone(account.timezone)

  /**
   * One row per browser, not one row per session — because a row is a thing you
   * are asked to make a decision about, and nine rows reading "Chrome on macOS"
   * are nine decisions nobody can tell apart.
   *
   * This is not a hypothetical. The account this was built for has ten live
   * sessions: nine Chrome on the same laptop and one iPhone. Every sign-in adds
   * a row and nothing removes it until it expires, so the count climbs on its
   * own. Listed one per session, the "Sign out" beside row three promises a
   * choice the reader has no way to aim — the only distinguishing mark is a
   * date, and the date is the same on most of them.
   *
   * Grouped, the list says the two things a person actually came to find out:
   * which browsers hold a key, and is one of them not mine. The phone is still
   * one press away, which was the case worth keeping.
   */
  const groups = new Map<
    string,
    { ids: string[]; browser: string; current: boolean; updatedAt: Date }
  >()

  for (const row of rows) {
    const current = row.token === session.session.token
    const browser = describeUserAgent(row.userAgent)
    // This browser is never folded into a group. It is the row the reader has to
    // identify before any of the others mean anything, and "9 sessions, one of
    // them yours" would bury it.
    const key = current ? "current" : browser
    const existing = groups.get(key)

    if (!existing) {
      groups.set(key, {
        ids: [row.id],
        browser,
        current,
        updatedAt: row.updatedAt,
      })
      continue
    }

    existing.ids.push(row.id)
    if (row.updatedAt > existing.updatedAt) existing.updatedAt = row.updatedAt
  }

  const sessionGroups = [...groups.values()]
    .sort((a, b) => {
      if (a.current !== b.current) return a.current ? -1 : 1
      return b.updatedAt.getTime() - a.updatedAt.getTime()
    })
    .map((group) => ({
      ids: group.ids,
      browser: group.browser,
      count: group.ids.length,
      // Zone-aware for the same reason the billing page is: "Yesterday"
      // computed in UTC is wrong for half of every evening in Oslo. For a group
      // this is the newest of them — the answer to "is this still in use".
      lastSeen: group.current
        ? "Active now"
        : `Last used ${formatConversationDate(group.updatedAt, zone, now).toLowerCase()}`,
      current: group.current,
    }))

  /**
   * Both dates in this person's own zone, for the same reason the session list
   * is: "Yesterday" computed in UTC is wrong for half of every evening in Oslo.
   *
   * `lastToken` comes back from an aggregate rather than a mapped column, so it
   * may arrive as a string depending on what the driver decided to parse.
   * Normalised here rather than trusted — a `RangeError` on a settings page is
   * a settings page nobody can open.
   */
  const connectedAgents = agents.map((agent) => {
    const last = agent.lastToken ? new Date(agent.lastToken) : null

    return {
      clientId: agent.clientId,
      name: agent.name?.trim() || "Unnamed agent",
      connected: `Connected ${formatConversationDate(agent.createdAt, zone, now).toLowerCase()}`,
      lastToken:
        last && !Number.isNaN(last.getTime())
          ? `last key ${formatConversationDate(last, zone, now).toLowerCase()}`
          : "never used",
    }
  })

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-8 py-10">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Settings.</PageHeaderTitle>
          <PageHeaderDescription>
            What Quincy knows about the account, and how to correct it.
          </PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>

      <SettingsBriefing
        name={account.name?.trim() || account.email}
        email={account.email}
        timezone={zone}
        sessionGroups={sessionGroups}
        connectedAgents={connectedAgents}
        supportEmail={MAIL_REPLY_TO}
        nowIso={now.toISOString()}
      />
    </div>
  )
}

import { and, eq, gte, inArray, ne } from "drizzle-orm"

import {
  getCirclebackSetup,
  getGithubSetup,
  getOpenMergeQuestion,
} from "@/app/(app)/sources/actions"
import {
  later,
  LATER_CHANNELS,
  LIVE,
  type CatalogueEntry,
  type Connector,
  type ConnectorDetail,
  type ConnectorMetric,
  type ConnectorStatus,
} from "./connectors"
import { getBrainByKind, type PolicyData } from "./brain"
import {
  isChannelEnabled,
  isConnectableChannel,
  isRefreshable,
  listConnections,
  type SafeConnection,
} from "./channels"
import { corpusSummary } from "./corpus-x"
import { db } from "./db"
import { MEETING_SOURCE_IDS, type KeySource } from "./meeting-sources"
import { formatConversationDate } from "./format-date"
import { metricFor, WINDOW_DAYS } from "./connector-metric"
import { defaultRhythmState, describeCadence, getRhythmStates } from "./rhythms"
import { draft, draftVersion, riff, scheduledPost, sourceItem } from "./schema-app"
import { listSourceConnections, type SafeSourceConnection } from "./source-connections"
import { SOURCES } from "./sources"
import { resolveTimeZone } from "./timezone"

/**
 * The loader behind /connectors. Reads only: nothing here writes, connects
 * or buys anything. Every verb on the page goes through the server actions
 * and routes that already carry the guards (app/(app)/sources/actions.ts,
 * app/(app)/rhythm/actions.ts, /api/connect/*), so their ceilings and
 * cooldowns stay where they were.
 *
 * The shape and the rules are lib/connectors.ts; this
 * file only turns rows into it.
 */

const DAY = 86_400_000
/** The metric's window, and the twelve weeks read behind it for its usual. */
const HISTORY_DAYS = (Math.ceil(WINDOW_DAYS / 7) + 12) * 7

/** The rhythm behind "X bookmarks". */
const BOOKMARKS_RHYTHM = "bookmarks-to-posts"

type User = { id: string; email: string; timezone?: string | null }

export async function loadConnectors(
  user: User,
  { githubOutcome, now = new Date() }: { githubOutcome?: string; now?: Date } = {}
): Promise<Connector[]> {
  const zone = resolveTimeZone(user.timezone)
  const date = (d: Date) => formatConversationDate(d, zone, now)
  const since = new Date(now.getTime() - HISTORY_DAYS * DAY)

  const [sources, circleback, github, question, channels, policies, rhythms, events] = await Promise.all([
    listSourceConnections(user.id),
    getCirclebackSetup(),
    getGithubSetup(),
    getOpenMergeQuestion(),
    listConnections(user.id),
    getBrainByKind(user.id, "policy"),
    getRhythmStates(user.id),
    readEvents(user.id, since),
  ])

  const x = channels.find((c) => c.channel === "x") ?? null
  const xActive = x?.state === "active"
  const corpus = xActive ? await corpusSummary(user.id) : null
  const sourceRow = (id: string) => sources.find((s) => s.source === id) ?? null
  const strategies = new Set(policies.map((p) => (p.data as Partial<PolicyData> | null)?.platform ?? p.slug.split("/").at(-1)))

  const metric = (
    label: string,
    times: readonly Date[],
    from: Date | null
  ): ConnectorMetric | undefined => metricFor(label, times, from, now)

  const out: Connector[] = []

  for (const entry of LIVE) {
    switch (entry.id) {
      case "github": {
        const row = sourceRow("github")
        const merges = events.items.github.filter((d) => now.getTime() - d.getTime() < WINDOW_DAYS * DAY).length
        out.push({
          ...entry,
          status: githubStatus(row, github, question, date),
          metric: row ? metric(`Ideas from ${merges} ${merges === 1 ? "merge" : "merges"}`, events.riffs.github, row.createdAt) : undefined,
          detail: {
            id: "github",
            installUrl: github?.installUrl ?? null,
            account: github?.account ?? "",
            login: github?.login ?? "",
            isOrganisation: github?.isOrganisation ?? false,
            outcome: githubOutcome,
            question,
          },
        })
        break
      }
      case "circleback": {
        const row = sourceRow("circleback")
        const calls = events.items.circleback.filter((d) => now.getTime() - d.getTime() < WINDOW_DAYS * DAY).length
        out.push({
          ...entry,
          status: circlebackStatus(row, circleback, date),
          metric: row ? metric(`Ideas from ${calls} ${calls === 1 ? "call" : "calls"}`, events.riffs.circleback, row.createdAt) : undefined,
          detail: { id: "circleback", url: circleback?.url ?? null, verified: circleback?.verified ?? false },
        })
        break
      }
      case "fathom":
      case "granola": {
        const id = entry.id as KeySource
        const row = sourceRow(id)
        const calls = events.items[id].filter((d) => now.getTime() - d.getTime() < WINDOW_DAYS * DAY).length
        const meta = (row?.meta ?? {}) as { accountEmail?: unknown }
        out.push({
          ...entry,
          status: keySourceStatus(entry.name, row, date),
          metric: row ? metric(`Ideas from ${calls} ${calls === 1 ? "call" : "calls"}`, events.riffs[id], row.createdAt) : undefined,
          detail: {
            id: "key-source",
            source: id,
            connected: Boolean(row?.verified),
            account: typeof meta.accountEmail === "string" ? meta.accountEmail : "",
          },
        })
        break
      }
      case "x-posts": {
        const items = corpus?.items ?? 0
        const status: ConnectorStatus = !xActive
          ? { s: "needs", on: "x", onName: "X" }
          : items > 0
            ? // Short: it is the table's Latest, one line that never truncates.
              { s: "connected", last: `${items} posts read` }
            : { s: "available" }
        out.push({ ...entry, status, detail: { id: "x-posts", items, handle: x?.handle ?? null } })
        break
      }
      case "x-bookmarks": {
        const state = rhythms.get(BOOKMARKS_RHYTHM) ?? defaultRhythmState(BOOKMARKS_RHYTHM)
        const scopeOk = Boolean(x?.scopes.includes("bookmark.read"))
        const cadence = describeCadence(state)
        out.push({
          ...entry,
          status: bookmarksStatus({ xActive, scopeOk, state, cadence, date }),
          metric: xActive && state.enabled ? metric("Drafts from your bookmarks", events.adapted, events.firstAdapted) : undefined,
          detail: { id: "x-bookmarks", enabled: state.enabled, cadence, scopeOk },
        })
        break
      }
      case "voice":
        out.push({ ...entry, status: { s: "builtin" }, detail: { id: "none" } })
        break
      case "x":
      case "linkedin":
      case "instagram": {
        const row = channels.find((c) => c.channel === entry.id) ?? null
        out.push({
          ...entry,
          status: channelStatus(entry, row, now, date),
          metric:
            row && row.state === "active"
              ? metric("Posts published", events.published[entry.id] ?? [], row.createdAt)
              : undefined,
          detail: channelDetail(entry.id, row, strategies.has(entry.id)),
        })
        break
      }
    }
  }

  // The register: listed so the roadmap is visible, with no control.
  const liveIds = new Set(LIVE.map((e) => e.id))
  for (const s of SOURCES) {
    if (liveIds.has(s.id)) continue
    out.push({ ...later(s.id, s.label, "source", s.gives), status: { s: "soon" }, detail: { id: "none" } })
  }
  for (const entry of LATER_CHANNELS) {
    out.push({
      ...entry,
      status: { s: "soon" },
      // A strategy can exist for a channel Quincy cannot connect yet (set up
      // in Studio); its topics and times stay reachable.
      detail: channelDetail(entry.id, null, strategies.has(entry.id)),
    })
  }

  return out
}

/* ── Statuses ─────────────────────────────────────────────────────── */

type DateFmt = (d: Date) => string

function githubStatus(
  row: SafeSourceConnection | null,
  setup: Awaited<ReturnType<typeof getGithubSetup>>,
  question: Awaited<ReturnType<typeof getOpenMergeQuestion>>,
  date: DateFmt
): ConnectorStatus {
  if (!row || !setup?.connected) {
    return setup?.installUrl
      ? { s: "available" }
      : { s: "off", why: "This deployment has no GitHub App yet. Whoever runs it makes one once." }
  }
  if (setup.isOrganisation && !setup.login) {
    return { s: "setup", step: `Installed on ${setup.account}. Say which username is yours.` }
  }
  if (row.state === "broken") {
    return {
      s: "failed",
      why: row.lastError?.trim() || "GitHub stopped sending merges. The app may have been removed from the account.",
      fix: "Install again",
    }
  }
  if (question) return { s: "asks", why: "I couldn't find the story in a merge. One line from you is enough." }
  if (row.state === "paused") {
    return { s: "paused", last: row.lastItemAt ? `Last merge ${lowerDay(date(row.lastItemAt))}` : "Nothing merged yet" }
  }
  if (row.state === "waiting" || !row.lastItemAt) return { s: "waiting", since: date(row.createdAt) }
  return { s: "connected", last: `Last merge ${lowerDay(date(row.lastItemAt))}` }
}

function circlebackStatus(
  row: SafeSourceConnection | null,
  setup: Awaited<ReturnType<typeof getCirclebackSetup>>,
  date: DateFmt
): ConnectorStatus {
  if (!row || !setup) return { s: "available" }
  if (!setup.verified) return { s: "setup", step: "Waiting for the signing secret Circleback shows you." }
  if (row.state === "broken") {
    return {
      s: "failed",
      why: "Circleback's last call didn't verify. The signing secret may have changed.",
      fix: "Paste the secret",
    }
  }
  if (row.state === "paused") {
    return { s: "paused", last: row.lastItemAt ? `Last call ${lowerDay(date(row.lastItemAt))}` : "No calls yet" }
  }
  if (row.state === "waiting" || !row.lastItemAt) return { s: "waiting", since: date(row.createdAt) }
  return { s: "connected", last: `Last call ${lowerDay(date(row.lastItemAt))}` }
}

/**
 * Fathom and Granola. No `setup` state: the key goes in and the webhook is
 * made in the same press, so there is no half-connected step to stand in. A
 * row without a secret is a connect that failed halfway, and reads as one.
 */
function keySourceStatus(name: string, row: SafeSourceConnection | null, date: DateFmt): ConnectorStatus {
  if (!row) return { s: "available" }
  if (!row.verified) {
    return { s: "failed", why: `Connecting ${name} didn't finish. Paste your API key again.`, fix: "Paste the key" }
  }
  if (row.state === "broken") {
    return {
      s: "failed",
      why: row.lastError?.trim() || `${name} refused your API key. It may have been revoked.`,
      fix: "Paste a new key",
    }
  }
  if (row.state === "paused") {
    return { s: "paused", last: row.lastItemAt ? `Last call ${lowerDay(date(row.lastItemAt))}` : "No calls yet" }
  }
  if (row.state === "waiting" || !row.lastItemAt) return { s: "waiting", since: date(row.createdAt) }
  return { s: "connected", last: `Last call ${lowerDay(date(row.lastItemAt))}` }
}

function bookmarksStatus({
  xActive,
  scopeOk,
  state,
  cadence,
  date,
}: {
  xActive: boolean
  scopeOk: boolean
  state: ReturnType<typeof defaultRhythmState>
  cadence: string
  date: DateFmt
}): ConnectorStatus {
  if (!xActive) return { s: "needs", on: "x", onName: "X" }
  // Connections made before 2026-08-08 hold no `bookmark.read` (lib/channels.ts).
  if (!scopeOk) {
    return {
      s: "reauth",
      why: "Your X connection is older than bookmark reading. Reconnect X once and I can read them.",
      fix: "Reconnect X",
    }
  }
  if (!state.enabled) return { s: "available" }
  if (state.lastRun?.state === "failed") {
    return {
      s: "failed",
      why: state.lastRun.summary ? `The last read failed. ${state.lastRun.summary}` : "The last read failed.",
      fix: "Read them now",
    }
  }
  return {
    s: "connected",
    last: state.lastRun ? `Last read ${lowerDay(date(state.lastRun.at))}` : `Reads ${cadence}`,
  }
}

function channelStatus(entry: CatalogueEntry, row: SafeConnection | null, now: Date, date: DateFmt): ConnectorStatus {
  const enabled = isConnectableChannel(entry.id) && isChannelEnabled(entry.id)
  if (row?.state === "needs_reauth") {
    return {
      s: "reauth",
      why:
        entry.id === "linkedin"
          ? "LinkedIn access ends every 60 days and can't renew on its own. It usually takes one click."
          : `${entry.name} access has lapsed. Reconnect to keep publishing.`,
      fix: "Reconnect",
    }
  }
  if (row?.state === "active") {
    const refreshable = isConnectableChannel(entry.id) && isRefreshable(entry.id)
    const days = row.accessTokenExpiresAt ? Math.round((row.accessTokenExpiresAt.getTime() - now.getTime()) / DAY) : null
    // Only for a channel that cannot renew itself (lib/channels-maintenance.ts):
    // X renews silently, so warning about it would manufacture an errand.
    if (!refreshable && days !== null && days >= 0 && days <= 10) {
      return { s: "connected", last: days === 0 ? "Access ends today" : `Access ends in ${days} ${days === 1 ? "day" : "days"}` }
    }
    if (row.lastMetricsAt) return { s: "connected", last: `Read back ${lowerDay(date(row.lastMetricsAt))}` }
    if (row.lastPublishedAt) return { s: "connected", last: `Last post ${lowerDay(date(row.lastPublishedAt))}` }
    return { s: "connected", last: row.handle ? `Connected as ${handleOf(row.handle)}` : "Connected" }
  }
  if (!enabled) return { s: "off", why: `This deployment has no ${entry.name} credentials, so there is nothing to connect to.` }
  return { s: "available" }
}

function channelDetail(platform: string, row: SafeConnection | null, strategy: boolean): ConnectorDetail {
  return {
    id: "channel",
    platform,
    handle: row?.handle ? handleOf(row.handle) : null,
    displayName: row?.displayName ?? null,
    expiresAt: row?.accessTokenExpiresAt?.getTime() ?? null,
    // Computed here: `isRefreshable` reads the channel config, which carries
    // client secrets and must not reach a client component. A boolean does.
    refreshable: isConnectableChannel(platform) ? isRefreshable(platform) : false,
    strategy,
  }
}

function handleOf(handle: string) {
  return handle.startsWith("@") ? handle : `@${handle}`
}

/** "Today" reads as "today" mid-sentence; a date ("3 Nov") stays as it is. */
function lowerDay(s: string) {
  return s === "Today" || s === "Yesterday" ? s.toLowerCase() : s
}

/* ── Metrics ──────────────────────────────────────────────────────── */

/** Four SELECTs of timestamps over the history window. Bounded by the window, never by all time. */
/** The sources whose arrivals and ideas the rows count: GitHub and every note taker. */
const READ_SOURCES = ["github", ...MEETING_SOURCE_IDS] as const
type ReadSource = (typeof READ_SOURCES)[number]

async function readEvents(userId: string, since: Date) {
  const [riffs, items, adapted, firstAdapted, published] = await Promise.all([
    db
      .select({ sourceId: riff.sourceId, at: riff.createdAt })
      .from(riff)
      .where(and(eq(riff.userId, userId), inArray(riff.sourceId, [...READ_SOURCES]), gte(riff.createdAt, since))),
    db
      .select({ source: sourceItem.source, at: sourceItem.createdAt })
      .from(sourceItem)
      .where(
        and(
          eq(sourceItem.userId, userId),
          inArray(sourceItem.source, [...READ_SOURCES]),
          gte(sourceItem.createdAt, since)
        )
      ),
    db
      .select({ at: draft.createdAt })
      .from(draft)
      .where(and(eq(draft.userId, userId), ne(draft.adaptedFromUrl, ""), gte(draft.createdAt, since))),
    db
      .select({ at: draft.createdAt })
      .from(draft)
      .where(and(eq(draft.userId, userId), ne(draft.adaptedFromUrl, "")))
      .orderBy(draft.createdAt)
      .limit(1),
    db
      .select({ channel: draftVersion.channel, at: scheduledPost.publishedAt })
      .from(scheduledPost)
      .innerJoin(draftVersion, eq(draftVersion.id, scheduledPost.draftVersionId))
      .where(
        and(
          eq(scheduledPost.userId, userId),
          eq(scheduledPost.state, "published"),
          gte(scheduledPost.publishedAt, since)
        )
      ),
  ])

  const bySource = <T extends { at: Date | null }>(rows: T[], key: (r: T) => string, id: string) =>
    rows.filter((r) => key(r) === id && r.at).map((r) => r.at as Date)

  const publishedBy: Record<string, Date[]> = {}
  for (const p of published) {
    if (!p.at) continue
    ;(publishedBy[p.channel] ??= []).push(p.at)
  }

  const perSource = <T extends { at: Date | null }>(rows: T[], key: (r: T) => string) =>
    Object.fromEntries(READ_SOURCES.map((id) => [id, bySource(rows, key, id)])) as Record<ReadSource, Date[]>

  return {
    riffs: perSource(riffs, (r) => r.sourceId),
    items: perSource(items, (r) => r.source),
    adapted: adapted.map((r) => r.at),
    firstAdapted: firstAdapted[0]?.at ?? null,
    published: publishedBy,
  }
}

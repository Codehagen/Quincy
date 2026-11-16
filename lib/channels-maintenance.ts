import { and, asc, eq, ne } from "drizzle-orm"

import { sendReconnectEmail } from "./channels-email"
import {
  channelLabel,
  getAccessToken,
  isChannelEnabled,
  isRefreshable,
  markConnectionState,
  probeLiveness,
  recordReauthNotice,
  type LivenessResult,
} from "./channels"
import { db } from "./db"
import { user } from "./schema"
import { channelConnection, type ConnectableChannel } from "./schema-app"

/**
 * The daily sweep that keeps channel connections honest.
 *
 * Separate from lib/heartbeat.ts, which is the brain's loop, for the reason
 * two unrelated schedules should not share a file: one is about compiling
 * captures into memory and this is about the lifecycle of a credential that
 * can post in someone's name. Mixing them makes both harder to read and makes
 * a change to either riskier than it is.
 *
 * **Why daily, and why this is not polish.** Anyone can open LinkedIn →
 * Settings & Privacy → Data Privacy → Permitted Services and remove Quincy,
 * and LinkedIn tells us nothing when they do. Without this sweep the UI keeps
 * saying "Connected" and Quincy keeps trying to publish as a person who
 * withdrew consent. Expiry is not the reason for the cadence — 60 days against
 * a weekly sweep would be fine. Revocation is. That is the one failure mode
 * here that is not merely broken but wrong, and a weekly sweep would leave it
 * standing for up to seven days.
 *
 * LinkedIn asks for exactly this in its own integration requirements: an API
 * call as a heartbeat every 24 hours, and a proactive notice before a token
 * expires. Those are written for a program Route A is not in, so they do not
 * bind us — but they are LinkedIn describing a competent integration, and this
 * meets them.
 */

/** How long before a non-refreshable token dies do we start asking. */
const REAUTH_WARNING_DAYS = 10

const REAUTH_WARNING_MS = REAUTH_WARNING_DAYS * 24 * 60 * 60 * 1000

/**
 * The most rows one run will take.
 *
 * The sweep is sequential and the route dies at 300 seconds, so an unbounded
 * query does not mean "check everyone" — it means "check an unpredictable
 * prefix and silently skip the rest, forever, because the next run starts from
 * the same place". A cap plus oldest-first ordering turns that into something
 * honest: a known number of rows per run, with the longest-unchecked rows
 * first, and a flag saying more were waiting.
 */
const MAX_ROWS_PER_RUN = 500

export type MaintenanceOutcome =
  /** Grant is live and not close to expiry. Nothing was written. */
  | "active"
  /** Live, but running out. Marked `needs_reauth` ahead of time. */
  | "expiring"
  /** Out of time. LinkedIn does this to every connection every 60 days. */
  | "expired"
  /** The person removed us upstream. Terminal until they connect again. */
  | "revoked"
  /** The platform did not give us an answer. Nothing was written. */
  | "unreachable"
  /**
   * The channel has no credentials in this environment, so nothing can be
   * asked and nothing is written. Not the user's problem and never theirs to
   * fix — the row is untouched and no mail goes out.
   */
  | "unconfigured"

export type ConnectionCheck = {
  userId: string
  channel: ConnectableChannel
  outcome: MaintenanceOutcome
  emailed: boolean
  detail?: string
}

/**
 * The two things this module does to the outside world, injectable.
 *
 * Same shape as `runHeartbeatForEveryone(extract?)` and for the same reason:
 * the decisions worth verifying are "what does a 401 mean" and "does the
 * second sweep send a second email", and neither should need LinkedIn to be
 * reachable — or a real message to leave the building — to be checked.
 */
export type MaintenanceDeps = {
  probe: (
    channel: ConnectableChannel,
    accessToken: string
  ) => Promise<LivenessResult>
  send: typeof sendReconnectEmail
}

const LIVE_DEPS: MaintenanceDeps = {
  probe: probeLiveness,
  send: sendReconnectEmail,
}

/**
 * Send at most one reconnect notice per 60-day cycle.
 *
 * `reauthNoticeSentAt` is cleared by `saveConnection`, so reconnecting arms
 * the next one. Without this gate a connection that sits expired for a month
 * mails the same person thirty times, which is how a helpful nudge becomes the
 * reason someone marks Quincy as spam.
 */
async function nudgeOnce({
  connectionId,
  userId,
  channel,
  noticeSentAt,
  expiresAt,
  deps,
}: {
  connectionId: string
  userId: string
  channel: ConnectableChannel
  noticeSentAt: Date | null
  expiresAt: Date | null
  deps: MaintenanceDeps
}): Promise<boolean> {
  if (noticeSentAt) {
    return false
  }

  const [recipient] = await db
    .select({ email: user.email, name: user.name })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)

  if (!recipient) {
    return false
  }

  const result = await deps.send({
    to: recipient.email,
    name: recipient.name,
    channel: channelLabel(channel),
    connectionId,
    expiresAt,
  })

  if (!result.ok) {
    // Not fatal, and deliberately not marked as sent: mail being down must not
    // consume this cycle's one notice. Tomorrow's run tries again.
    console.error(
      `[channels] reconnect notice for ${connectionId} not sent: ${result.message}`
    )
    return false
  }

  await recordReauthNotice(connectionId)
  return true
}

async function checkConnection(
  row: {
    id: string
    userId: string
    channel: ConnectableChannel
    accessTokenExpiresAt: Date | null
    reauthNoticeSentAt: Date | null
  },
  deps: MaintenanceDeps
): Promise<ConnectionCheck> {
  const base = { userId: row.userId, channel: row.channel }

  /**
   * Before anything is asked of the platform.
   *
   * Without this, a channel whose client id or secret is missing from the
   * environment — a rotation, a renamed variable, a new deploy that never got
   * the values — sends `undefined` as the client id. The platform answers 401,
   * the sweep reads that as a broken grant, and it writes `needs_reauth` to
   * every row on that channel and mails every one of those users. Each of them
   * then spends their one notice for the cycle reconnecting something that was
   * never broken.
   *
   * A missing environment variable is an operator's problem. It must never be
   * turned into a hundred users' problem.
   */
  if (!isChannelEnabled(row.channel)) {
    return { ...base, outcome: "unconfigured", emailed: false }
  }

  /**
   * This does most of the work before the probe below ever runs. For X it
   * refreshes a stale token and marks the row `revoked` if the refresh comes
   * back `invalid_grant`; for LinkedIn, which has no refresh token on the
   * self-serve tier, it marks `needs_reauth` once the token is out of time.
   * Reusing it rather than reimplementing the checks is the point — the sweep
   * and the publish path must agree about what a usable connection is, and the
   * only way to guarantee that is for them to ask the same function.
   */
  const access = await getAccessToken(row.userId, row.channel)

  if (!access.ok) {
    if (access.reason === "missing") {
      // Deleted between the query and now. Someone pressed Disconnect while
      // the sweep was running.
      return { ...base, outcome: "active", emailed: false }
    }

    if (access.reason === "revoked") {
      return { ...base, outcome: "revoked", emailed: false }
    }

    return {
      ...base,
      outcome: "expired",
      emailed: await nudgeOnce({
        connectionId: row.id,
        userId: row.userId,
        channel: row.channel,
        noticeSentAt: row.reauthNoticeSentAt,
        expiresAt: row.accessTokenExpiresAt,
        deps,
      }),
    }
  }

  /**
   * The heartbeat call. Everything above this line reasons from a timestamp we
   * stored ourselves, and a stored timestamp cannot know that someone opened
   * Permitted Services this morning and took Quincy off the list. Only asking
   * the platform can.
   */
  const liveness = await deps.probe(row.channel, access.accessToken)

  if (liveness.live === "unknown") {
    // A 500, a 429, a timeout. Nothing is written: an outage upstream is not
    // consent withdrawn down here, and `revoked` is a verdict only a human
    // reconnecting can reverse.
    console.error(`[channels] ${row.id} unreachable: ${liveness.error}`)
    return {
      ...base,
      outcome: "unreachable",
      emailed: false,
      detail: liveness.error,
    }
  }

  if (!liveness.live) {
    const expiresAt = access.connection.accessTokenExpiresAt

    /**
     * A credential the platform rejects while we believe it is still good.
     *
     * The belief is what makes this readable as revocation rather than as
     * expiry: `getAccessToken` returned a token, which means the recorded
     * expiry is more than five minutes out. So the token should work, and it
     * does not, and the difference is that someone took it away.
     *
     * When there is no recorded expiry we cannot make that argument, and we do
     * not pretend to: the row gets `needs_reauth`, which asks the person to
     * reconnect without accusing them of having withdrawn something. Both
     * states stop publishing here; only one of them is a claim about intent.
     */
    const withdrawn = expiresAt !== null && expiresAt.getTime() > Date.now()

    await markConnectionState(
      row.id,
      withdrawn ? "revoked" : "needs_reauth",
      `${channelLabel(row.channel)} rejected the token (${liveness.status}): ${liveness.body}`
    )

    if (withdrawn) {
      // No email. They removed Quincy on purpose; a "Reconnect!" button in
      // their inbox argues with an answer they already gave. The UI carries
      // it instead, where they will see it when they come back.
      return { ...base, outcome: "revoked", emailed: false }
    }

    return {
      ...base,
      outcome: "expired",
      emailed: await nudgeOnce({
        connectionId: row.id,
        userId: row.userId,
        channel: row.channel,
        noticeSentAt: row.reauthNoticeSentAt,
        expiresAt,
        deps,
      }),
    }
  }

  /**
   * Live, so the only question left is how much longer.
   *
   * Only asked for channels we cannot refresh. An approaching expiry on X is
   * not the user's problem — `getAccessToken` renews it without anybody being
   * told — so warning about it would be manufacturing an errand.
   */
  const expiresAt = access.connection.accessTokenExpiresAt
  const closing =
    !isRefreshable(row.channel) &&
    expiresAt !== null &&
    expiresAt.getTime() - Date.now() < REAUTH_WARNING_MS

  if (!closing) {
    return { ...base, outcome: "active", emailed: false }
  }

  /**
   * `needs_reauth` while the token still works, deliberately.
   *
   * It looks like it should stop publishing ten days early. It does not:
   * `getAccessToken` gates on the token, not on this label, and returns the
   * still-valid token right up to the last five minutes. The column is what
   * the *interface* reads to start asking, and ten days is how long a person
   * needs to notice an email and click a button.
   */
  await markConnectionState(row.id, "needs_reauth")

  return {
    ...base,
    outcome: "expiring",
    emailed: await nudgeOnce({
      connectionId: row.id,
      userId: row.userId,
      channel: row.channel,
      noticeSentAt: row.reauthNoticeSentAt,
      expiresAt,
      deps,
    }),
  }
}

export type MaintenanceRun = {
  checked: number
  truncated: boolean
  outcomes: Record<MaintenanceOutcome, number>
  emailed: number
  failed: number
}

export async function runChannelMaintenance({
  userId,
  deps = LIVE_DEPS,
}: {
  /**
   * Restrict the sweep to one person. The cron passes nothing and sweeps
   * everybody; scripts/verify-channel-maintenance.ts passes its throwaway
   * account, which is what stops a verification run from probing — and writing
   * verdicts about — a real LinkedIn grant sitting in the same table.
   */
  userId?: string
  deps?: MaintenanceDeps
} = {}): Promise<MaintenanceRun> {
  /**
   * Already-revoked rows are excluded rather than re-probed. The state is
   * terminal — nothing but a fresh grant can leave it, and a fresh grant comes
   * through `saveConnection`, not through here. Probing them daily would spend
   * a call per row to re-learn the same answer forever.
   */
  const scope = userId
    ? and(
        ne(channelConnection.state, "revoked"),
        eq(channelConnection.userId, userId)
      )
    : ne(channelConnection.state, "revoked")

  const rows = await db
    .select({
      id: channelConnection.id,
      userId: channelConnection.userId,
      channel: channelConnection.channel,
      accessTokenExpiresAt: channelConnection.accessTokenExpiresAt,
      reauthNoticeSentAt: channelConnection.reauthNoticeSentAt,
    })
    .from(channelConnection)
    .where(scope)
    // Oldest sweep first, so a truncated run starves nobody: whoever was
    // skipped yesterday is at the front of the queue today.
    .orderBy(asc(channelConnection.updatedAt))
    .limit(MAX_ROWS_PER_RUN + 1)

  const truncated = rows.length > MAX_ROWS_PER_RUN
  const batch = truncated ? rows.slice(0, MAX_ROWS_PER_RUN) : rows

  if (truncated) {
    // Logged loudly rather than absorbed. A sweep that quietly covers part of
    // the table reads as "everyone is fine" to anyone looking at the output.
    console.error(
      `[channels] sweep truncated at ${MAX_ROWS_PER_RUN} rows — more were waiting. ` +
        "Raise the cap or move to a cursor."
    )
  }

  /**
   * No entitlement gate, and that is the difference from the brain heartbeat.
   *
   * That one skips accounts that stopped paying because every run costs a
   * model call. This costs one HTTP request, and the thing it protects is not
   * a feature somebody bought — it is the promise that Quincy stops posting
   * when consent is withdrawn. That promise does not lapse with a
   * subscription.
   */
  const outcomes: Record<MaintenanceOutcome, number> = {
    active: 0,
    expiring: 0,
    expired: 0,
    revoked: 0,
    unreachable: 0,
    unconfigured: 0,
  }

  let emailed = 0
  let failed = 0

  /**
   * Sequential, and one connection at a time is the point. The work is a
   * single request per row, so a pool would buy little, and it would buy it by
   * turning a hundred users into a hundred simultaneous requests from one IP —
   * which is how a maintenance job gets itself rate-limited and reads the 429
   * as everybody's connection failing. Revisit when the row count makes the
   * wall clock a problem, not before.
   */
  for (const row of batch) {
    try {
      const check = await checkConnection(row, deps)
      outcomes[check.outcome] += 1
      if (check.emailed) {
        emailed += 1
      }
    } catch (cause) {
      // One bad row must not end the sweep for everyone behind it. Nothing was
      // written for this row, so tomorrow picks it up unchanged.
      failed += 1
      console.error(`[channels] ${row.id} check failed:`, cause)
    }
  }

  if (outcomes.unconfigured > 0) {
    // Logged rather than absorbed: these rows were not checked at all, so the
    // sweep's core promise — noticing a withdrawn grant within 24 hours — is
    // not being kept for them. That is a deploy problem and it should look
    // like one.
    console.error(
      `[channels] ${outcomes.unconfigured} connection(s) skipped — the channel ` +
        "has no client id/secret in this environment. Check the env vars."
    )
  }

  // `batch.length` rather than `rows.length`: the query fetches one more than
  // the cap so it can tell whether more were waiting, and reporting the
  // over-fetch as "checked" would overstate the sweep's coverage by one.
  return { checked: batch.length, truncated, outcomes, emailed, failed }
}

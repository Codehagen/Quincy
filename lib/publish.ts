import { and, desc, eq } from "drizzle-orm"

import {
  getAccessToken,
  isConnectableChannel,
  markConnectionState,
} from "./channels"
import { db } from "./db"
import { containsUrl, measurePost } from "./post-length"
import {
  canPublish,
  labelFor,
  publisherFor,
  type Channel,
  type PublishConnection,
  type PublishResult,
} from "./publisher"
import {
  channelConnection,
  usageEvent,
  type ConnectableChannel,
} from "./schema-app"

/**
 * The last step. Text goes out under someone's name.
 *
 * Returns a status rather than throwing, following lib/mail.ts — and with the
 * same warning attached, which matters more here than anywhere else in the
 * codebase: **an unread result is a swallowed exception.** A caller that
 * ignores this value will report a post as sent that never left, and the user
 * will find out from the absence of it.
 *
 * Nothing in here decides *whether* to post. `docs/vision.md` is explicit that
 * Quincy drafts and the human sends; this function is the mechanism behind an
 * approval that already happened, and it has no path that runs on its own.
 *
 * **What lives here and what does not.** Since plan 027 item 4f, the platform
 * requests live behind `Publisher` in lib/publisher.ts. This file keeps
 * everything that is a decision rather than a request: the length check that
 * runs before a token is spent, the credential, what a refusal writes to
 * `channel_connection`, and the meter. A publisher owns one HTTP call and
 * touches no table.
 */

/**
 * The vocabulary of a refusal, defined with the interface that returns it.
 *
 * Re-exported rather than moved outright: `publish` is what most callers
 * import, and lib/publish-run.ts and scripts/verify-publish-run.ts read the
 * result type from here.
 */
export type { PublishFailure, PublishResult } from "./publisher"

/* ── What it costs ────────────────────────────────────────────────────────── */

/**
 * X's published rates, in micro-dollars to match lib/pricing.ts.
 *
 * The 13× jump for a single link is the biggest unit-cost lever in the
 * product: at three posts a day every day, links-always against links-never is
 * roughly $18/month versus $1.35. That difference has to be visible at
 * /credits rather than discovered on an invoice, which is the whole reason
 * this function records anything.
 */
const X_COST_MICROS = { plain: 15_000, withUrl: 200_000 } as const

/**
 * Recorded through `usage_event`, reusing the table the model meter writes to.
 *
 * The columns fit without a migration — the token counts default to 0 and this
 * spends none — and `/credits` is already the surface that reads them, so an X
 * post shows up beside the model spend it sits next to in the user's head.
 * `model` carries `x:post` rather than a model name, which is the one place
 * this stretches: the column means "what was bought". If a third kind of
 * non-model cost ever appears, that is the point to add a `kind` discriminator
 * rather than stretch it a second time. (`external:post` in
 * lib/publisher-external.ts is the second kind, and it deliberately spends the
 * same stretch rather than widening it.)
 */
async function recordPostCost(userId: string, text: string): Promise<void> {
  try {
    await db.insert(usageEvent).values({
      id: `use_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
      userId,
      model: "x:post",
      costMicros: containsUrl(text)
        ? X_COST_MICROS.withUrl
        : X_COST_MICROS.plain,
    })
  } catch (cause) {
    // The post is already out. Failing the publish because the meter failed
    // would report a delivered post as undelivered, which is the worse lie.
    console.error("[publish] cost not recorded:", cause)
  }
}

/* ── Who we are posting as ────────────────────────────────────────────────── */

/**
 * There is no account and there never was one to look for.
 *
 * Handed to a publisher that has already been established as "no publisher",
 * so it can answer in its own words instead of this file carrying a second
 * copy of the sentence. Nothing reads it.
 */
const NO_CONNECTION: PublishConnection = {
  id: "",
  externalId: "",
  handle: null,
}

type Credentials =
  | { ok: true; connection: PublishConnection; accessToken: string }
  | { ok: false; failure: PublishResult & { ok: false } }

/**
 * The row for a channel this codebase holds no OAuth credentials for.
 *
 * `channel_connection.channel` is a plain text column — the Drizzle enum on it
 * is TS-level only, per plans/025 — so a row for such a channel is storable
 * today and the cast below is a type assertion rather than a lie to Postgres.
 * What the schema does *not* allow yet is writing one: `access_token` is
 * `NOT NULL` and an external integration has no per-user token. That is a
 * schema question and this plan does not answer it.
 *
 * `external_id` is the integration id. It already means "the platform's own id
 * for this account", which is exactly what an external scheduler's per-channel
 * integration id is, so nothing new is needed to hold it.
 */
async function externalCredentials(
  userId: string,
  channel: Channel
): Promise<Credentials> {
  const [row] = await db
    .select({
      id: channelConnection.id,
      externalId: channelConnection.externalId,
      handle: channelConnection.handle,
      state: channelConnection.state,
    })
    .from(channelConnection)
    .where(
      and(
        eq(channelConnection.userId, userId),
        eq(channelConnection.channel, channel as ConnectableChannel)
      )
    )
    // Same reason as getConnectionRow: LIMIT 1 without ORDER BY is a promise
    // Postgres does not make, and every caller must agree on the same row.
    .orderBy(desc(channelConnection.updatedAt))
    .limit(1)

  if (!row) {
    return {
      ok: false,
      failure: {
        ok: false,
        reason: "not-connected",
        message: `No ${labelFor(channel)} account is connected.`,
      },
    }
  }

  if (row.state === "revoked") {
    return {
      ok: false,
      failure: {
        ok: false,
        reason: "revoked",
        message: `The ${labelFor(channel)} connection was removed.`,
      },
    }
  }

  return {
    ok: true,
    connection: { id: row.id, externalId: row.externalId, handle: row.handle },
    // The external scheduler authenticates as the deployment, not as the user.
    // Its credential is EXTERNAL_PUBLISHER_TOKEN, held in the publisher.
    accessToken: "",
  }
}

async function credentialsFor(
  userId: string,
  channel: Channel
): Promise<Credentials> {
  if (!isConnectableChannel(channel)) {
    return externalCredentials(userId, channel)
  }

  const access = await getAccessToken(userId, channel)

  if (!access.ok) {
    return {
      ok: false,
      failure: {
        ok: false,
        reason: access.reason === "missing" ? "not-connected" : access.reason,
        message:
          access.reason === "missing"
            ? `No ${labelFor(channel)} account is connected.`
            : `The ${labelFor(channel)} connection needs attention.`,
      },
    }
  }

  return {
    ok: true,
    connection: access.connection,
    accessToken: access.accessToken,
  }
}

/* ── The one entry point ──────────────────────────────────────────────────── */

export async function publish({
  userId,
  channel,
  text,
  postId = null,
  scheduledFor = new Date(),
}: {
  userId: string
  channel: Channel
  text: string
  /**
   * `scheduled_post.id`, passed through as the idempotency key. Optional
   * because scripts/verify-publish.ts exercises the guards below with no row
   * behind them; every real send has one.
   */
  postId?: string | null
  /** The moment this was queued for. `now` when a person pressed send. */
  scheduledFor?: Date
}): Promise<PublishResult> {
  const trimmed = text.trim()

  if (!trimmed) {
    return { ok: false, reason: "empty", message: "There is nothing to post." }
  }

  /**
   * Measured before the token is fetched, let alone spent.
   *
   * X bills per request, including the ones it rejects, so a 281-character
   * post caught here costs nothing and the same post caught by X costs $0.015
   * to be told no. `measurePost` counts graphemes and charges X's flat 23 per
   * link, which is what X counts — `text.length` would both overcount emoji
   * and overcount links, and reject posts that were always fine.
   */
  const length = measurePost(trimmed, channel)

  if (length.over > 0) {
    return {
      ok: false,
      reason: "too-long",
      message: `${length.over} over the ${labelFor(channel)} limit of ${length.limit}.`,
    }
  }

  const publisher = publisherFor(channel)

  /**
   * Nothing can send this channel, so nothing is looked up.
   *
   * Asked before the connection read rather than after, because "no publisher
   * for threads" is the true answer and "no threads account is connected"
   * would send someone off to connect one that still could not be published
   * to. The refusal itself comes from the publisher, so the sentence exists
   * once.
   */
  if (!canPublish(channel)) {
    return publisher.publish({
      userId,
      channel,
      connection: NO_CONNECTION,
      accessToken: "",
      body: trimmed,
      idempotencyKey: postId,
      scheduledFor,
    })
  }

  const credentials = await credentialsFor(userId, channel)

  if (!credentials.ok) {
    return credentials.failure
  }

  /**
   * The try/catch is for the transport underneath the API, exactly as in
   * lib/mail.ts. Every publisher reads a status code and returns a result, so
   * none throws on a refusal — but a DNS failure, a dropped socket or a
   * timeout throws out of `fetch` itself, and this function promises a value.
   * A caller written against that promise has no catch, so the exception would
   * surface as an unhandled rejection somewhere up the stack instead of as
   * "the post did not go out".
   */
  let result: PublishResult
  try {
    result = await publisher.publish({
      userId,
      channel,
      connection: credentials.connection,
      accessToken: credentials.accessToken,
      body: trimmed,
      idempotencyKey: postId,
      scheduledFor,
    })
  } catch (cause) {
    return {
      ok: false,
      reason: "rejected",
      message: `Could not reach ${labelFor(channel)}: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    }
  }

  if (!result.ok) {
    /**
     * A 401 here outranks what the token's own expiry claimed. The stored
     * timestamp said the credential was good and the platform disagreed, and
     * the platform is the authority — leaving the row `active` would mean
     * every scheduled post retries into the same wall until the daily sweep
     * happens to notice.
     *
     * Not marked `revoked`: this path cannot tell withdrawal from a token
     * invalidated for some other reason, and `needs_reauth` asks for the same
     * repair without making a claim about intent. The daily sweep in
     * lib/channels-maintenance.ts is where that distinction is drawn, with the
     * evidence to draw it.
     */
    if (result.reason === "needs_reauth") {
      await markConnectionState(
        credentials.connection.id,
        "needs_reauth",
        result.message
      )
    } else if (
      result.reason !== "duplicate" &&
      /**
       * `unconfirmed` joins `duplicate` in leaving the connection alone. The
       * platform authenticated us, accepted the post and answered 2xx — the
       * credential did everything asked of it, and putting a red error on
       * /channels for it would send someone to reconnect a working account.
       * The problem belongs to the post, and lib/publish-run.ts records it
       * there.
       */
      result.reason !== "unconfirmed"
    ) {
      await db
        .update(channelConnection)
        .set({
          lastError: result.message,
          lastErrorAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(channelConnection.id, credentials.connection.id))
    }

    /**
     * X bills per request, including ones it answers with a 400 — a post it
     * read and refused was still work it did. So the meter runs on failure
     * too, but only for refusals that got that far.
     *
     * `needs_reauth` and `rate-limited` are turned away before the post is
     * processed: a 401 fails at the auth layer and a 429 is the gate itself.
     * Billing for those would inflate the number at /credits with requests
     * that never cost anything, and the whole reason this is metered is that
     * the number has to be trustworthy.
     */
    const wasProcessed =
      result.reason !== "needs_reauth" && result.reason !== "rate-limited"

    if (channel === "x" && wasProcessed) {
      await recordPostCost(userId, trimmed)
    }

    return result
  }

  await db
    .update(channelConnection)
    .set({
      lastPublishedAt: new Date(),
      lastError: null,
      lastErrorAt: null,
      updatedAt: new Date(),
    })
    .where(eq(channelConnection.id, credentials.connection.id))

  if (channel === "x") {
    await recordPostCost(userId, trimmed)
  }

  return result
}

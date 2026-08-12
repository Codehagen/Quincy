import { eq } from "drizzle-orm"

import {
  channelLabel,
  getAccessToken,
  markConnectionState,
  PLATFORM_TIMEOUT_MS,
  type Connection,
} from "./channels"
import { db } from "./db"
import { containsUrl, measurePost } from "./post-length"
import { channelConnection, type ConnectableChannel } from "./schema-app"
import { usageEvent } from "./schema-app"

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
 */

/* ── What can go wrong ────────────────────────────────────────────────────── */

export type PublishFailure =
  /** No connection row at all. The channel was never connected. */
  | "not-connected"
  /** Token aged out. Expected on LinkedIn every 60 days. Reconnect fixes it. */
  | "needs_reauth"
  /** They removed us upstream. Never retry; never publish on this row. */
  | "revoked"
  | "empty"
  | "too-long"
  /** X refuses to post the same text twice. Not a transport failure. */
  | "duplicate"
  /** Their limit or ours. Backing off is the only correct response. */
  | "rate-limited"
  /**
   * The platform said yes and we could not read what it gave back.
   *
   * **The one failure that is not a failure.** A 2xx means the post was taken;
   * only the id was unreadable. It is separated from `rejected` because the two
   * demand opposite responses: a rejected post should be sent again, and this
   * one must not be — retrying double-posts on LinkedIn and pays X to be told
   * the text is a duplicate. Anything automated that sees this has to stop and
   * leave it to a person who can go and look.
   */
  | "unconfirmed"
  /** Everything else, with the platform's own words in `message`. */
  | "rejected"

export type PublishResult =
  | { ok: true; url: string; externalId: string }
  | { ok: false; reason: PublishFailure; message: string }

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
 * rather than stretch it a second time.
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

/* ── Reading a platform's refusal ─────────────────────────────────────────── */

function classify(status: number, body: string): PublishFailure {
  if (status === 401) return "needs_reauth"
  if (status === 429) return "rate-limited"

  // X answers 403 for a repeat of text already posted. It is not an auth
  // problem despite the status, and the user needs to be told what actually
  // happened rather than being sent to reconnect a working account.
  if (status === 403 && /duplicate/i.test(body)) return "duplicate"

  return "rejected"
}

/**
 * A response body's `id`, or undefined when the body is not JSON.
 *
 * Both callers run **after** the platform has already accepted the post, so a
 * throw here is a lie: it turns a published post into a reported failure, and
 * the user retries — double-posting on LinkedIn, or paying X to be told the
 * text is a duplicate. A 2xx carrying something other than JSON is rare
 * (a gateway interstitial, a proxy rewrite, a plain-text acknowledgement) and
 * nothing about it means the post did not go out.
 *
 * Exported for lib/publish.test.ts — the parse is where the bug was, so it is
 * the thing worth pinning.
 */
export function idFromBody(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body || "{}") as {
      id?: string
      data?: { id?: string }
    }
    return parsed.data?.id ?? parsed.id
  } catch {
    return undefined
  }
}

/* ── X ────────────────────────────────────────────────────────────────────── */

async function publishToX(
  connection: Connection,
  accessToken: string,
  text: string
): Promise<PublishResult> {
  const response = await fetch("https://api.x.com/2/tweets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(PLATFORM_TIMEOUT_MS),
  })

  const raw = await response.text()

  if (!response.ok) {
    return {
      ok: false,
      reason: classify(response.status, raw),
      message: `X refused the post (${response.status}): ${raw.slice(0, 300)}`,
    }
  }

  const id = idFromBody(raw)

  if (!id) {
    // Deliberately not phrased as "the post failed". X answered 2xx, which
    // means it took the post; we only failed to read the id back. Telling the
    // user it failed is what makes them retry into a duplicate.
    return {
      ok: false,
      reason: "unconfirmed",
      message:
        "X accepted the post but returned no id that could be read. The post " +
        "has most likely gone out — check the account before retrying.",
    }
  }

  // The handle-shaped URL is the one a person can read and share. `/i/web/` is
  // the fallback that always resolves, for a connection made before we started
  // storing handles.
  const handle = connection.handle?.replace(/^@/, "")

  return {
    ok: true,
    externalId: id,
    url: handle
      ? `https://x.com/${handle}/status/${id}`
      : `https://x.com/i/web/status/${id}`,
  }
}

/* ── LinkedIn ─────────────────────────────────────────────────────────────── */

/**
 * The endpoint question, answered at runtime rather than by reading docs.
 *
 * LinkedIn's own documentation contradicts itself: the June 2023 changelog
 * says unversioned Content APIs including `/v2/ugcPosts` were sunset, while
 * the Share on LinkedIn page still documents `/v2/ugcPosts` as the way to
 * post, with no deprecation banner. One page is stale and there is no way to
 * tell which from the outside.
 *
 * So we try `/rest/posts` first, because it is the one with a future, and fall
 * back exactly once on the specific 403 that means "your token is not allowed
 * here". A 403 creates nothing, so the fallback cannot double-post.
 *
 * **The first real post settles this, and it logs the answer.** When it does,
 * delete the loser and this comment — carrying two code paths for a question
 * that has been answered is how the answer gets lost again.
 */
async function publishToLinkedIn(
  connection: Connection,
  accessToken: string,
  text: string
): Promise<PublishResult> {
  const version = process.env.LINKEDIN_API_VERSION

  if (!version) {
    return {
      ok: false,
      reason: "rejected",
      message:
        "LINKEDIN_API_VERSION is not set. The versioned Posts API rejects a " +
        "request without it, and guessing a version is how a post silently " +
        "changes shape between deploys.",
    }
  }

  const author = `urn:li:person:${connection.externalId}`
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "LinkedIn-Version": version,
    "X-Restli-Protocol-Version": "2.0.0",
  }

  const versioned = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers,
    body: JSON.stringify({
      author,
      commentary: text,
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    }),
    signal: AbortSignal.timeout(PLATFORM_TIMEOUT_MS),
  })

  if (versioned.ok) {
    console.info("[publish] LinkedIn /rest/posts works on this token.")
    return linkedInResult(versioned, await versioned.text())
  }

  const versionedBody = (await versioned.text()).slice(0, 300)

  if (versioned.status !== 403 || !/ACCESS_DENIED/i.test(versionedBody)) {
    return {
      ok: false,
      reason: classify(versioned.status, versionedBody),
      message: `LinkedIn refused the post (${versioned.status}): ${versionedBody}`,
    }
  }

  console.warn(
    "[publish] /rest/posts returned 403 ACCESS_DENIED — the versioned Posts " +
      "API is gated behind Community Management. Falling back to /v2/ugcPosts."
  )

  const legacy = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers,
    body: JSON.stringify({
      author,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text },
          shareMediaCategory: "NONE",
        },
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
      },
    }),
    signal: AbortSignal.timeout(PLATFORM_TIMEOUT_MS),
  })

  const legacyBody = await legacy.text()

  if (!legacy.ok) {
    return {
      ok: false,
      reason: classify(legacy.status, legacyBody),
      message: `LinkedIn refused the post (${legacy.status}): ${legacyBody.slice(0, 300)}`,
    }
  }

  console.info("[publish] LinkedIn /v2/ugcPosts works; /rest/posts does not.")
  return linkedInResult(legacy, legacyBody)
}

/**
 * The post id arrives in the `x-restli-id` **response header**, not the body —
 * both endpoints do this, and reading the body instead is a silent null.
 */
function linkedInResult(response: Response, body: string): PublishResult {
  const urn = response.headers.get("x-restli-id") ?? idFromBody(body)

  if (!urn) {
    return {
      ok: false,
      reason: "unconfirmed",
      message:
        "LinkedIn accepted the post but returned no id. The post has most " +
        "likely gone out — check the profile before retrying.",
    }
  }

  return {
    ok: true,
    externalId: urn,
    url: `https://www.linkedin.com/feed/update/${urn}/`,
  }
}

/* ── The one entry point ──────────────────────────────────────────────────── */

export async function publish({
  userId,
  channel,
  text,
}: {
  userId: string
  channel: ConnectableChannel
  text: string
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
      message: `${length.over} over the ${channelLabel(channel)} limit of ${length.limit}.`,
    }
  }

  const access = await getAccessToken(userId, channel)

  if (!access.ok) {
    return {
      ok: false,
      reason: access.reason === "missing" ? "not-connected" : access.reason,
      message:
        access.reason === "missing"
          ? `No ${channelLabel(channel)} account is connected.`
          : `The ${channelLabel(channel)} connection needs attention.`,
    }
  }

  /**
   * The try/catch is for the transport underneath the API, exactly as in
   * lib/mail.ts. Both platform adapters read a status code and return a
   * result, so neither throws on a refusal — but a DNS failure, a dropped
   * socket or a timeout throws out of `fetch` itself, and this function
   * promises a value. A caller written against that promise has no catch, so
   * the exception would surface as an unhandled rejection somewhere up the
   * stack instead of as "the post did not go out".
   */
  let result: PublishResult
  try {
    result =
      channel === "x"
        ? await publishToX(access.connection, access.accessToken, trimmed)
        : await publishToLinkedIn(
            access.connection,
            access.accessToken,
            trimmed
          )
  } catch (cause) {
    return {
      ok: false,
      reason: "rejected",
      message: `Could not reach ${channelLabel(channel)}: ${
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
        access.connection.id,
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
        .where(eq(channelConnection.id, access.connection.id))
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
    .where(eq(channelConnection.id, access.connection.id))

  if (channel === "x") {
    await recordPostCost(userId, trimmed)
  }

  return result
}

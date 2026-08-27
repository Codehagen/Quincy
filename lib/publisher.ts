import { channelLabel, PLATFORM_TIMEOUT_MS } from "./channels"
import { externalPublisherFor } from "./publisher-external"
import { CONNECTABLE_CHANNELS, type ConnectableChannel } from "./schema-app"

/**
 * The boundary between "Quincy decided to send this" and "this platform took
 * it". Plan 027, item 4f.
 *
 * lib/publish.ts owns the decision half — the length check, the credential,
 * the meter, and what a refusal writes to `channel_connection`. Everything
 * below owns one platform's request and nothing else: no database, no cost,
 * no state. That split is why a third channel can be added without reading
 * publish.ts, and why the X and LinkedIn implementations here are testable
 * with a stubbed `fetch` alone.
 *
 * See plans/025 for the wider `ChannelProvider` this is a slice of. This is
 * deliberately only the publish slice; auth, liveness and revoke stay in
 * lib/channels.ts until a third channel actually exists.
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

/* ── What a publisher is given ────────────────────────────────────────────── */

/**
 * A channel id as `draft_version.channel` stores it.
 *
 * Wider than `ConnectableChannel` on purpose. That union is the set of
 * platforms Quincy holds OAuth credentials for; the column is plain text and
 * already carries the keys of `CHANNEL_RULES` (lib/post-length.ts), because a
 * draft can be written for a channel before anything can send it. A publisher
 * has to be able to say "not me" about a string, so the registry takes one.
 */
export type Channel = string

/**
 * The connection columns a publisher may read.
 *
 * Narrower than `Connection` by construction, so a publisher cannot reach the
 * encrypted token columns even by accident — `PublishInput.accessToken` is the
 * one decrypted value, resolved once by lib/publish.ts. A full row is
 * structurally assignable to this, so callers pass what `getAccessToken`
 * already handed them.
 */
export type PublishConnection = {
  /** `channel_connection.id`. Only for messages and logs; publishers never write. */
  id: string
  /**
   * `channel_connection.external_id`. The platform's own id for the account —
   * X's user id, LinkedIn's `sub`, and for an external scheduler the
   * per-channel integration id.
   */
  externalId: string
  /** `channel_connection.handle`, null on LinkedIn. */
  handle: string | null
}

export type PublishInput = {
  userId: string
  channel: Channel
  connection: PublishConnection
  /**
   * Decrypted and refreshed by lib/publish.ts. An empty string for a publisher
   * that authenticates as the deployment rather than as the user — see
   * lib/publisher-external.ts, which holds its own credential.
   */
  accessToken: string
  /** Already trimmed and already measured against the channel's ceiling. */
  body: string
  /**
   * Declared, not implemented. No first-party publisher can carry media yet,
   * and each **refuses** a non-empty list rather than dropping it: a post that
   * silently goes out without the image it was approved with is not the post
   * that was approved.
   */
  media?: readonly string[]
  /**
   * `scheduled_post.id`, which is unique per approved version, so it is a
   * stable key for a platform that offers idempotency.
   *
   * Null only for a direct call with no row behind it —
   * scripts/verify-publish.ts. A publisher that cannot be safely retried
   * without a key must refuse rather than post.
   */
  idempotencyKey: string | null
  /** The moment the row was queued for. `now` for a post sent by hand. */
  scheduledFor: Date
}

/**
 * One platform's send.
 *
 * **Never called on its own initiative.** The only path here is `publish` in
 * lib/publish.ts, and the only callers of that are in lib/publish-run.ts: the
 * cron sweep over `scheduled_post` rows, and the Post now button. Both require
 * a `scheduled_post` row, and a row exists only where `approveVersion` wrote
 * one from text a person read and approved. That is docs/vision.md's "Quincy
 * drafts, you send" expressed as a call graph — an implementation of this
 * interface carries out an approval that already happened, and there is no
 * branch anywhere below that forms one.
 *
 * `publish` returns a result and does not throw after the platform has been
 * reached. The reason is in `PublishFailure.unconfirmed`: once a request is in
 * flight, an exception is indistinguishable from a refusal to the caller, and
 * treating a taken post as a failure is what makes a user retry into a double
 * post. Transport failures before a response — DNS, a dropped socket — may
 * throw; lib/publish.ts catches those and names the channel.
 */
export interface Publisher {
  /** The channel this sends to, echoed back so a registry miss is legible. */
  readonly channel: Channel
  publish(input: PublishInput): Promise<PublishResult>
}

/* ── Reading a platform's refusal ─────────────────────────────────────────── */

export function classify(status: number, body: string): PublishFailure {
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

/**
 * The media refusal, in one place.
 *
 * Returns a result when there is media to refuse and null when there is not,
 * so a publisher reads as `const refusal = refuseMedia(...); if (refusal)
 * return refusal`.
 */
export function refuseMedia(
  input: PublishInput,
  label: string
): PublishResult | null {
  if (!input.media?.length) return null

  return {
    ok: false,
    reason: "rejected",
    message:
      `Quincy cannot attach media to a ${label} post yet, and will not send ` +
      "the text on its own — that is not the post you approved.",
  }
}

/* ── X ────────────────────────────────────────────────────────────────────── */

export const xPublisher: Publisher = {
  channel: "x",

  async publish(input) {
    const media = refuseMedia(input, "X")
    if (media) return media

    const response = await fetch("https://api.x.com/2/tweets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: input.body }),
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
          "X accepted the post but returned no id that could be read. The " +
          "post has most likely gone out — check the account before retrying.",
      }
    }

    // The handle-shaped URL is the one a person can read and share. `/i/web/`
    // is the fallback that always resolves, for a connection made before we
    // started storing handles.
    const handle = input.connection.handle?.replace(/^@/, "")

    return {
      ok: true,
      externalId: id,
      url: handle
        ? `https://x.com/${handle}/status/${id}`
        : `https://x.com/i/web/status/${id}`,
    }
  },
}

/* ── LinkedIn ─────────────────────────────────────────────────────────────── */

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
 * that has been answered is how the answer gets lost again. Plan 027 item 2b
 * is where that happens; it waits for a real LinkedIn post, not for this
 * refactor.
 */
export const linkedInPublisher: Publisher = {
  channel: "linkedin",

  async publish(input) {
    const media = refuseMedia(input, "LinkedIn")
    if (media) return media

    const version = process.env.LINKEDIN_API_VERSION

    if (!version) {
      return {
        ok: false,
        reason: "rejected",
        message:
          "LINKEDIN_API_VERSION is not set. The versioned Posts API rejects " +
          "a request without it, and guessing a version is how a post " +
          "silently changes shape between deploys.",
      }
    }

    const author = `urn:li:person:${input.connection.externalId}`
    const headers = {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
      "LinkedIn-Version": version,
      "X-Restli-Protocol-Version": "2.0.0",
    }

    const versioned = await fetch("https://api.linkedin.com/rest/posts", {
      method: "POST",
      headers,
      body: JSON.stringify({
        author,
        commentary: input.body,
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
            shareCommentary: { text: input.body },
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
  },
}

/* ── The registry ─────────────────────────────────────────────────────────── */

/**
 * Exhaustive by construction: a `Record` keyed on the union fails to compile
 * when a third `ConnectableChannel` is added without an implementation. That
 * is the failure plans/025 found five silent copies of — `if (channel ===
 * "x") … else LinkedIn` compiles happily and sends the new platform's token to
 * LinkedIn's API.
 */
const FIRST_PARTY: Record<ConnectableChannel, Publisher> = {
  x: xPublisher,
  linkedin: linkedInPublisher,
}

function isFirstParty(channel: Channel): channel is ConnectableChannel {
  return (CONNECTABLE_CHANNELS as readonly string[]).includes(channel)
}

/**
 * The refusal that is not a throw.
 *
 * A channel with no implementation is the normal state of most channels —
 * `draft_version.channel` accepts every key of `CHANNEL_RULES` and Quincy
 * sends to two of them. The sweep records this like any other refusal, so the
 * user reads it on /lineup rather than losing the row to an exception in a
 * cron nobody is watching.
 */
function noPublisher(channel: Channel): Publisher {
  return {
    channel,
    async publish() {
      return {
        ok: false,
        reason: "rejected",
        message: `No publisher for ${channel}.`,
      }
    },
  }
}

/**
 * Which implementation sends this channel.
 *
 * First-party first, always: an external scheduler must never be able to take
 * over X or LinkedIn by being configured, because the two first-party paths
 * are the ones whose cost, refusals and token lifecycle this codebase reasons
 * about.
 */
export function publisherFor(channel: Channel): Publisher {
  if (isFirstParty(channel)) return FIRST_PARTY[channel]

  return externalPublisherFor(channel) ?? noPublisher(channel)
}

/**
 * Whether anything can send this channel at all, asked before a row is claimed.
 *
 * lib/publish-run.ts needs the answer *before* moving a `scheduled_post` to
 * `sending` — a claimed row is one a human has to resolve — so it cannot learn
 * it from a `PublishResult`.
 */
export function canPublish(channel: Channel): boolean {
  return isFirstParty(channel) || externalPublisherFor(channel) !== null
}

/**
 * A channel's name for a sentence a person reads.
 *
 * `channelLabel` covers the two first-party channels and is typed to them.
 * Anything else has no label anywhere in the product, so the id is the honest
 * answer — better a message saying "threads" than one saying "undefined".
 */
export function labelFor(channel: Channel): string {
  return isFirstParty(channel) ? channelLabel(channel) : channel
}

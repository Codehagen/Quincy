import { db } from "./db"
import type { Channel, PublishInput, Publisher } from "./publisher"
import { usageEvent } from "./schema-app"

/**
 * One `Publisher` for every channel Quincy does not implement first-party,
 * posting through an external scheduler over its REST API. Plan 027, item 4f.
 *
 * **Over the network, never vendored.** No code from another project is copied
 * into this repository and none is linked against; this file speaks HTTP to a
 * service the operator runs and configures, exactly as it speaks HTTP to X.
 * That keeps the licence question where it belongs — with the operator's
 * deployment — and keeps this repository's dependency list honest.
 *
 * **Off unless it is switched on.** With `EXTERNAL_PUBLISHER_URL` or
 * `EXTERNAL_PUBLISHER_TOKEN` unset, `externalPublisherFor` returns null and
 * `publisherFor` answers with a refusal instead. A default deployment has this
 * whole file inert, which is the right posture for a path that puts text on
 * the internet in someone's name.
 *
 * What this does not do: decide anything. It is reached from `publish` in
 * lib/publish.ts, which is reached only from the sweep and the Post now
 * button, both over rows `approveVersion` wrote. See the `Publisher` doc
 * comment.
 */

/**
 * The same bound every platform call in lib/channels.ts carries, and for the
 * same reason: the sweep is sequential, so one hung socket spends the whole
 * run's budget and the rows behind it never get looked at.
 *
 * Stated here rather than imported from lib/channels.ts because that constant
 * is about *platforms*. This one is about a service the operator runs, and the
 * two are free to diverge — a self-hosted scheduler on the same network is not
 * X.
 */
export const EXTERNAL_TIMEOUT_MS = 10_000

/**
 * Where the money went, at zero.
 *
 * A post that leaves through the external scheduler costs Quincy nothing —
 * whatever it costs is billed by whoever runs the scheduler — and a zero is a
 * real answer rather than a missing one. What the row buys is the *ledger*:
 * /credits reads `usage_event` to say where posts went, and without this line
 * the external channel would be the one path that publishes and appears
 * nowhere. Same reuse of the `model` column as `x:post`; see `recordPostCost`
 * in lib/publish.ts for why that column carries a label.
 */
const EXTERNAL_USAGE_LABEL = "external:post"

export type ExternalCredentials = {
  /** Base URL, no trailing slash. Requests go to `{url}/posts`. */
  url: string
  token: string
}

/**
 * Read at call time, never captured at module scope.
 *
 * The same rule `credentials()` carries in plans/025: a token rotated in the
 * deployment has to take effect on the next sweep rather than the next deploy,
 * or the sweep spends a window failing on a credential that was fixed hours
 * ago.
 */
export function externalCredentials(): ExternalCredentials | null {
  const url = process.env.EXTERNAL_PUBLISHER_URL?.trim()
  const token = process.env.EXTERNAL_PUBLISHER_TOKEN?.trim()

  if (!url || !token) return null

  return { url: url.replace(/\/+$/, ""), token }
}

/**
 * The two things this touches outside itself, injectable.
 *
 * Same shape and same reason as `PublishDeps` in lib/publish-run.ts: the
 * decisions worth pinning are the request shape, the retry rule and "the meter
 * runs once", and none of them should need a scheduler to be reachable — or a
 * real row to be written — to be checked.
 */
export type ExternalDeps = {
  fetch: typeof globalThis.fetch
  meter: (input: { userId: string; channel: Channel }) => Promise<void>
}

/**
 * One `usage_event` row, cost zero, and a failure that never fails the post.
 *
 * The post is already out by the time this runs. Failing the publish because
 * the meter failed would report a delivered post as undelivered, which is the
 * worse lie — the identical argument `recordPostCost` makes in lib/publish.ts.
 */
async function meterExternalPost({
  userId,
  channel,
}: {
  userId: string
  channel: Channel
}): Promise<void> {
  try {
    await db.insert(usageEvent).values({
      id: `use_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
      userId,
      model: EXTERNAL_USAGE_LABEL,
      costMicros: 0,
    })
  } catch (cause) {
    console.error(`[publish] ${channel} external post not metered:`, cause)
  }
}

const LIVE_DEPS: ExternalDeps = {
  fetch: (...args) => globalThis.fetch(...args),
  meter: meterExternalPost,
}

type Attempt =
  | { ok: true; status: number; body: string }
  | { ok: false; status: number; body: string }
  /** Nothing answered: DNS, a dropped socket, or the 10 s bound expiring. */
  | { ok: false; status: null; error: string }

function idFrom(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body || "{}") as {
      id?: string
      postId?: string
      data?: { id?: string }
    }
    return parsed.id ?? parsed.postId ?? parsed.data?.id
  } catch {
    return undefined
  }
}

function urlFrom(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body || "{}") as {
      url?: string
      data?: { url?: string }
    }
    return parsed.url ?? parsed.data?.url
  } catch {
    return undefined
  }
}

/**
 * A publisher for one channel, given credentials.
 *
 * Takes the channel rather than reading it from the input so that the object
 * satisfies `Publisher.channel` — the registry hands back one of these per
 * channel it is asked about, and a publisher that could not name its own
 * channel would make a registry miss unreadable.
 */
export function externalPublisher(
  channel: Channel,
  credentials: ExternalCredentials,
  overrides: Partial<ExternalDeps> = {}
): Publisher {
  const deps: ExternalDeps = { ...LIVE_DEPS, ...overrides }

  async function attempt(input: PublishInput): Promise<Attempt> {
    try {
      const response = await deps.fetch(`${credentials.url}/posts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credentials.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          channel: input.channel,
          integrationId: input.connection.externalId,
          body: input.body,
          scheduledFor: input.scheduledFor.toISOString(),
          idempotencyKey: input.idempotencyKey,
        }),
        signal: AbortSignal.timeout(EXTERNAL_TIMEOUT_MS),
      })

      const body = await response.text()

      return { ok: response.ok, status: response.status, body }
    } catch (cause) {
      return {
        ok: false,
        status: null,
        error: cause instanceof Error ? cause.message : String(cause),
      }
    }
  }

  return {
    channel,

    async publish(input) {
      if (input.media?.length) {
        return {
          ok: false,
          reason: "rejected",
          message:
            `Quincy cannot attach media to a ${channel} post yet, and will ` +
            "not send the text on its own — that is not the post you approved.",
        }
      }

      /**
       * No key, no send.
       *
       * The retry below is only safe because the scheduler can recognise the
       * second request as the first one — `scheduled_post.id` is what makes
       * that possible. Without it a 5xx that actually created a post would be
       * followed by a request that creates a second, in someone's name. A
       * refusal costs one row in `failed`; the alternative costs a double
       * post, and only one of those is repairable.
       */
      if (!input.idempotencyKey) {
        return {
          ok: false,
          reason: "rejected",
          message:
            "Quincy will not send through the external scheduler without an " +
            "idempotency key — a retry without one can post twice.",
        }
      }

      /**
       * **The ceiling: at most two requests, and only ever one that creates.**
       *
       * The retry is allowed on 5xx alone, because a 5xx is the one answer
       * that means "nothing was written" often enough to be worth asking
       * twice — and `idempotencyKey` is `scheduled_post.id`, so a scheduler
       * that did in fact take the first request answers the second with the
       * same post rather than a second one. A 4xx is never retried: the
       * request is wrong, and sending it again buys the same refusal.
       *
       * A transport failure is not retried either. Nothing answered, so
       * nothing can be concluded about whether a post was created — the same
       * reasoning `claim` makes in lib/publish-run.ts, and the reason
       * `unconfirmed` exists.
       */
      let response = await attempt(input)

      if (!response.ok && response.status !== null && response.status >= 500) {
        console.warn(
          `[publish] external scheduler answered ${response.status} for ` +
            `${channel}; retrying once with the same idempotency key.`
        )
        response = await attempt(input)
      }

      /**
       * Metered once per call, whatever the answer was, and only when the
       * scheduler answered at all.
       *
       * Once rather than per attempt, because the row stands for "this post
       * went out through the external scheduler" rather than for a request
       * count — and a retry that produced one post would otherwise read as
       * two on /credits.
       */
      if (response.status !== null) {
        await deps.meter({ userId: input.userId, channel: input.channel })
      }

      if (response.status === null) {
        return {
          ok: false,
          reason: "rejected",
          message: `Could not reach the external scheduler: ${response.error}`,
        }
      }

      if (!response.ok) {
        return {
          ok: false,
          /**
           * 429 backs off. Everything else the scheduler refuses is
           * `rejected`, **including 401** — that status means the
           * deployment's `EXTERNAL_PUBLISHER_TOKEN` is wrong, not that the
           * user's connection needs attention, and `needs_reauth` would send
           * them to reconnect an account that is fine while writing an error
           * onto a healthy `channel_connection` row.
           */
          reason: response.status === 429 ? "rate-limited" : "rejected",
          message:
            `The external scheduler refused the post (${response.status}): ` +
            response.body.slice(0, 300),
        }
      }

      const id = idFrom(response.body)

      if (!id) {
        // 2xx means it was taken. Only the id was unreadable, and saying "it
        // failed" is what makes somebody retry into a second post — the same
        // rule as X and LinkedIn.
        return {
          ok: false,
          reason: "unconfirmed",
          message:
            `The external scheduler accepted the post (${response.status}) ` +
            "and returned no id that could be read. It has most likely gone " +
            "out — check the account before retrying.",
        }
      }

      return {
        ok: true,
        externalId: id,
        // Its own link when it gives one; otherwise the record we can prove
        // exists. A published row that cannot show you anything is asking the
        // user to take our word for it.
        url: urlFrom(response.body) ?? `${credentials.url}/posts/${id}`,
      }
    },
  }
}

/**
 * The registry's hook. Null when the environment does not configure a
 * scheduler, which is what makes this whole path opt-in.
 */
export function externalPublisherFor(channel: Channel): Publisher | null {
  const credentials = externalCredentials()

  return credentials ? externalPublisher(channel, credentials) : null
}

import { createIdGenerator } from "ai"
import { and, count, eq, gte } from "drizzle-orm"
import { start } from "workflow/api"

import { db } from "@/lib/db"
import { isEntitled, resolveEntitlement } from "@/lib/entitlement"
import { isGithubAppConfigured, verifyGithubSignature } from "@/lib/github-app"
import { user } from "@/lib/schema"
import { sourceItem } from "@/lib/schema-app"
import {
  disconnectSource,
  githubInstallationToken,
  pauseSource,
  readGithubMeta,
  recordArrival,
  recordSourceError,
  resolveByToken,
  resumeSource,
} from "@/lib/source-connections"
import {
  descriptionBlocks,
  MAX_DESCRIPTION_CHARS,
  parseShippedPayload,
  shippedGate,
} from "@/lib/shipped-work"
import { runShippedRiffWorkflow } from "@/workflows/run-shipped-riff"

/**
 * A pull request merges; a riff appears. See plans/021.
 *
 * The second inbound webhook carrying material rather than a status, and it
 * differs from app/api/webhooks/circleback in exactly one structural way: a
 * GitHub App has **one** URL for every installation, so there is no per-user
 * token in the path. Identity arrives as `installation.id` in the body.
 *
 * That inverts the order of the first two checks. Circleback resolves the token
 * and then verifies the signature, because the path already narrows the request
 * to one user. Here the URL is the same for everyone and public by design, so:
 *
 * - **The signature is checked first, before anything is read out of the
 *   database.** It is the whole of the authentication rather than half of it,
 *   and resolving first would let a stranger probe which installations exist by
 *   watching how long the endpoint takes to answer.
 * - **404 is not available as the "unknown caller" answer.** Circleback's route
 *   can 404 an unknown token because the path itself is the secret. This path
 *   is published in every installation's settings, so hiding it buys nothing —
 *   an unknown installation gets 200 and no work, because the likeliest cause
 *   is a real installation whose Quincy row was disconnected.
 *
 * **Non-2xx is reserved for what it means.** GitHub does not retry a failed
 * delivery automatically, but it does paint a red cross in the user's settings,
 * and an expected refusal is not a fault. Only two things are errors: a body
 * that will not verify, and a deployment with no app configured.
 */

/** The row, the checks and the start. No model call happens here. */
export const maxDuration = 30

const newSourceItemId = createIdGenerator({ prefix: "si", size: 20 })

/**
 * How many merges one user's GitHub may turn into work in 24 hours.
 *
 * Five. The aggregate ceiling AGENTS.md asks for beside every cooldown, and
 * this path is worse than the Circleback one it copies: a calendar paces
 * meetings at human speed, and a merge queue does not — eight pull requests can
 * land in ten minutes.
 *
 * The number is a guess and is labelled one. What it should be comes from a
 * month of `source_item` rows, the same way plans/README.md refuses to write
 * 008's trial ceiling before the usage data exists. The first real measurement
 * to put against it: a live selection plus angle generation cost $0.027 per
 * call on 2026-08-09, so five is roughly 27 cents a day at the ceiling.
 *
 * Merges past the ceiling are still stored. The row is nearly free and the fact
 * is true, so nothing is lost except the drafting — which is the part that
 * costs money.
 */
const MAX_MERGES_PER_DAY = 5

/**
 * How many merges one user's GitHub may **store** in 24 hours.
 *
 * A second, much higher ceiling, and it exists because the first one does not
 * bound everything. `MAX_MERGES_PER_DAY` gates the drafting, and merges past it
 * are deliberately still written down — the row is nearly free and the fact is
 * true. But the entitlement branch returns *before* that gate, so a lapsed
 * account whose CI merges continuously had no bound of any kind on row writes.
 * Same for a paused one.
 *
 * Fifty, an order of magnitude above the busiest real day this repository has
 * had (27 merges in a week), so it cannot be reached by working hard — only by
 * something automated, which is exactly the case with nobody present to notice.
 * A merge refused here is genuinely lost rather than deferred, which is why the
 * number is nowhere near the drafting ceiling.
 */
const MAX_MERGES_STORED_PER_DAY = 50

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The largest body this endpoint will read.
 *
 * One megabyte. A `pull_request` payload is a few tens of kilobytes — the
 * description, the two repository objects, the user — and GitHub's own
 * documented ceiling for a delivery is 25MB. This is generous for the real
 * thing and twenty-five times tighter than that.
 *
 * The check exists because **the body has to be buffered before it can be
 * verified**: the signature is computed over raw bytes, so `request.text()`
 * necessarily runs before the HMAC does. Without a ceiling, anyone who knows
 * the URL — which is everyone, it is in every installation's settings — can
 * make the function read megabytes it is about to throw away. That is not a
 * forgery, they still cannot sign it; it is a way to spend somebody else's
 * compute, and it is a sharper risk here than on a route whose path is secret.
 */
const MAX_BODY_BYTES = 1024 * 1024

export async function POST(request: Request) {
  if (!isGithubAppConfigured()) {
    /**
     * 503, and the same call app/api/webhooks/resend makes: refuse rather than
     * skip verification. Without the app's webhook secret there is no way to
     * tell GitHub from a stranger, and acting on an unverifiable claim about
     * what somebody shipped is worse than dropping it.
     */
    return new Response("The GitHub App is not configured.", { status: 503 })
  }

  /**
   * `Content-Length` first, then the real size — the order
   * app/api/voice-notes/route.ts uses. The header is a claim, checked because
   * believing it costs nothing and refusing early saves the buffering; the
   * measurement after the read is the actual guard.
   */
  const declared = Number(request.headers.get("content-length") ?? 0)
  if (declared > MAX_BODY_BYTES) {
    return new Response("Body too large", { status: 413 })
  }

  /**
   * The raw text, and never `request.json()`. The signature is computed over
   * these exact bytes; any reparse changes them and every signature fails with
   * nothing on screen explaining why.
   */
  const raw = await request.text()

  if (raw.length > MAX_BODY_BYTES) {
    return new Response("Body too large", { status: 413 })
  }

  if (!verifyGithubSignature(raw, request.headers.get("x-hub-signature-256"))) {
    /**
     * Nothing is recorded against any connection.
     *
     * The Circleback route records the error on the row, because there the URL
     * identifies a user before verification and a failing signature is
     * information about *their* connection. Here nothing has been resolved yet
     * — the body is unverified, so the installation id inside it is a claim by
     * a stranger. Writing an error against the row it names would hand anybody
     * a way to put a red line on any user's `/sources` page.
     */
    return new Response("Bad signature", { status: 401 })
  }

  const event = request.headers.get("x-github-event") ?? ""

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return new Response("Malformed body", { status: 400 })
  }

  /**
   * The handshake GitHub sends the moment a webhook is created, and the reason
   * this integration needs no "paste the secret back" step at all. Answering it
   * proves the URL and the secret are both right before any real payload
   * arrives — a confirmation Circleback has no equivalent of.
   */
  if (event === "ping") {
    return Response.json({ state: "pong" })
  }

  /**
   * The installation's own lifecycle. Three actions matter and they are three
   * different things — conflating them is how a connection is lost silently.
   *
   * - **`deleted`** is the only one that removes the row. The installation no
   *   longer exists, there is no credential to repair, and re-installing
   *   writes a fresh row. Without handling it at all, `/sources` would claim a
   *   live connection forever — the state lib/sources.ts calls out as the one
   *   that "silently stops a rhythm".
   * - **`suspend`** is reversible and must not delete. An organisation owner
   *   can suspend and lift at will; deleting would mean `unsuspend` restores
   *   the installation on GitHub while Quincy has forgotten it, so every later
   *   merge resolves to nobody and is dropped with a 200.
   * - **`unsuspend`** puts it back, which only works because the row survived.
   */
  if (event === "installation") {
    const root = body as { action?: string; installation?: { id?: number } }
    const installationId = root.installation?.id

    if (typeof installationId === "number") {
      const existing = await resolveByToken(
        githubInstallationToken(installationId)
      )

      if (existing) {
        if (root.action === "deleted") {
          await disconnectSource(existing.userId, "github")
        } else if (root.action === "suspend") {
          await pauseSource(
            existing.id,
            "The GitHub App installation is suspended. Merges are not being read."
          )
        } else if (root.action === "unsuspend") {
          await resumeSource(existing.id)
        }
      }
    }

    return Response.json({ state: "acknowledged", action: root.action })
  }

  if (event !== "pull_request") {
    // Every other event type is acknowledged and dropped. A user who widens the
    // subscription in GitHub's UI should not get a page of red crosses for it.
    return Response.json({ state: "ignored", event })
  }

  const payload = parseShippedPayload(body)

  if (!payload) {
    return new Response("Not a pull request", { status: 400 })
  }

  const connection = await resolveByToken(
    githubInstallationToken(payload.installationId)
  )

  /**
   * 200, not 404.
   *
   * The likeliest cause is a real installation whose Quincy row was removed —
   * somebody disconnected on `/sources` but left the app installed on GitHub.
   * That is not an error, it is a person who stopped wanting this, and
   * answering 404 would put a permanent red cross in their repository settings
   * for a decision they made on purpose.
   */
  if (!connection || connection.source !== "github") {
    return Response.json({ state: "unknown-installation" })
  }

  const meta = readGithubMeta(connection.meta)

  const gate = shippedGate(payload, meta.login)

  /**
   * A gate refusal writes nothing and says nothing, with one exception.
   *
   * `no-login` is the only one a user can act on — it means an organisation
   * installation where nobody has said which account is theirs, and every merge
   * is being dropped until they do. It goes on the row so `/sources` can say so
   * once. The rest are ordinary: a teammate merged, a stacked branch landed, a
   * pull request was closed unmerged.
   */
  if (!gate.ok) {
    if (gate.reason === "no-login") {
      await recordSourceError(
        connection.id,
        "Quincy does not know which GitHub username is yours, so merges are " +
          "being skipped. Set it on this row."
      )
    }

    return Response.json({ state: "skipped", reason: gate.reason })
  }

  /**
   * `trialEndsAt` is selected because `resolveEntitlement` reads it off the
   * object it is handed, not out of the database. Omitting it does not fail —
   * it resolves every user to `expired`, silently, and the endpoint stores
   * merges and drafts nothing forever. That is a bug scripts/verify-circleback
   * caught on the Circleback route, and it is repeated here as a comment rather
   * than as a second incident.
   */
  const [owner] = await db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      trialEndsAt: user.trialEndsAt,
    })
    .from(user)
    .where(eq(user.id, connection.userId))
    .limit(1)

  if (!owner) {
    // The cascade should make this unreachable. If it is reached, the row is an
    // orphan pointing at a deleted account and the right answer is to stop.
    return Response.json({ state: "unknown-installation" })
  }

  /**
   * Read before anything can change it.
   *
   * `recordArrival` below sets `arriving`, which would lift a pause that
   * nobody asked to lift — GitHub keeps delivering during a suspension, so the
   * first merge after one would silently un-pause the row and the check further
   * down would never fire. Capturing the state first, and skipping the arrival
   * write while paused, is what makes `paused` mean paused.
   */
  const paused = connection.state === "paused"

  // The connection is working: something arrived, it verified, it parsed and it
  // was theirs. Recorded before the outcome is known, because "material is
  // arriving" is true whether or not this merge was worth publishing.
  if (!paused) {
    await recordArrival(connection.id)
  }

  /**
   * Counted **before** this merge is stored, so the row inserted below is the
   * (N+1)th rather than being counted against itself.
   *
   * Counts `source_item` rather than `riff`: a merge that produced no riff
   * because nothing in it was publishable still paid for a selection, and a
   * ceiling that only counted successes is one a quiet week could never reach.
   */
  const [{ value: recent } = { value: 0 }] = await db
    .select({ value: count() })
    .from(sourceItem)
    .where(
      and(
        eq(sourceItem.userId, owner.id),
        eq(sourceItem.source, "github"),
        gte(sourceItem.createdAt, new Date(Date.now() - DAY_MS))
      )
    )

  /**
   * The storage ceiling, checked before the insert rather than after.
   *
   * It has to be here and not beside the drafting ceiling below, because the
   * entitlement and paused branches both return before that point — so a check
   * placed with them would leave the two cases that need it most unbounded. See
   * `MAX_MERGES_STORED_PER_DAY`.
   */
  if (recent >= MAX_MERGES_STORED_PER_DAY) {
    return Response.json({ state: "dropped", reason: "storage-ceiling" })
  }

  const blocks = descriptionBlocks(payload)

  /**
   * The material, as it arrived.
   *
   * `onConflictDoNothing` on `(user, source, external_id)` is the whole replay
   * story, and GitHub needs it more than Circleback does: manual redelivery is
   * a documented button in every webhook's settings page, and `X-GitHub-Delivery`
   * is a fresh GUID each time — so the delivery id is exactly the wrong dedup
   * key and the pull request's `node_id` is the right one. A node id also
   * survives a repository rename, which `owner/repo#number` does not.
   *
   * Stored before the ceiling and the entitlement are acted on, deliberately.
   * The merge happened; the row is true; and a user who resubscribes finds the
   * material waiting rather than a week of silence.
   */
  const inserted = await db
    .insert(sourceItem)
    .values({
      id: newSourceItemId(),
      userId: owner.id,
      source: "github",
      externalId: payload.nodeId,
      url: payload.htmlUrl,
      postedAt: payload.mergedAt,
      // Title and description, joined the way they are read. Not the diff —
      // see plans/021 decision 1, and the note in lib/shipped-work.ts.
      body: blocks.join("\n\n").slice(0, MAX_DESCRIPTION_CHARS),
      // The platform's own numbers, verbatim, never parsed for logic.
      meta: {
        repository: payload.repository,
        number: payload.number,
        title: payload.title,
        additions: payload.additions,
        deletions: payload.deletions,
        changedFiles: payload.changedFiles,
        commits: payload.commits,
        labels: payload.labels,
        baseRef: payload.baseRef,
        private: payload.private,
        author: payload.authorLogin,
      },
    })
    .onConflictDoNothing()
    .returning({ id: sourceItem.id })

  if (inserted.length === 0) {
    return Response.json({ state: "duplicate" })
  }

  const sourceItemId = inserted[0].id

  /**
   * `resolveEntitlement`, not `resolveEntitlementForRequest`.
   *
   * The read-only one, exactly as its own comment instructs. The request
   * variant can *start* a trial, and starting somebody's 24-hour free day
   * because CI merged a pull request while they were asleep would spend it for
   * them.
   */
  const entitlement = await resolveEntitlement(owner)

  if (!isEntitled(entitlement)) {
    return Response.json({ state: "stored", reason: "unentitled" })
  }

  /**
   * Paused means paused. Store the merge, draft nothing.
   *
   * Reached when the installation is suspended on GitHub and a delivery still
   * arrives — GitHub keeps sending during a suspension. A `paused` state that
   * went on spending would make the word a lie on `/sources`, and this is the
   * same shape the unentitled branch above takes: the fact is kept, the money
   * is not spent, and the material is there when the pause lifts.
   */
  if (paused) {
    return Response.json({ state: "stored", reason: "paused" })
  }

  if (recent >= MAX_MERGES_PER_DAY) {
    return Response.json({ state: "stored", reason: "daily-ceiling" })
  }

  /**
   * No riff yet, and no id to return.
   *
   * The workflow creates it, and only if the selection finds something. See
   * `startShippedRiff` — most merges are not posts, and a failed card for each
   * would be a notification several times a day.
   */
  try {
    await start(runShippedRiffWorkflow, [
      {
        userId: owner.id,
        sourceItemId,
        repository: payload.repository,
        blocks,
      },
    ])
  } catch (cause) {
    /**
     * The `source_item` stays. Nothing is on screen that claims to be working,
     * because nothing was created — so unlike the voice and meeting routes
     * there is no stuck card to explain, only a merge that was read and left
     * no riff. That is indistinguishable from the common case, which is the
     * cost of not creating the row up front and is why this is logged.
     */
    console.error("[github] could not start workflow:", cause)
  }

  return Response.json({ state: "working", sourceItemId }, { status: 202 })
}

/**
 * Nothing else is allowed here.
 *
 * Exported explicitly so a GET answers 405 rather than Next's default, and so
 * nobody turns this path into a readable endpoint by adding a handler without
 * noticing what arrives at it.
 */
export async function GET() {
  return new Response("Method not allowed", { status: 405 })
}

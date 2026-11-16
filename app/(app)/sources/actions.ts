"use server"

import { revalidatePath } from "next/cache"

import { corpusSummary, importXCorpus } from "@/lib/corpus-x"
import { isEntitled, resolveEntitlementForRequest } from "@/lib/entitlement"
import { installUrl } from "@/lib/github-app"
import { findLastMergedPull, storeBackfilledMerge } from "@/lib/github-backfill"
import { materialFor, MAX_MATERIAL_REQUESTS } from "@/lib/github-material"
import { repoContextFor } from "@/lib/github-repo"
import { getSession } from "@/lib/session"
import { readShippedOutcome } from "@/lib/riffs"
import {
  MAX_ANSWER_CHARS,
  sayOutcome,
  type ShippedOutcome,
} from "@/lib/shipped-outcome"
import {
  answerShippedQuestion,
  openShippedQuestion,
  recordGithubReads,
  recordShippedMaterial,
  recordShippedStop,
} from "@/lib/shipped-meta"
import {
  flattenBlocks,
  NO_MATERIAL,
  readShippedBrief,
  readShippedFacts,
  readShippedMaterial,
  shippedFacts,
} from "@/lib/shipped-work"
import {
  connectSource,
  disconnectSource,
  getSourceConnection,
  readGithubMeta,
  recordArrival,
  setGithubLogin,
  setSigningSecret,
} from "@/lib/source-connections"
import { compileVoice } from "@/lib/voice"
import { spendCooldown } from "@/lib/usage"
import { start } from "workflow/api"
import { runShippedRiffWorkflow } from "@/workflows/run-shipped-riff"

/** One press per ten minutes. Matches `IMPORT_COOLDOWN_MS`: same shape of
 *  action — a human-triggered read that ends in a model call. */
const BACKFILL_COOLDOWN_MS = 10 * 60 * 1000

/**
 * The `usage_event.conversation_id` both halves of that cooldown turn on.
 *
 * Named once, here, because `spendCooldown` reads a tag and the workflow writes
 * it — two files, one string, and a typo between them is a cooldown that
 * silently never fires. Same shape as `ADAPT_SPEND` in lib/adapt.ts.
 */
const BACKFILL_SPEND = "github:backfill"

/**
 * One answer per two minutes. See `answerMergeQuestion`.
 *
 * Shorter than the backfill's ten, because this is somebody replying to a
 * question Quincy asked rather than asking for work — and the ceiling that
 * matters more is upstream: only one question is ever open, and answering it
 * closes it, so the second press inside the window has nothing to answer.
 */
const ANSWER_COOLDOWN_MS = 2 * 60 * 1000

/** The tag the answer spends against. Not the backfill's — a rate limit on one
 *  button must not be trippable by a different button. See `spendCooldown`. */
const ANSWER_SPEND = "github:question"

/**
 * The one mutation /sources has: read the user's own X posts and teach the
 * brain their voice. See plans/011.
 *
 * Two spends happen in here — X charges per post read, the compile is a model
 * call — so the entitlement gate runs first, the same gate the chat route and
 * the heartbeat use. An account whose free day ended does not get to spend.
 *
 * Returns a receipt rather than throwing: the row renders the failure in
 * words, and every failure names its fix (reconnect, billing, retry) rather
 * than reporting that something went wrong.
 */
export type ImportFromXReceipt =
  | {
      ok: true
      imported: number
      postsRead: number
      items: number
      rulesWritten: number
      storiesWritten: number
      /** Pages the compile left alone because the user owns them. */
      skipped: number
      truncated: boolean
    }
  | { ok: false; message: string }

export async function importFromX(): Promise<ImportFromXReceipt> {
  const session = await getSession()
  if (!session) {
    return { ok: false, message: "Not signed in." }
  }

  const entitlement = await resolveEntitlementForRequest(session.user)
  if (!isEntitled(entitlement)) {
    return {
      ok: false,
      message:
        entitlement.state === "lapsed"
          ? "Your subscription is no longer active."
          : "Your free day is over.",
    }
  }

  const imported = await importXCorpus({ userId: session.user.id })

  if (!imported.ok) {
    return {
      ok: false,
      message:
        imported.reason === "billing"
          ? "X refused the read: pay-per-use is not enabled on the developer account."
          : imported.reason === "rate-limited"
            ? "X is rate-limiting reads right now. Try again in a few minutes."
            : imported.reason === "rejected"
              ? "X refused the read. Try again, and if it keeps failing check /channels."
              : imported.message,
    }
  }

  // Nothing new and nothing stored means there is nothing to compile — and
  // no reason to spend a model call re-deriving pages from an empty corpus.
  //
  // Both paths are guarded: the import above already spent money (X reads,
  // and possibly the compile's own model call inside compileVoice), so a
  // throw here must not reach the client as a rejected promise it cannot
  // render — the doc comment above promises a receipt, not an exception.
  let compiled: Awaited<ReturnType<typeof compileVoice>> | null = null
  try {
    compiled =
      imported.imported > 0 || imported.postsRead > 0
        ? await compileVoice({ userId: session.user.id })
        : await compileIfCorpusExists(session.user.id)
  } catch (cause) {
    console.error("[sources] voice compile failed:", cause)
    revalidatePath("/sources")
    return {
      ok: false,
      message:
        imported.imported > 0
          ? `${imported.imported} posts were saved, but the voice compile failed. Press again in a few minutes to retry the compile.`
          : "The voice compile failed. Try again in a few minutes.",
    }
  }

  revalidatePath("/sources")

  return {
    ok: true,
    imported: imported.imported,
    postsRead: imported.postsRead,
    items: compiled?.items ?? 0,
    rulesWritten: compiled?.rulesWritten ?? 0,
    storiesWritten: compiled?.storiesWritten ?? 0,
    skipped: compiled?.skipped.length ?? 0,
    truncated: imported.truncated,
  }
}

/**
 * The re-press with nothing new on the timeline: if a corpus already exists,
 * compiling it again is what the person asked for (the prompt may have
 * improved since); if none exists, the honest receipt is zeroes, not a model
 * call over nothing.
 */
async function compileIfCorpusExists(userId: string) {
  const summary = await corpusSummary(userId)
  if (summary.items === 0) return null
  return compileVoice({ userId })
}

/* ── Circleback ───────────────────────────────────────────────────────────
   The first real source connection. See plans/019.

   Three actions for what is genuinely a three-step setup, and the middle step
   is not one we can remove: Circleback mints the signing secret and only
   reveals it once the automation exists, so the user has to leave, create it,
   and come back with a string. Pretending otherwise would mean accepting the
   first unsigned delivery, and what that accepts is a transcript.

   No entitlement gate on any of these. Connecting spends nothing — the webhook
   is where money is decided, and it resolves entitlement itself at the moment
   a meeting actually arrives. Gating setup would mean a lapsed user cannot
   even prepare to come back.
   ──────────────────────────────────────────────────────────────────────── */

export type CirclebackSetup = {
  /** The full URL to paste into the Circleback automation. */
  url: string
  /** Whether the signing secret has been pasted back. Never the secret. */
  verified: boolean
}

/**
 * Where Circleback should POST.
 *
 * Built from `BETTER_AUTH_URL` rather than from headers, because a webhook URL
 * is copied once and lived with — a value derived from whichever host the user
 * happened to load the page on would hand somebody a preview deployment's URL
 * that stops existing when the branch is deleted.
 */
function webhookUrl(token: string): string {
  const base = (process.env.BETTER_AUTH_URL ?? "").replace(/\/$/, "")
  return `${base}/api/webhooks/circleback/${token}`
}

export async function startCirclebackSetup(): Promise<
  { ok: true; setup: CirclebackSetup } | { ok: false; message: string }
> {
  const session = await getSession()
  if (!session) return { ok: false, message: "Not signed in." }

  if (!process.env.BETTER_AUTH_URL) {
    // 503-shaped rather than a URL with a hole in it. A half-built endpoint
    // pasted into Circleback fails silently forever, and the user has no way
    // to tell that from "no meetings were interesting this week".
    return {
      ok: false,
      message: "Webhooks are not configured on this deployment.",
    }
  }

  // Idempotent: opening the panel twice returns the same URL. Minting a new
  // token on every visit would silently stop the meetings of anyone who had
  // already pasted the first one.
  const connection = await connectSource(session.user.id, "circleback")

  revalidatePath("/sources")

  return {
    ok: true,
    setup: {
      url: webhookUrl(connection.token),
      verified: connection.verified,
    },
  }
}

export async function saveCirclebackSecret(
  secret: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const session = await getSession()
  if (!session) return { ok: false, message: "Not signed in." }

  const result = await setSigningSecret(session.user.id, "circleback", secret)

  if (result.ok) revalidatePath("/sources")

  return result
}

export async function getCirclebackSetup(): Promise<CirclebackSetup | null> {
  const session = await getSession()
  if (!session) return null

  const connection = await getSourceConnection(session.user.id, "circleback")
  if (!connection) return null

  return { url: webhookUrl(connection.token), verified: connection.verified }
}

/**
 * Disconnect, which is also how the URL is rotated.
 *
 * The row is deleted rather than flagged, so the endpoint answers 404 to
 * anyone still holding the old URL — including whoever it leaked to. Behind
 * `<HoldToConfirm>` at the call site, per AGENTS.md: this is destructive and a
 * dialog is two clicks where the second becomes reflex.
 */
export async function disconnectCircleback(): Promise<
  { ok: true } | { ok: false; message: string }
> {
  const session = await getSession()
  if (!session) return { ok: false, message: "Not signed in." }

  await disconnectSource(session.user.id, "circleback")
  revalidatePath("/sources")

  return { ok: true }
}

/* ── GitHub ───────────────────────────────────────────────────────────────
   The second source connection, and a shorter list of actions than Circleback
   needed. See plans/021.

   There is no "paste the secret back" step here, because a GitHub App's
   webhook secret belongs to the deployment rather than to the user — it lives
   in an environment variable and is minted once, by the operator, in the
   manifest flow at /api/connect/github/app. So connecting is a link out to
   GitHub and a redirect home, and the only thing a user can be asked to type is
   the one thing GitHub cannot tell us.

   Same absence of an entitlement gate, for the same reason: connecting spends
   nothing, and the webhook resolves entitlement at the moment a merge actually
   arrives. Gating setup would mean a lapsed user cannot prepare to come back.
   ──────────────────────────────────────────────────────────────────────── */

export type GithubSetup = {
  /**
   * Whether a `source_connection` row exists. **The only thing allowed to
   * decide whether this source is connected.**
   *
   * The page used to read `getSourceConnections()[…]` for that, which is wrong
   * in a way that took a live install to find: that map then merged a *fixture*
   * set for an allowlist of addresses, and the fixture claimed GitHub had been
   * arriving since yesterday. So an allowlisted account saw a connected row,
   * was offered Manage and Disconnect, and was never offered Install — with no
   * row to disconnect, the fixture kept asserting the connection and the page
   * could not be escaped. The install button was unreachable for exactly the
   * account that needed it first. The fixtures are gone; the rule they taught
   * is why this field exists.
   *
   * Circleback never had this fault because its row is gated on
   * `getCirclebackSetup()`, a real read. This field is the same discipline: a
   * connection is a row, and a fixture is a picture of one.
   */
  connected: boolean
  /** Null when the deployment has no app yet — the row says so rather than
   *  offering a button that leads nowhere. */
  installUrl: string | null
  /** The account it is installed on: a personal login or an org name. */
  account: string
  /** Whose merges count. Empty on an org until the user says. */
  login: string
  /** True when it is installed on an organisation, where `login` is asked for. */
  isOrganisation: boolean
}

export async function getGithubSetup(): Promise<GithubSetup | null> {
  const session = await getSession()
  if (!session) return null

  const connection = await getSourceConnection(session.user.id, "github")

  if (!connection) {
    // Not connected. The install URL is still worth returning, because it is
    // what the button needs — and null for it is what tells the row to explain
    // that this deployment has no app rather than to offer a dead link.
    return {
      connected: false,
      installUrl: installUrl(),
      account: "",
      login: "",
      isOrganisation: false,
    }
  }

  const meta = readGithubMeta(connection.meta)

  return {
    connected: true,
    installUrl: installUrl(),
    account: meta.account,
    login: meta.login,
    isOrganisation: meta.accountType === "Organization",
  }
}

/**
 * Say which GitHub username is yours.
 *
 * Only reachable on an organisation installation. On a personal one the account
 * *is* the person and this was answered at install time — asking again would be
 * a field whose only correct value is already on screen.
 */
export async function saveGithubLogin(
  login: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const session = await getSession()
  if (!session) return { ok: false, message: "Not signed in." }

  const result = await setGithubLogin(session.user.id, login)

  if (result.ok) revalidatePath("/sources")

  return result
}

/**
 * Disconnect on Quincy's side.
 *
 * **This does not uninstall the app on GitHub**, and the row says so. Nothing
 * here can: uninstalling is a decision made in GitHub's own settings, and an
 * integration that could remove its own installation could also remove it
 * without being asked. What this does is delete the row, after which deliveries
 * for that installation resolve to nobody and are answered 200 and dropped.
 */
export async function disconnectGithub(): Promise<
  { ok: true } | { ok: false; message: string }
> {
  const session = await getSession()
  if (!session) return { ok: false, message: "Not signed in." }

  await disconnectSource(session.user.id, "github")
  revalidatePath("/sources")

  return { ok: true }
}

/**
 * Read the last pull request this person merged, and turn it into a riff.
 *
 * **The empty state's missing verb.** "Connected today — nothing merged yet"
 * is true and inert: it arrives right after somebody grants something, and
 * gives them nothing back. Every other connection in Quincy proves itself by
 * doing work — X's grant buys a read that produces a portrait — and this one
 * asked for an install and returned a status line.
 *
 * Everything downstream of the fetch is the webhook's own path: the same
 * `descriptionBlocks`, the same `source_item` row, the same
 * `runShippedRiffWorkflow`. Only the delivery differs, so a backfilled riff and
 * a merged-this-morning riff are the same object rather than two shapes that
 * drift.
 *
 * The ceilings, in order of what they protect:
 *
 * - **One pull request.** `findLastMergedPull` returns the newest merge and
 *   stops. A history import would spend a model call per merge and bury /riffs.
 * - **`onConflictDoNothing` on the node id.** A merge already read — by a press
 *   or by the webhook — produces no second riff and no second bill.
 * - **A ten-minute cooldown.** A human can press this, and a claim is not a
 *   cooldown: without one the button is pressable all afternoon.
 * - **The entitlement gate**, because the workflow behind it spends.
 */
export type BackfillResult =
  /**
   * The id travels back so the caller can ask what became of it.
   *
   * `started: true` used to be the end of the conversation, and it was the one
   * answer of the three that could not be trusted: the workflow decides whether
   * there is a post in a merge *after* this returns, and most merges are not
   * posts. So the row said "the riff will be on /riffs in a moment", the
   * selection said no a few seconds later, and nothing on screen ever heard
   * about it. Started is a beginning, and this is how the end gets read.
   */
  | { ok: true; started: true; sourceItemId: string }
  | { ok: true; started: false; message: string }
  | { ok: false; message: string }

export async function readLastMergedPull(): Promise<BackfillResult> {
  const session = await getSession()
  if (!session) return { ok: false, message: "Not signed in." }

  const entitlement = await resolveEntitlementForRequest(session.user)
  if (!isEntitled(entitlement)) {
    return {
      ok: false,
      message:
        entitlement.state === "lapsed"
          ? "Your subscription is no longer active."
          : "Your free day is over.",
    }
  }

  const cooldown = await spendCooldown(
    session.user.id,
    BACKFILL_SPEND,
    BACKFILL_COOLDOWN_MS
  )
  if (!cooldown.ready) {
    return {
      ok: false,
      message: `Just read that one — ${cooldown.secondsLeft}s before the next.`,
    }
  }

  const connection = await getSourceConnection(session.user.id, "github")
  if (!connection) {
    return { ok: false, message: "GitHub is not connected." }
  }

  const meta = readGithubMeta(connection.meta)

  /**
   * No login, no read — the same refusal `shippedGate` makes on the webhook.
   * On an organisation install the account name is the org, which is not an
   * author, and guessing would mean drafting a post about a colleague's work
   * under this person's name.
   */
  if (!meta.login) {
    return {
      ok: false,
      message:
        "Tell me your GitHub username first — on an organisation I cannot tell which merges are yours.",
    }
  }

  const found = await findLastMergedPull({
    installationId: meta.installationId,
    login: meta.login,
  })

  if (!found) {
    return {
      ok: true,
      started: false,
      message:
        "I could not find a merged pull request of yours in the repositories you gave me. The next one you merge will arrive on its own.",
    }
  }

  /**
   * The connection is working: a merge was found, it was theirs, and it is
   * stored. Recorded before the outcome is known, exactly as the webhook does
   * it and for the same reason — "material is arriving" is true whether or not
   * this merge turned out to be worth publishing.
   *
   * This was missing, and `startShippedRiff`'s comment had already promised it:
   * "what tells the user the connection is alive is /sources saying material is
   * arriving". It never said so, because nothing on this path ever moved the
   * row off `waiting` — so a GitHub connection that had read a merge went on
   * reporting "nothing merged yet" indefinitely.
   *
   * **Not while paused.** `recordArrival` sets `arriving`, which would lift a
   * pause nobody asked to lift. The webhook guards the same call the same way,
   * and a `paused` that un-pauses itself makes the word a lie on /sources.
   */
  if (connection.state !== "paused") {
    await recordArrival(connection.id)
  }

  const stored = await storeBackfilledMerge({
    userId: session.user.id,
    payload: found.payload,
  })

  if (!stored.stored) {
    /**
     * Already read, and this is where the old message was a guess. It said the
     * riff was in /riffs; the likeliest truth is that the selection found no
     * post in this merge and no riff was ever created. Ask the row.
     */
    const outcome = stored.sourceItemId
      ? await readShippedOutcome({
          userId: session.user.id,
          sourceItemId: stored.sourceItemId,
        })
      : null

    return {
      ok: true,
      started: false,
      message: `I have already read that one. ${sayOutcome(outcome)}`,
    }
  }

  /**
   * What the repository says about itself, read here rather than inside
   * `storeBackfilledMerge`.
   *
   * The webhook puts the same object on `source_item.meta` because the webhook
   * owns that insert; this path does not, and duplicating the write through a
   * second argument would give one row two authors. What both paths *do* share
   * is that the workflow needs it, so it goes into the payload.
   *
   * **It may never cost the user their riff.** `repoContextFor` does not throw
   * and this catch is belt to those braces: a merge with no repository context
   * is a merge that still becomes a riff, one written by a model that has to
   * guess at the product. That is the behaviour this whole change improves on,
   * not a regression from it.
   */
  const repo = await repoContextFor({
    connectionId: connection.id,
    installationId: meta.installationId,
    repository: found.payload.repository,
    meta: connection.meta,
  }).catch((cause) => {
    console.error("[sources] could not read repository context:", cause)
    return null
  })

  /**
   * What the merge is made of, on the same terms the webhook fetches it. See
   * plans/027 phase 1a.
   *
   * Bounded by `MAX_MATERIAL_REQUESTS` per press and by
   * `BACKFILL_COOLDOWN_MS` per person, which is the pairing AGENTS.md asks for:
   * a ceiling on what one run buys and a cooldown on how often somebody can
   * trigger it. Never throws, and a merge with no material still becomes a
   * riff.
   */
  const material = await materialFor({
    installationId: meta.installationId,
    repository: found.payload.repository,
    number: found.payload.number,
    body: found.payload.body,
  }).catch((cause) => {
    console.error("[sources] could not read the material:", cause)
    return NO_MATERIAL
  })

  await recordShippedMaterial(stored.sourceItemId, material).catch((cause) => {
    console.error("[sources] could not store the material:", cause)
  })

  await recordGithubReads(session.user.id, MAX_MATERIAL_REQUESTS)

  try {
    await start(runShippedRiffWorkflow, [
      {
        userId: session.user.id,
        sourceItemId: stored.sourceItemId,
        facts: shippedFacts(found.payload, repo),
        blocks: stored.blocks,
        material,
        timezone: session.user.timezone ?? "",
        /**
         * The tag `BACKFILL_COOLDOWN_MS` is checked against.
         *
         * `spendCooldown` reads the most recent `usage_event` carrying it, and
         * nothing on this path had ever written one — so the ten-minute
         * cooldown above was a check against a row that did not exist and the
         * button was pressable all afternoon, which is precisely the failure
         * AGENTS.md names ("a claim is not a cooldown"). The workflow writes
         * the tag when it meters the selection.
         */
        spendTag: BACKFILL_SPEND,
      },
    ])
  } catch (cause) {
    /**
     * The `source_item` stays, exactly as the webhook leaves it on the same
     * failure — and, as there, it now says why rather than looking identical to
     * a merge nothing was found in.
     */
    console.error("[sources] could not start the backfill workflow:", cause)
    await recordShippedStop({
      sourceItemId: stored.sourceItemId,
      reason: "not-started",
      why: "Quincy read this merge but could not start the write.",
    }).catch((why) => {
      console.error("[sources] could not record the stop:", why)
    })
    return {
      ok: false,
      message: "I read it but could not start the write. Try again shortly.",
    }
  }

  revalidatePath("/riffs")
  revalidatePath("/sources")
  return { ok: true, started: true, sourceItemId: stored.sourceItemId }
}

/**
 * What became of the merge that button just read.
 *
 * The other half of `readLastMergedPull`. The workflow behind it takes seconds
 * and the answer is usually "there was no post in this one", so somebody has to
 * ask — a server action polled by the row rather than a socket, for the reason
 * `RiffsRefresh` gives about a wait of this length happening a handful of times
 * a day.
 *
 * No cooldown and no entitlement gate. This spends nothing: two indexed selects
 * against rows the caller already owns, and the ownership is checked inside
 * `readShippedOutcome` because the id it takes has been to a browser and back.
 */
export async function readMergeOutcome(
  sourceItemId: string
): Promise<ShippedOutcome | null> {
  const session = await getSession()
  if (!session) return null

  return readShippedOutcome({ userId: session.user.id, sourceItemId })
}

/* ── The one question ─────────────────────────────────────────────────────
   See plans/027 phase 1c. A refusal is honest and inert; this is the half that
   can turn one into a post without lowering the bar.

   The whole exchange is two server actions and one row. Quincy writes
   `source_item.meta.question` when it cannot find the event in a merge; the row
   on /sources renders it; the answer goes back into the same key and re-runs
   the workflow with the answer as a quotable block. Nothing else in the
   pipeline changes shape.
   ──────────────────────────────────────────────────────────────────────── */

export type MergeQuestion = {
  sourceItemId: string
  text: string
  /** `owner/repo#282`, so the row can say what it is asking about. */
  about: string
  /** The merge on GitHub, so the answer can be checked against the work. */
  url: string
}

/**
 * The question waiting on this person, or null.
 *
 * Read on the page rather than by the row, because the row is a client
 * component and this is one indexed select the server is already making a round
 * trip for. Costs nothing and gates nothing: a question is not a spend.
 */
export async function getOpenMergeQuestion(): Promise<MergeQuestion | null> {
  const session = await getSession()
  if (!session) return null

  const open = await openShippedQuestion(session.user.id)
  if (!open) return null

  return {
    sourceItemId: open.sourceItemId,
    text: open.question.text,
    about: open.about,
    url: open.url,
  }
}

/**
 * Answer it, and let the answer become the missing beat.
 *
 * The ceilings, in the order they protect:
 *
 * - **The write is conditional.** `answerShippedQuestion` matches on the
 *   question still being open, in SQL, so a double submit writes one answer and
 *   returns null for the second — which is what stops two workflows starting.
 * - **A two-minute cooldown**, because a person can press this and a claim is
 *   not a cooldown. Keyed on its own tag, never the backfill's.
 * - **The entitlement gate**, because the workflow behind it spends.
 * - **The brief is not bought twice.** It is on `meta` already and rides the
 *   payload, so the re-run pays for the selection and the angles and nothing
 *   else.
 */
export async function answerMergeQuestion(
  sourceItemId: string,
  answer: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const session = await getSession()
  if (!session) return { ok: false, message: "Not signed in." }

  const said = answer.trim()

  if (!said) {
    return { ok: false, message: "Tell me in a line — anything is enough." }
  }

  if (said.length > MAX_ANSWER_CHARS) {
    return {
      ok: false,
      message: `That is longer than I can use — keep it under ${MAX_ANSWER_CHARS} characters.`,
    }
  }

  const entitlement = await resolveEntitlementForRequest(session.user)
  if (!isEntitled(entitlement)) {
    return {
      ok: false,
      message:
        entitlement.state === "lapsed"
          ? "Your subscription is no longer active."
          : "Your free day is over.",
    }
  }

  const cooldown = await spendCooldown(
    session.user.id,
    ANSWER_SPEND,
    ANSWER_COOLDOWN_MS
  )
  if (!cooldown.ready) {
    return {
      ok: false,
      message: `Still writing the last one — ${cooldown.secondsLeft}s.`,
    }
  }

  const answered = await answerShippedQuestion({
    userId: session.user.id,
    sourceItemId,
    answer: said,
  })

  if (!answered) {
    // Somebody — another tab, a second tap — got there first, or the id is not
    // theirs. Both are "there is nothing to answer", and neither is an error
    // worth a red line on the row.
    revalidatePath("/sources")
    return { ok: true }
  }

  /**
   * The blocks, recovered from `source_item.body`.
   *
   * The workflow's own comment says the boundaries should not be recovered by
   * splitting a stored string — and it is right about the *ingest* path, where
   * the array is in hand and a round trip would be gratuitous. Here there is no
   * array: the merge was read days ago and the row is all that is left. It is
   * safe because the two halves compose: the body was written as
   * `blocks.join("\n\n")` where each block had already been through
   * `flattenMarkdown`, and `flattenBlocks` is idempotent over exactly that —
   * asserted sixteen ways in lib/shipped-work.test.ts. So this returns the same
   * array the ingest had, and the indices mean what they meant.
   */
  const blocks = flattenBlocks(answered.body)

  const meta = answered.meta

  try {
    await start(runShippedRiffWorkflow, [
      {
        userId: session.user.id,
        sourceItemId: answered.sourceItemId,
        facts: readShippedFacts({
          repository: meta.repository,
          number: meta.number,
          private: meta.private,
          additions: meta.additions,
          deletions: meta.deletions,
          changedFiles: meta.changedFiles,
          commits: meta.commits,
          labels: meta.labels,
          mergedAt: answered.postedAt ? answered.postedAt.toISOString() : "",
          // Deliberately not refetched. The repository context is cached on the
          // connection for a week and this path is not worth a cold read of it;
          // `describeRepo(null)` is "" and the prompt is shorter.
          repo: null,
        }),
        blocks,
        material: readShippedMaterial(meta.material),
        // Already paid for at ingest. The merge has not changed, so neither has
        // the brief — and re-buying it would be a second spend on a path a
        // person can trigger.
        brief: readShippedBrief(meta.brief),
        answer: answered.answer,
        timezone: session.user.timezone ?? "",
        spendTag: ANSWER_SPEND,
      },
    ])
  } catch (cause) {
    /**
     * The answer is stored either way, and that is the right order: what they
     * typed is the durable fact and the riff is derived from it. The message
     * says so rather than implying the answer was lost.
     */
    console.error("[sources] could not re-run after an answer:", cause)
    return {
      ok: false,
      message:
        "I saved your answer but could not start the write. It will be used the next time this merge is read.",
    }
  }

  revalidatePath("/riffs")
  revalidatePath("/sources")

  return { ok: true }
}

"use server"

import { revalidatePath } from "next/cache"

import { corpusSummary, importXCorpus } from "@/lib/corpus-x"
import { isEntitled, resolveEntitlementForRequest } from "@/lib/entitlement"
import { installUrl } from "@/lib/github-app"
import {
  findLastMergedPull,
  storeBackfilledMerge,
} from "@/lib/github-backfill"
import { getSession } from "@/lib/session"
import {
  connectSource,
  disconnectSource,
  getSourceConnection,
  readGithubMeta,
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
  | { ok: true; started: true }
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
    "github:backfill",
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

  const stored = await storeBackfilledMerge({
    userId: session.user.id,
    payload: found.payload,
  })

  if (!stored) {
    return {
      ok: true,
      started: false,
      message: "I have already read that one — it is in your riffs.",
    }
  }

  try {
    await start(runShippedRiffWorkflow, [
      {
        userId: session.user.id,
        sourceItemId: stored.sourceItemId,
        repository: found.repository,
        blocks: stored.blocks,
      },
    ])
  } catch (cause) {
    /**
     * The `source_item` stays, exactly as the webhook leaves it on the same
     * failure. The merge was read and the row is true; nothing on screen claims
     * to be working, because no riff was created.
     */
    console.error("[sources] could not start the backfill workflow:", cause)
    return {
      ok: false,
      message: "I read it but could not start the write. Try again shortly.",
    }
  }

  revalidatePath("/riffs")
  revalidatePath("/sources")
  return { ok: true, started: true }
}

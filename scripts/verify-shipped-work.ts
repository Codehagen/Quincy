/**
 * The GitHub path end to end, against a running dev server, exactly as GitHub
 * would reach it. See plans/021.
 *
 *   npx tsx --env-file=.env.local scripts/verify-shipped-work.ts
 *   npx tsx --env-file=.env.local scripts/verify-shipped-work.ts --port 3005
 *   npx tsx --env-file=.env.local scripts/verify-shipped-work.ts --live
 *
 * lib/shipped-work.test.ts proves the pure parts in isolation. This proves the
 * *endpoint*: that an unsigned body is refused, that a tampered one is refused,
 * that a colleague's merge leaves nothing, that a redelivery is a no-op, and
 * that what lands in the database is the description and never the diff.
 *
 * **The discriminating set is the point.** plans/README.md records that 003
 * shipped a guard which could never run. An unverified HMAC is the same defect
 * wearing a different hat: a route that reads `x-hub-signature-256` and ignores
 * it passes every test that only ever sends a *correct* signature. So the
 * tampered-body case is here, and it is the check that matters most.
 *
 * **Two modes, and the default is not free.** scripts/verify-circleback.ts says
 * of its own default that "the workflow is not awaited and no model is called".
 * The first half is true and the second is not, in both scripts: the route
 * calls `start()` either way, so the workflow runs, the selection is paid for,
 * and a riff can appear *after* teardown has already run — which is how the
 * first live run of this file found a leftover riff from the stubbed run before
 * it. Measured at five model calls and $0.0875 across one of each.
 *
 * So the honest difference is what is *asserted*, not what is spent. The
 * default does not wait, so it cannot be flaky on a provider and says nothing
 * about the prompt. `--live` waits for the workflow and is the only way to
 * learn whether the passage Quincy picks is the one a human would have picked,
 * and whether a merge that is not a post correctly leaves no card *and still
 * says why* — the second half added after a live install produced the right
 * verdict and no way for anybody to read it. The PR body should say which one
 * was run.
 *
 * **The payloads are real.** The two pull requests below are #23 and #5 of this
 * repository, with their real descriptions, numbers and logins. A fabricated
 * body agrees with whatever the parser happens to do; a real one disagrees when
 * GitHub's shape is not what the parser assumed. #5 is here because it is the
 * *negative* — a four-line documentation update with a genuine description on
 * it — and a selection prompt that turns it into a card is the thing plan 021
 * names as a STOP condition.
 *
 * Runs against the @quincy.test dev account, the same guard
 * scripts/dev-account.ts enforces. Run that first if the account is missing.
 *
 * Teardown deletes only the connection, source items and riffs it created.
 */
import { createHmac } from "node:crypto"
import { and, eq, inArray } from "drizzle-orm"

import { db } from "../lib/db"
import { readShippedOutcome } from "../lib/riffs"
import { riff, riffAngle, sourceConnection, sourceItem } from "../lib/schema-app"
import { sayOutcome } from "../lib/shipped-outcome"
import { descriptionBlocks } from "../lib/shipped-work"
import { user } from "../lib/schema"
import {
  connectGithubInstallation,
  disconnectSource,
  githubInstallationToken,
  setGithubLogin,
} from "../lib/source-connections"

const portFlag = process.argv.indexOf("--port")
const PORT = portFlag > -1 ? process.argv[portFlag + 1] : "3000"
const BASE = `http://localhost:${PORT}`
const LIVE = process.argv.includes("--live")

const ACCOUNT = process.env.DEV_ACCOUNT_EMAIL ?? "dev@quincy.test"

if (!ACCOUNT.endsWith("@quincy.test")) {
  throw new Error(
    `Refusing to touch ${ACCOUNT} — this script writes source connections, ` +
      "source items and riffs, and only operates on @quincy.test accounts."
  )
}

const SECRET = process.env.GITHUB_APP_WEBHOOK_SECRET

if (!SECRET) {
  throw new Error(
    "GITHUB_APP_WEBHOOK_SECRET is not set. The route refuses every delivery " +
      "without it, so this script would only prove that it answers 503. " +
      "Create the app at /api/connect/github/app first."
  )
}

/** A fixed id so a re-run collides with itself rather than accumulating rows. */
const INSTALLATION_ID = 90000001
const LOGIN = "codehagen"

let failures = 0
const nodeIds: string[] = []

/** `(condition, label, detail)`, matching scripts/verify-circleback.ts. */
function check(ok: boolean, label: string, detail = "") {
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`
  )
  if (!ok) failures += 1
}

function sign(body: string): string {
  return `sha256=${createHmac("sha256", SECRET!).update(body).digest("hex")}`
}

/**
 * PR #23 of this repository, abridged to four blocks but otherwise verbatim.
 *
 * Chosen because it is unambiguously material: a decision with a reason, a
 * measurement, and an argument a stranger could learn from. If the selection
 * prompt cannot find a passage in this, the prompt is broken rather than
 * conservative.
 */
function shippedPayload(nodeId: string, overrides: Record<string, unknown> = {}) {
  nodeIds.push(nodeId)

  const { pull_request: pullOverrides, ...rest } = overrides

  return {
    action: "closed",
    installation: { id: INSTALLATION_ID },
    ...rest,
    pull_request: {
      node_id: nodeId,
      number: 23,
      title: "Say it out loud and come back to angles",
      body: [
        "Voice notes become riffs. `/riffs` has listed \"Voice notes — what you said out loud\" since before anything could produce one.",
        "The first background job in the product that is not a cron. A cron is the wrong shape for a voice note twice over: it fires on a clock rather than on a person pressing stop, and it has no per-run state, so a card would have nothing to read while the work was in flight.",
        "`after()` was the cheaper option and does not survive the comparison. It is not durable — a crashed function loses the work with no retry and no row that knows it was running — and the pipeline here is two failure-prone external calls back to back, with nobody watching.",
        "Measured from the live run: 128 characters of transcript for 8.1 seconds of Norwegian, so about 16 characters a second. At the old 6,000 ceiling that silently discarded 37% of what somebody said.",
      ].join("\n\n"),
      html_url: `https://github.com/Codehagen/Quincy/pull/23`,
      merged: true,
      draft: false,
      merged_at: "2026-08-08T13:32:43Z",
      additions: 6343,
      deletions: 103,
      changed_files: 29,
      commits: 7,
      labels: [],
      user: { login: "Codehagen" },
      base: {
        ref: "main",
        repo: {
          full_name: "Codehagen/Quincy",
          default_branch: "main",
          private: true,
        },
      },
      ...((pullOverrides as object) ?? {}),
    },
  }
}

/**
 * PR #5, the negative. Four lines added, one file, and a real description.
 *
 * `--live` only. A selection that returns a passage from this is the STOP
 * condition plan 021 names: "if a `docs:` commit with a 400-character
 * description still produces a card, the ceiling is treating a symptom."
 */
function bookkeepingPayload(nodeId: string) {
  nodeIds.push(nodeId)

  return {
    action: "closed",
    installation: { id: INSTALLATION_ID },
    pull_request: {
      node_id: nodeId,
      number: 5,
      title: "docs: 004 is done, and the backlog is empty",
      body: "Marks plan 004 as DONE in the index with its commit hash, and notes that the billing audit's backlog is now empty.\n\nNo code changes. One line in plans/README.md.",
      html_url: "https://github.com/Codehagen/Quincy/pull/5",
      merged: true,
      draft: false,
      merged_at: "2026-08-03T09:00:00Z",
      additions: 4,
      deletions: 3,
      changed_files: 1,
      commits: 1,
      labels: [],
      user: { login: "Codehagen" },
      base: {
        ref: "main",
        repo: {
          full_name: "Codehagen/Quincy",
          default_branch: "main",
          private: true,
        },
      },
    },
  }
}

function post(
  body: string,
  signature: string | null,
  event = "pull_request"
) {
  return fetch(`${BASE}/api/webhooks/github`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-github-event": event,
      "x-github-delivery": crypto.randomUUID(),
      ...(signature ? { "x-hub-signature-256": signature } : {}),
    },
    body,
    redirect: "manual",
  })
}

async function main() {
  const [owner] = await db
    .select()
    .from(user)
    .where(eq(user.email, ACCOUNT))
    .limit(1)

  if (!owner) {
    throw new Error(
      `No ${ACCOUNT} user. Run: npx tsx --env-file=.env.local scripts/dev-account.ts`
    )
  }

  console.log(`Mode: ${LIVE ? "LIVE (real model, real money)" : "stubbed"}`)

  /**
   * Hold the account entitled for the length of the run, and put it back after.
   *
   * The same arrangement scripts/verify-circleback.ts makes, and for the reason
   * recorded there: the dev account's trial is long over, so without this the
   * route takes its `stored / unentitled` branch and every riff assertion fails
   * for a reason that has nothing to do with the code under test.
   */
  const originalTrialEndsAt = owner.trialEndsAt

  async function setTrial(endsAt: Date | null) {
    await db
      .update(user)
      .set({ trialEndsAt: endsAt })
      .where(eq(user.id, owner.id))
  }

  await setTrial(new Date(Date.now() + 60 * 60 * 1000))
  console.log("Entitlement: held open for this run")

  try {
    console.log("\n── the route is not reachable by accident ──")
    {
      /**
       * The whole endpoint depends on `/api/webhooks` being outside proxy.ts's
       * matcher. Pinned here because the failure is silent in the worst way:
       * inside the matcher every delivery is 307'd to /login, and GitHub's
       * delivery log reports a redirect while nothing is ever received.
       */
      const get = await fetch(`${BASE}/api/webhooks/github`, {
        redirect: "manual",
      })
      check(get.status === 405, "GET is refused", String(get.status))

      const unsigned = await post(JSON.stringify({}), null)
      check(
        unsigned.status === 401,
        "an unsigned body is refused",
        String(unsigned.status)
      )
    }

    console.log("\n── the discriminating set ──")
    {
      const body = JSON.stringify(shippedPayload("PR_verify_tamper"))

      const wrongKey = await post(
        body,
        `sha256=${createHmac("sha256", "not-the-secret").update(body).digest("hex")}`
      )
      check(wrongKey.status === 401, "a signature from the wrong key is refused")

      /**
       * The check that matters most. The signature is valid *for the original
       * body*, and the body has been changed — which is exactly what a route
       * that reads the header and ignores it cannot tell apart from a real
       * delivery.
       */
      const signature = sign(body)
      const tampered = body.replace("Codehagen/Quincy", "attacker/repo")
      const forged = await post(tampered, signature)
      check(
        forged.status === 401,
        "a tampered body with the original signature is refused",
        String(forged.status)
      )

      const sha1Style = await post(body, "sha1=deadbeef")
      check(sha1Style.status === 401, "a non-sha256 signature is refused")

      const rows = await db
        .select({ id: sourceItem.id })
        .from(sourceItem)
        .where(
          and(
            eq(sourceItem.userId, owner.id),
            eq(sourceItem.source, "github")
          )
        )
      check(rows.length === 0, "and none of them stored anything")
    }

    console.log("\n── ping is the setup handshake ──")
    {
      const body = JSON.stringify({ zen: "Non-blocking is better than blocking." })
      const ping = await post(body, sign(body), "ping")
      check(ping.status === 200, "a signed ping answers 200", String(ping.status))
    }

    console.log("\n── an unknown installation is not an error ──")
    {
      const body = JSON.stringify(shippedPayload("PR_verify_unknown"))
      const response = await post(body, sign(body))

      /**
       * 200, not 404. The likeliest cause is a real installation whose Quincy
       * row was removed, and answering 404 would paint a permanent red cross in
       * the repository settings of somebody who disconnected on purpose.
       */
      check(
        response.status === 200,
        "a signed delivery for an unconnected installation answers 200",
        String(response.status)
      )

      const payload = (await response.json()) as { state?: string }
      check(
        payload.state === "unknown-installation",
        "and says so rather than pretending to work",
        String(payload.state)
      )
    }

    console.log("\n── setup ──")
    {
      const connected = await connectGithubInstallation(owner.id, {
        installationId: INSTALLATION_ID,
        account: "Codehagen",
        accountType: "User",
        login: LOGIN,
      })
      check(connected.ok, "the installation connects")

      const [row] = await db
        .select()
        .from(sourceConnection)
        .where(eq(sourceConnection.token, githubInstallationToken(INSTALLATION_ID)))

      check(row?.state === "waiting", "and lands on waiting, not arriving", row?.state)
      check(
        row?.signingSecret === null,
        "with no per-connection secret — the app owns it"
      )
    }

    console.log("\n── one installation cannot be claimed by two accounts ──")
    {
      /**
       * The guard that stops one person's merges drafting posts under another
       * person's name, and it had no test at all until this one.
       *
       * Needs a second account, so one is created and destroyed inside the
       * block — at an `@quincy.test` address, so the guard at the top of this
       * file still describes everything the script can touch.
       */
      const claimantId = "u_verify_gh_claimant"

      await db
        .insert(user)
        .values({
          id: claimantId,
          name: "Claimant",
          email: "claimant@quincy.test",
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoNothing()

      try {
        const stolen = await connectGithubInstallation(claimantId, {
          installationId: INSTALLATION_ID,
          account: "Codehagen",
          accountType: "User",
          login: LOGIN,
        })

        check(
          !stolen.ok,
          "a second account cannot claim an installation already connected"
        )
        check(
          !stolen.ok && stolen.message.includes("another Quincy account"),
          "and is told why, rather than getting a blank failure"
        )

        const [row] = await db
          .select({ userId: sourceConnection.userId })
          .from(sourceConnection)
          .where(
            eq(sourceConnection.token, githubInstallationToken(INSTALLATION_ID))
          )

        check(
          row?.userId === owner.id,
          "and the installation still belongs to the first account"
        )
      } finally {
        await db.delete(user).where(eq(user.id, claimantId))
      }
    }

    console.log("\n── the gates ──")
    {
      const closed = JSON.stringify(
        shippedPayload("PR_verify_unmerged", { pull_request: { merged: false } })
      )
      const unmerged = await post(closed, sign(closed))
      check(
        ((await unmerged.json()) as { reason?: string }).reason === "not-merged",
        "a pull request closed without merging leaves nothing"
      )

      const stacked = JSON.stringify(
        shippedPayload("PR_verify_stacked", {
          pull_request: {
            base: {
              ref: "feat/parent",
              repo: {
                full_name: "Codehagen/Quincy",
                default_branch: "main",
                private: true,
              },
            },
          },
        })
      )
      const notDefault = await post(stacked, sign(stacked))
      check(
        ((await notDefault.json()) as { reason?: string }).reason ===
          "not-default-branch",
        "a merge into a feature branch leaves nothing"
      )

      const colleague = JSON.stringify(
        shippedPayload("PR_verify_colleague", {
          pull_request: { user: { login: "somebody-else" } },
        })
      )
      const notMine = await post(colleague, sign(colleague))
      check(
        ((await notMine.json()) as { reason?: string }).reason === "not-author",
        "a colleague's merge leaves nothing"
      )

      const stored = await db
        .select({ id: sourceItem.id })
        .from(sourceItem)
        .where(
          and(eq(sourceItem.userId, owner.id), eq(sourceItem.source, "github"))
        )

      /**
       * The privacy assertion, written against a count rather than a body.
       * A gated merge must not reach `source_item` at all — storing a
       * colleague's description "for dedup" would be an archive of everything
       * anybody on the team has ever shipped.
       */
      check(stored.length === 0, "and none of the three was stored", String(stored.length))
    }

    console.log("\n── an organisation installation refuses to guess ──")
    {
      await connectGithubInstallation(owner.id, {
        installationId: INSTALLATION_ID,
        account: "some-org",
        accountType: "Organization",
        login: "",
      })

      const body = JSON.stringify(shippedPayload("PR_verify_noorg"))
      const response = await post(body, sign(body))
      check(
        ((await response.json()) as { reason?: string }).reason === "no-login",
        "every merge is skipped until a username is set"
      )

      const [row] = await db
        .select({ lastError: sourceConnection.lastError })
        .from(sourceConnection)
        .where(eq(sourceConnection.userId, owner.id))

      check(
        (row?.lastError ?? "").includes("username"),
        "and the row says why, so /sources can too"
      )

      const named = await setGithubLogin(owner.id, "@CodeHagen")
      check(named.ok, "setting the username is accepted")

      const [after] = await db
        .select({ meta: sourceConnection.meta })
        .from(sourceConnection)
        .where(eq(sourceConnection.userId, owner.id))

      /**
       * Lower-cased on the way in. GitHub logins are case-insensitive and the
       * gate compares exactly, so storing "CodeHagen" would silently drop every
       * merge — a failure indistinguishable from the app not being installed.
       */
      check(
        (after?.meta as { login?: string })?.login === "codehagen",
        "and stored lower-cased, with the @ stripped",
        String((after?.meta as { login?: string })?.login)
      )
    }

    console.log("\n── a real merge ──")
    // Kept as an object as well as a string: the live assertion below needs the
    // blocks the user actually wrote, and recovering them from the JSON would
    // be comparing decoded text against encoded text.
    const realPayload = shippedPayload("PR_verify_real")
    const body = JSON.stringify(realPayload)
    {
      const response = await post(body, sign(body))
      check(
        response.status === 202,
        "a correctly signed merge is accepted",
        String(response.status)
      )

      const items = await db
        .select()
        .from(sourceItem)
        .where(
          and(
            eq(sourceItem.userId, owner.id),
            eq(sourceItem.externalId, "PR_verify_real")
          )
        )

      check(items.length === 1, "exactly one source_item exists", String(items.length))

      const item = items[0]
      if (item) {
        check(item.source === "github", "filed under github", item.source)
        check(
          item.body.includes("Voice notes become riffs"),
          "the description is stored"
        )
        check(
          item.body.startsWith("Say it out loud"),
          "with the title first, because the title is material here"
        )
        /**
         * The decision-1 assertion. A diff is not in the payload at all, so
         * this cannot fail today — which is exactly why it is written down: the
         * day somebody adds an installation-token fetch to "enrich" the row,
         * this is what says no.
         */
        check(
          !item.body.includes("diff --git") && !item.body.includes("@@"),
          "and not one line of a diff"
        )
        check(
          item.url === "https://github.com/Codehagen/Quincy/pull/23",
          "the row links back to the pull request"
        )
        check(
          (item.meta as { additions?: number })?.additions === 6343,
          "the platform's own numbers are kept in meta"
        )
      }

      const [connection] = await db
        .select({ state: sourceConnection.state })
        .from(sourceConnection)
        .where(eq(sourceConnection.userId, owner.id))

      check(
        connection?.state === "arriving",
        "and the connection moves off waiting",
        connection?.state
      )
    }

    console.log("\n── the same merge, redelivered ──")
    {
      /**
       * The row that distinguishes idempotency from an endpoint that happens to
       * work once — and the one most likely to be got wrong here, because the
       * obvious implementation dedups on `X-GitHub-Delivery`, which is a fresh
       * GUID on every manual redelivery. `post` sends a new one each time on
       * purpose.
       */
      const again = await post(body, sign(body))
      const payload = (await again.json()) as { state?: string }

      check(payload.state === "duplicate", "is a no-op", String(payload.state))

      const items = await db
        .select({ id: sourceItem.id })
        .from(sourceItem)
        .where(
          and(
            eq(sourceItem.userId, owner.id),
            eq(sourceItem.externalId, "PR_verify_real")
          )
        )

      check(items.length === 1, "and still exactly one row", String(items.length))
    }

    if (LIVE) {
      console.log("\n── the workflow finishes (live) ──")
      {
        const made = await waitForShippedRiff(owner.id)

        check(made !== null, "a riff was created from the merge")

        if (made) {
          check(made.state === "ready", "and reaches a terminal state", made.state)
          check(
            made.sourceLabel === "Pull request",
            "labelled by shape, not by vendor",
            made.sourceLabel
          )
          /**
           * Every block of the scrap has to be a block the user wrote — the
           * guarantee `assembleDescription` exists to make.
           *
           * Checked against the parsed blocks and **not** against the JSON body,
           * which is what the first version of this assertion did and why it
           * failed on a passage that was in fact verbatim: the payload's quotes
           * and newlines are escaped inside the JSON, so a `body.includes(...)`
           * compares decoded text against encoded text and reports a
           * fabrication that never happened. Recorded rather than quietly
           * corrected, because a verification that cries wolf on the one
           * property it is protecting is worse than not having it.
           */
          const wrote = new Set(descriptionBlocks(realPayload.pull_request))
          const scrapBlocks = made.scrap.split("\n\n")

          check(
            made.scrap.length > 0 && scrapBlocks.every((b) => wrote.has(b)),
            "and every block of its scrap is verbatim from what the user wrote",
            `${scrapBlocks.length} block(s)`
          )

          const angles = await db
            .select()
            .from(riffAngle)
            .where(eq(riffAngle.riffId, made.id))

          check(angles.length > 0, "angles were written", String(angles.length))
          for (const angle of angles) {
            console.log(`      · ${angle.shape}: ${angle.hook}`)
          }
        }
      }

      console.log("\n── and a merge that is not a post leaves nothing ──")
      {
        /**
         * The STOP condition, as an assertion. A documentation update with a
         * real description on it must produce a `source_item` and no riff — if
         * it produces a card, the prompt is broken and the daily ceiling is
         * treating a symptom.
         */
        const before = await countShippedRiffs(owner.id)
        const bookkeeping = JSON.stringify(bookkeepingPayload("PR_verify_docs"))
        const response = await post(bookkeeping, sign(bookkeeping))

        check(response.status === 202, "it is accepted like any other merge")

        await new Promise((resolve) => setTimeout(resolve, 45_000))

        const after = await countShippedRiffs(owner.id)
        check(
          after === before,
          "and no riff was made for it",
          `${before} → ${after}`
        )

        const items = await db
          .select({ id: sourceItem.id, meta: sourceItem.meta })
          .from(sourceItem)
          .where(
            and(
              eq(sourceItem.userId, owner.id),
              eq(sourceItem.externalId, "PR_verify_docs")
            )
          )

        check(
          items.length === 1,
          "though the merge is recorded, so a redelivery cannot pay to reread it"
        )

        /**
         * "Leaves nothing" was taken too literally, and it cost a live user a
         * silence.
         *
         * Every assertion above this one passed on 2026-08-21 against a real
         * install, and /sources still said "the riff will be on /riffs in a
         * moment" forever — because the verdict existed only as a line in
         * Vercel's log, which is not a place a product can speak from. No riff
         * is right. No *answer* was the bug.
         */
        const refusal = items[0]?.meta?.refusal

        check(
          typeof refusal === "string",
          "and the refusal is written on the row, not only into the log",
          typeof refusal === "string" ? refusal : "missing"
        )

        const outcome = await readShippedOutcome({
          userId: owner.id,
          sourceItemId: items[0]?.id ?? "",
        })

        check(
          outcome?.state === "refused",
          "so the button that asked for it can be told what happened",
          outcome?.state ?? "no row"
        )

        // Printed because this is the sentence a person reads, and a run of
        // this script is the only place anybody sees it before they ship it.
        console.log(`      · "${sayOutcome(outcome)}"`)
      }
    }

    console.log("\n── an unentitled account keeps the material and spends nothing ──")
    {
      await setTrial(new Date(Date.now() - 60 * 60 * 1000))

      const lapsed = JSON.stringify(shippedPayload("PR_verify_lapsed"))
      const response = await post(lapsed, sign(lapsed))
      const payload = (await response.json()) as { reason?: string }

      check(
        response.status === 200 && payload.reason === "unentitled",
        "an expired account answers 200, not 402",
        `${response.status} ${payload.reason}`
      )

      const items = await db
        .select({ id: sourceItem.id })
        .from(sourceItem)
        .where(
          and(
            eq(sourceItem.userId, owner.id),
            eq(sourceItem.externalId, "PR_verify_lapsed")
          )
        )

      check(items.length === 1, "and the merge is still stored")

      await setTrial(new Date(Date.now() + 60 * 60 * 1000))
    }

    console.log("\n── suspending pauses, and does not delete ──")
    {
      const lifecycle = (action: string) =>
        JSON.stringify({ action, installation: { id: INSTALLATION_ID } })

      const suspend = lifecycle("suspend")
      await post(suspend, sign(suspend), "installation")

      const [suspended] = await db
        .select({ id: sourceConnection.id, state: sourceConnection.state })
        .from(sourceConnection)
        .where(eq(sourceConnection.userId, owner.id))

      /**
       * The distinction this whole block exists for. Deleting on suspend would
       * mean `unsuspend` restores the installation on GitHub while Quincy has
       * forgotten it, and every later merge resolves to nobody.
       */
      check(
        suspended?.state === "paused",
        "a suspended installation is paused, not deleted",
        suspended?.state ?? "row gone"
      )

      const merged = JSON.stringify(shippedPayload("PR_verify_paused"))
      const whilePaused = await post(merged, sign(merged))
      const payload = (await whilePaused.json()) as { reason?: string }

      check(
        payload.reason === "paused",
        "and a merge arriving while paused is stored but not drafted",
        String(payload.reason)
      )

      const [stillPaused] = await db
        .select({ state: sourceConnection.state })
        .from(sourceConnection)
        .where(eq(sourceConnection.userId, owner.id))

      check(
        stillPaused?.state === "paused",
        "and the delivery does not silently lift the pause",
        stillPaused?.state
      )

      const unsuspend = lifecycle("unsuspend")
      await post(unsuspend, sign(unsuspend), "installation")

      const [resumed] = await db
        .select({ state: sourceConnection.state })
        .from(sourceConnection)
        .where(eq(sourceConnection.userId, owner.id))

      check(
        resumed?.state === "arriving",
        "unsuspending restores it to arriving, because material had arrived",
        resumed?.state
      )
    }

    console.log("\n── uninstalling removes the connection ──")
    {
      const body = JSON.stringify({
        action: "deleted",
        installation: { id: INSTALLATION_ID },
      })

      const response = await post(body, sign(body), "installation")
      check(response.status === 200, "the event is acknowledged")

      const rows = await db
        .select({ id: sourceConnection.id })
        .from(sourceConnection)
        .where(eq(sourceConnection.userId, owner.id))

      check(
        rows.length === 0,
        "and the row is gone, so /sources cannot claim a live connection",
        String(rows.length)
      )
    }
  } finally {
    await setTrial(originalTrialEndsAt ?? null)
    console.log("\n  restored the account's original trial end")
    await teardown()
  }
}

async function countShippedRiffs(userId: string): Promise<number> {
  const rows = await db
    .select({ id: riff.id })
    .from(riff)
    .where(and(eq(riff.userId, userId), eq(riff.sourceId, "github")))

  return rows.length
}

/**
 * Waits for the workflow to create a riff and finish it.
 *
 * Unlike the Circleback verifier, this cannot poll a known id — the route does
 * not create the riff, the workflow does, and only if the selection finds
 * something. So it polls for existence first and then for a terminal state,
 * which is the cost of `startShippedRiff`'s design and worth paying: the
 * alternative is a failed card for every merge that was not a post.
 */
async function waitForShippedRiff(userId: string) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const [row] = await db
      .select()
      .from(riff)
      .where(and(eq(riff.userId, userId), eq(riff.sourceId, "github")))
      .limit(1)

    if (row && row.state !== "working") return row
    await new Promise((resolve) => setTimeout(resolve, 3_000))
  }

  const [row] = await db
    .select()
    .from(riff)
    .where(and(eq(riff.userId, userId), eq(riff.sourceId, "github")))
    .limit(1)

  return row ?? null
}

/**
 * Deletes only what this run created.
 *
 * Riffs are found by source rather than by remembering ids, because the
 * workflow creates them and the script never learns some of them — and it is
 * bounded to the dev account, whose guard is asserted at the top of the file.
 * `riff_angle` cascades.
 */
async function teardown() {
  const [owner] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, ACCOUNT))
    .limit(1)

  if (!owner) return

  if (nodeIds.length > 0) {
    await db
      .delete(sourceItem)
      .where(
        and(
          eq(sourceItem.userId, owner.id),
          inArray(sourceItem.externalId, nodeIds)
        )
      )
  }

  const mine = await db
    .select({ id: riff.id, createdAt: riff.createdAt })
    .from(riff)
    .where(and(eq(riff.userId, owner.id), eq(riff.sourceId, "github")))

  const recent = mine
    .filter((r) => r.createdAt > new Date(Date.now() - 30 * 60_000))
    .map((r) => r.id)

  if (recent.length > 0) {
    await db.delete(riff).where(inArray(riff.id, recent))
  }

  await disconnectSource(owner.id, "github")

  console.log(
    `\nCleaned up: ${nodeIds.length} pull request(s), ${recent.length} riff(s).`
  )
}

main().then(
  () => {
    console.log(
      failures ? `\nFAILED — ${failures} check(s)` : "\nEverything holds."
    )
    process.exit(failures ? 1 : 0)
  },
  (error) => {
    console.error(error)
    process.exit(1)
  }
)

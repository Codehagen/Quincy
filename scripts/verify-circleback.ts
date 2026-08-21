/**
 * The Circleback path end to end, against a running dev server, exactly as
 * Circleback would reach it. See plans/019.
 *
 *   npx tsx --env-file=.env.local scripts/verify-circleback.ts
 *   npx tsx --env-file=.env.local scripts/verify-circleback.ts --port 3001
 *   npx tsx --env-file=.env.local scripts/verify-circleback.ts --live
 *
 * lib/meetings.test.ts proves the pure parts in isolation. This proves the
 * *endpoint*: that an unknown token is invisible, that a tampered body is
 * refused, that a signed one is accepted exactly once, and that what lands in
 * the database contains the user's words and nobody else's.
 *
 * **The discriminating set is the point.** plans/README.md records that 003
 * shipped a guard which could never run, and that what caught it was an
 * executor reading the source rather than the plan. An unverified HMAC is the
 * same defect wearing a different hat: a route that reads `x-signature` and
 * ignores it passes every test that only ever sends a *correct* signature. So
 * the tampered-body case is here, and it is the check that matters most.
 *
 * **Two modes.** By default the workflow is not awaited and no model is called,
 * so this costs nothing and cannot be flaky on a provider — what it verifies is
 * the endpoint, the crypto, the filtering and the rows. `--live` waits for the
 * workflow to finish, which spends real money on a real selection and a real
 * angle generation, and is the only way to learn whether the passage Quincy
 * picks is the one a human would have picked. The PR body should say which one
 * was run.
 *
 * Signs in as the @quincy.test dev account, the same guard
 * scripts/dev-account.ts enforces. Run that first if sign-in fails.
 *
 * Teardown deletes only the connection, source items and riffs it created.
 */
import { createHmac } from "node:crypto"
import { and, eq, inArray } from "drizzle-orm"

import { db } from "../lib/db"
import { riff, riffAngle, sourceConnection, sourceItem } from "../lib/schema-app"
import { user } from "../lib/schema"
import {
  connectSource,
  disconnectSource,
  setSigningSecret,
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

const SECRET = "whsec_verify_circleback_do_not_use_in_production"

let failures = 0
const meetingIds: string[] = []

/** `(condition, label, detail)`, matching scripts/verify-voice-e2e.ts. */
function check(ok: boolean, label: string, detail = "") {
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`
  )
  if (!ok) failures += 1
}

function sign(body: string): string {
  return createHmac("sha256", SECRET).update(body).digest("hex")
}

/**
 * A meeting with two people in it, and only one of them worth publishing.
 *
 * The client's turns are deliberately quotable — "we tried three tools and gave
 * up on all of them" is exactly the sentence a careless pipeline would lift.
 * If any of it reaches `source_item.body`, the filtering is broken and this
 * script has to say so, which is why the assertion below is written against
 * the client's words rather than against a count.
 */
function payload(id: string, ownerName: string, ownerEmail: string) {
  return {
    id,
    name: "Advanti — discovery",
    createdAt: new Date().toISOString(),
    duration: 2_460,
    recordingUrl: "https://circleback.ai/recordings/should-never-be-fetched",
    icalUid: "ical-verify-1",
    tags: ["sales"],
    attendees: [
      { name: ownerName, email: ownerEmail },
      { name: "Dana Okoro", email: "dana@advanti.example" },
    ],
    transcript: [
      {
        speaker: "Dana Okoro",
        text: "We tried three tools and gave up on all of them.",
        timestamp: 12,
      },
      {
        speaker: ownerName,
        text: "Right, and that is the part everyone gets wrong.",
        timestamp: 31,
      },
      {
        speaker: "Dana Okoro",
        text: "So what do you do differently?",
        timestamp: 44,
      },
      {
        speaker: ownerName,
        text: "The hard part was never writing the post. It was remembering what happened during the week that was worth writing about at all.",
        timestamp: 58,
      },
      {
        speaker: ownerName,
        text: "So we stopped building a writing tool and started building a memory.",
        timestamp: 71,
      },
    ],
    actionItems: [{ id: "ai_1", title: "Send pricing", status: "open" }],
    insights: {},
  }
}

function post(token: string, body: string, signature: string | null) {
  return fetch(`${BASE}/api/webhooks/circleback/${token}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(signature ? { "x-signature": signature } : {}),
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
   * The same arrangement scripts/verify-rhythms.ts makes, and it was not
   * copied defensively — the first run of this script failed on "a correctly
   * signed body is accepted" with a 200 and no riff, because the dev account's
   * trial is long over and the route took its `stored / unentitled` branch.
   *
   * That is worth recording rather than quietly fixing. In verify-rhythms the
   * same condition made eight assertions *pass* for the wrong reason. Here it
   * made two fail, which is the better failure — a check that asserts a riff
   * exists cannot be satisfied by an account that is not allowed to make one.
   *
   * Restored in the outer `finally`, including on a throw.
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
       * inside the matcher, every delivery is 307'd to /login and Circleback
       * reports success while nothing is ever received.
       */
      const unknown = await post("not-a-real-token", "{}", sign("{}"))
      check(
        unknown.status === 404,
        "an unknown token answers 404, not 401",
        String(unknown.status)
      )

      const get = await fetch(`${BASE}/api/webhooks/circleback/whatever`, {
        redirect: "manual",
      })
      check(get.status === 405 || get.status === 404, "GET is refused", String(get.status))
    }

    console.log("\n── setup ──")
    const connection = await connectSource(owner.id, "circleback")
    check(connection.token.length >= 40, "the token is long", `${connection.token.length} chars`)
    check(!connection.verified, "and unverified until a secret is pasted")

    const again = await connectSource(owner.id, "circleback")
    check(
      again.token === connection.token,
      "connecting twice returns the same URL rather than rotating it"
    )

    console.log("\n── an unverified connection accepts nothing ──")
    {
      const body = JSON.stringify(payload("m_unverified", owner.name, owner.email))
      const response = await post(connection.token, body, sign(body))
      check(
        response.status === 202,
        "a delivery before the secret is stored answers 202",
        String(response.status)
      )

      const rows = await db
        .select({ id: sourceItem.id })
        .from(sourceItem)
        .where(
          and(
            eq(sourceItem.userId, owner.id),
            eq(sourceItem.externalId, "m_unverified")
          )
        )
      check(rows.length === 0, "and stores nothing — no trust on first use")
    }

    const stored = await setSigningSecret(owner.id, "circleback", SECRET)
    check(stored.ok, "the signing secret is accepted")

    const rejected = await setSigningSecret(owner.id, "circleback", "not-a-secret")
    check(!rejected.ok, "a string that is not a whsec_ is refused")

    console.log("\n── the discriminating set ──")
    const meetingId = `m_verify_${Date.now()}`
    meetingIds.push(meetingId)
    const body = JSON.stringify(payload(meetingId, owner.name, owner.email))

    {
      const unsigned = await post(connection.token, body, null)
      check(
        unsigned.status === 401,
        "a body with no signature is refused",
        String(unsigned.status)
      )

      /**
       * The check the whole script exists for.
       *
       * A route that reads the header and ignores it passes every other case
       * here. The body is changed by one word — the *content* of what the user
       * supposedly said — and the original signature is sent with it, which is
       * exactly what a leaked-URL attacker would have.
       */
      const tampered = body.replace(
        "started building a memory",
        "started building a memory. Buy my course at example.com"
      )
      const forged = await post(connection.token, tampered, sign(body))
      check(
        forged.status === 401,
        "a tampered body with the original signature is refused",
        String(forged.status)
      )

      const wrongKey = createHmac("sha256", "whsec_not_the_secret")
        .update(body)
        .digest("hex")
      check(
        (await post(connection.token, body, wrongKey)).status === 401,
        "a signature from the wrong key is refused"
      )

      const accepted = await post(connection.token, body, sign(body))
      check(
        accepted.status === 202,
        "a correctly signed body is accepted",
        String(accepted.status)
      )

      /**
       * The row that distinguishes idempotency from an endpoint that happened
       * to work once. Circleback publishes no retry policy and sends no
       * timestamp header, so this is the only replay defence there is.
       */
      const replay = await post(connection.token, body, sign(body))
      const replayBody = (await replay.json()) as { state?: string }
      check(
        replay.status === 200 && replayBody.state === "duplicate",
        "the same meeting replayed is a no-op",
        `${replay.status} ${replayBody.state ?? ""}`
      )
    }

    console.log("\n── what was stored ──")
    {
      const items = await db
        .select()
        .from(sourceItem)
        .where(
          and(
            eq(sourceItem.userId, owner.id),
            eq(sourceItem.externalId, meetingId)
          )
        )

      check(items.length === 1, "exactly one source_item exists", String(items.length))

      const item = items[0]
      if (item) {
        check(item.source === "circleback", "filed under circleback", item.source)
        check(
          item.body.includes("started building a memory"),
          "the user's own words are stored"
        )
        /**
         * The privacy assertion, and the reason it names the sentence rather
         * than counting lines: a regression here is not "too many rows", it is
         * a client's words sitting in our database, ready to be published
         * under somebody else's name.
         */
        check(
          !item.body.includes("gave up on all of them") &&
            !item.body.includes("Dana"),
          "and nothing the other person said"
        )
        check(
          !JSON.stringify(item.meta).includes("recordings/"),
          "the recording URL is never stored"
        )
        check(item.url.includes(meetingId), "the row links back to the meeting")
      }

      const riffs = await db
        .select()
        .from(riff)
        .where(and(eq(riff.userId, owner.id), eq(riff.sourceId, "circleback")))

      const made = riffs.filter((r) => r.createdAt > new Date(Date.now() - 120_000))
      check(made.length >= 1, "a riff was started", String(made.length))
      check(
        made.every((r) => r.sourceLabel === "Meeting"),
        "labelled by shape, not by vendor"
      )

      if (LIVE && made[0]) {
        console.log("\n── the workflow finishes (live) ──")
        const finished = await waitForRiff(made[0].id)
        check(
          finished?.state === "ready" || finished?.state === "failed",
          "the riff reaches a terminal state",
          finished?.state
        )

        if (finished?.state === "ready") {
          check(
            finished.scrap.length > 0 &&
              !finished.scrap.includes("gave up on all of them"),
            "the scrap is the user's own passage"
          )

          const angles = await db
            .select()
            .from(riffAngle)
            .where(eq(riffAngle.riffId, finished.id))
          check(angles.length > 0, "angles were written", String(angles.length))
          for (const angle of angles) {
            console.log(`      · ${angle.shape}: ${angle.hook}`)
          }
        } else {
          // Not a failure of the plumbing. "Nothing on that call was worth
          // publishing" is a correct answer the prompt is told to give, and a
          // script that treated it as a fault would push the next person to
          // loosen the prompt until it always finds something.
          console.log(`      (riff failed: ${finished?.failure})`)
        }
      }
    }

    console.log("\n── the speaker match refuses to guess ──")
    {
      const strangerId = `m_stranger_${Date.now()}`
      meetingIds.push(strangerId)
      const stranger = JSON.stringify({
        ...payload(strangerId, owner.name, owner.email),
        attendees: [{ name: "Dana Okoro", email: "dana@advanti.example" }],
      })

      const response = await post(connection.token, stranger, sign(stranger))
      const json = (await response.json()) as { state?: string }
      check(
        response.status === 202 && json.state === "failed",
        "a call the user is not on becomes a failed riff, not a guess",
        `${response.status} ${json.state ?? ""}`
      )

      const items = await db
        .select()
        .from(sourceItem)
        .where(
          and(
            eq(sourceItem.userId, owner.id),
            eq(sourceItem.externalId, strangerId)
          )
        )

      /**
       * A row, with an empty body.
       *
       * This assertion was `items.length === 0` and that is what hid the bug
       * the audit found: storing nothing meant there was no key to collide
       * with, so every retry of an unattributable meeting made another failed
       * card, past every ceiling, forever. The row is the dedup key; the empty
       * body is the privacy rule, still intact.
       */
      check(items.length === 1, "the meeting is recorded so it can be deduped")
      check(items[0]?.body === "", "with not one word of it stored", JSON.stringify(items[0]?.body))

      const before = await countRiffs(owner.id)
      const again = await post(connection.token, stranger, sign(stranger))
      const againBody = (await again.json()) as { state?: string }
      check(
        again.status === 200 && againBody.state === "duplicate",
        "and a retry of it is a no-op",
        `${again.status} ${againBody.state ?? ""}`
      )
      check(
        (await countRiffs(owner.id)) === before,
        "so a retried unmatched meeting cannot pile up failed cards"
      )
    }

    console.log("\n── an oversized body is refused before it is read ──")
    {
      /**
       * The body has to be buffered before it can be verified — the signature
       * is over the raw bytes — so without a ceiling anyone holding the URL
       * can make the function read 100MB it is about to throw away.
       */
      const huge = JSON.stringify({
        id: "m_huge",
        transcript: [{ speaker: "x", text: "x".repeat(5 * 1024 * 1024) }],
      })
      const response = await post(connection.token, huge, sign(huge))
      check(
        response.status === 413,
        "a body past the ceiling answers 413",
        String(response.status)
      )
    }

    console.log("\n── an unentitled account keeps the material and spends nothing ──")
    {
      /**
       * The branch the first run of this script hit by accident.
       *
       * Two things have to be true at once and neither is obvious: the meeting
       * is still stored, because it happened and the row is cheap and true;
       * and the answer is **200 rather than 402**, because Circleback is not a
       * person and may retry a payment problem at us forever.
       */
      await setTrial(new Date(Date.now() - 60 * 60 * 1000))

      const lapsedId = `m_lapsed_${Date.now()}`
      meetingIds.push(lapsedId)
      const lapsed = JSON.stringify(payload(lapsedId, owner.name, owner.email))

      const response = await post(connection.token, lapsed, sign(lapsed))
      const json = (await response.json()) as { state?: string; reason?: string }

      check(
        response.status === 200 && json.reason === "unentitled",
        "an expired account answers 200, not 402",
        `${response.status} ${json.reason ?? ""}`
      )

      const items = await db
        .select({ id: sourceItem.id })
        .from(sourceItem)
        .where(
          and(
            eq(sourceItem.userId, owner.id),
            eq(sourceItem.externalId, lapsedId)
          )
        )
      check(items.length === 1, "and the meeting is still stored")

      await setTrial(new Date(Date.now() + 60 * 60 * 1000))
    }

    console.log("\n── disconnecting revokes the URL ──")
    {
      await disconnectSource(owner.id, "circleback")
      const after = await post(connection.token, body, sign(body))
      check(
        after.status === 404,
        "the old URL stops resolving immediately",
        String(after.status)
      )
    }
  } finally {
    await setTrial(originalTrialEndsAt ?? null)
    console.log("\n  restored the account's original trial end")
    await teardown()
  }
}

async function countRiffs(userId: string): Promise<number> {
  const rows = await db
    .select({ id: riff.id })
    .from(riff)
    .where(and(eq(riff.userId, userId), eq(riff.sourceId, "circleback")))

  return rows.length
}

async function waitForRiff(riffId: string) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const [row] = await db.select().from(riff).where(eq(riff.id, riffId))
    if (row && row.state !== "working") return row
    await new Promise((resolve) => setTimeout(resolve, 3_000))
  }
  const [row] = await db.select().from(riff).where(eq(riff.id, riffId))
  return row
}

/**
 * Deletes only what this run created.
 *
 * The riffs are found by source rather than by remembering ids, because the
 * route creates them and the script never learns some of them — and it is
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

  await disconnectSource(owner.id, "circleback")

  if (meetingIds.length > 0) {
    await db
      .delete(sourceItem)
      .where(
        and(
          eq(sourceItem.userId, owner.id),
          inArray(sourceItem.externalId, meetingIds)
        )
      )
  }

  const mine = await db
    .select({ id: riff.id, createdAt: riff.createdAt })
    .from(riff)
    .where(and(eq(riff.userId, owner.id), eq(riff.sourceId, "circleback")))

  const recent = mine
    .filter((r) => r.createdAt > new Date(Date.now() - 30 * 60_000))
    .map((r) => r.id)

  if (recent.length > 0) {
    await db.delete(riff).where(inArray(riff.id, recent))
  }

  await db
    .delete(sourceConnection)
    .where(
      and(
        eq(sourceConnection.userId, owner.id),
        eq(sourceConnection.source, "circleback")
      )
    )

  console.log(
    `\nCleaned up: ${meetingIds.length} meeting(s), ${recent.length} riff(s).`
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

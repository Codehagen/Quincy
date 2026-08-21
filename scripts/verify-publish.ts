/**
 * Exercises the guards in lib/publish.ts — the checks that run *before* a
 * request is made — without posting anything anywhere.
 * Run with: npx tsx --env-file=.env.local scripts/verify-publish.ts
 *
 * What it is for: every assertion here is a case where `publish` must refuse
 * and return, and each one costs something real if it does not.
 *
 *   1. **Money.** X bills per request including the ones it rejects. An
 *      over-length post caught here costs nothing; the same post caught by X
 *      costs $0.015 to be told no.
 *   2. **Consent.** A revoked connection must never reach the network. This is
 *      the property the whole channel module exists to hold, and the publish
 *      path is where breaking it would actually publish something.
 *   3. **Honesty.** A refusal has to say which of six things went wrong, or
 *      the UI cannot tell "reconnect LinkedIn" from "this is 40 characters too
 *      long".
 *
 * The network paths — X's 280 rejection, LinkedIn's /rest/posts versus
 * /v2/ugcPosts — are NOT covered here. They need a real token and a real
 * account, and settling them is the by-hand step in plans/005 Phase 4.
 *
 * Teardown deletes only what it created.
 */
import { eq } from "drizzle-orm"

import { saveConnection, type ChannelProfile } from "../lib/channels"
import { db } from "../lib/db"
import { publish } from "../lib/publish"
import { channelConnection } from "../lib/schema-app"
import { user } from "../lib/schema"

function check(label: string, ok: boolean, detail = "") {
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`
  )
  if (!ok) process.exitCode = 1
}

/** Guarded for the same reason the other channel scripts are. */
const ACCOUNT = process.env.DEV_ACCOUNT_EMAIL ?? "dev@quincy.test"

if (!ACCOUNT.endsWith("@quincy.test")) {
  throw new Error(
    `Refusing to touch ${ACCOUNT} — this script writes channel connections ` +
      "and only operates on @quincy.test accounts."
  )
}

const PROFILE: ChannelProfile = {
  externalId: "publish-external-1",
  handle: "@publishverify",
  displayName: "Publish Verify",
  avatarUrl: null,
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

  console.log(`Using user ${owner.email}`)

  const reset = () =>
    db.delete(channelConnection).where(eq(channelConnection.userId, owner.id))

  await reset()

  console.log("\n=== nothing to post is not an error worth a request ===")
  let result = await publish({ userId: owner.id, channel: "x", text: "   " })
  check(
    "empty text refuses",
    !result.ok && result.reason === "empty",
    result.ok ? "published" : result.reason
  )

  console.log("\n=== an unconnected channel says so plainly ===")
  result = await publish({ userId: owner.id, channel: "x", text: "hei" })
  check(
    "reports not-connected",
    !result.ok && result.reason === "not-connected",
    result.ok ? "published" : result.reason
  )

  console.log("\n=== over-length is caught before X can bill for it ===")
  // 281 plain characters. Never reaches the network, so this assertion costs
  // nothing to run — which is the point of it.
  await saveConnection({
    userId: owner.id,
    channel: "x",
    profile: PROFILE,
    tokens: {
      accessToken: "publish-verify-token",
      refreshToken: null,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      scope: "tweet.write",
    },
  })

  result = await publish({
    userId: owner.id,
    channel: "x",
    text: "a".repeat(281),
  })
  check(
    "281 characters refuses",
    !result.ok && result.reason === "too-long",
    result.ok ? "published" : result.reason
  )
  check(
    "and says by how much",
    !result.ok && result.message.includes("1 over"),
    result.ok ? "" : result.message
  )

  console.log("\n=== emoji are counted the way X counts them ===")
  // 280 Norwegian flags is 280 characters to X and 1120 to String.length.
  // Refusing this would be refusing a post that is exactly at the limit.
  const flags = "🇳🇴".repeat(280)
  check("String.length disagrees", flags.length === 1120)
  result = await publish({ userId: owner.id, channel: "x", text: flags })
  check(
    "not rejected as too long",
    !result.ok && result.reason !== "too-long",
    result.ok ? "published" : result.reason
  )

  console.log("\n=== a revoked connection never reaches the network ===")
  await db
    .update(channelConnection)
    .set({ state: "revoked" })
    .where(eq(channelConnection.userId, owner.id))

  result = await publish({ userId: owner.id, channel: "x", text: "hei" })
  check(
    "refuses with revoked",
    !result.ok && result.reason === "revoked",
    result.ok ? "published" : result.reason
  )

  console.log("\n=== an aged-out token asks for a reconnect ===")
  await saveConnection({
    userId: owner.id,
    channel: "linkedin",
    profile: { ...PROFILE, externalId: "publish-linkedin-1", handle: null },
    tokens: {
      accessToken: "publish-verify-token",
      refreshToken: null,
      expiresAt: new Date(Date.now() - 1000),
      scope: "w_member_social",
    },
  })

  result = await publish({
    userId: owner.id,
    channel: "linkedin",
    text: "hei",
  })
  check(
    "refuses with needs_reauth",
    !result.ok && result.reason === "needs_reauth",
    result.ok ? "published" : result.reason
  )

  console.log("\n=== the LinkedIn limit is 3000, not 280 ===")
  // Same text, different channel, different verdict. A shared limit would
  // silently truncate LinkedIn posts to a tenth of what the platform allows.
  await saveConnection({
    userId: owner.id,
    channel: "linkedin",
    profile: { ...PROFILE, externalId: "publish-linkedin-1", handle: null },
    tokens: {
      accessToken: "publish-verify-token",
      refreshToken: null,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      scope: "w_member_social",
    },
  })

  const long = "a".repeat(1000)
  result = await publish({ userId: owner.id, channel: "linkedin", text: long })
  check(
    "1000 characters is not too long for LinkedIn",
    !result.ok && result.reason !== "too-long",
    result.ok ? "published" : result.reason
  )

  console.log("\n=== teardown ===")
  await reset()
  const left = await db
    .select()
    .from(channelConnection)
    .where(eq(channelConnection.userId, owner.id))
  check("connections deleted", left.length === 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

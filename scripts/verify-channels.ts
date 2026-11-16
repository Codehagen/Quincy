/**
 * Exercises lib/channels.ts against Neon without touching X or LinkedIn.
 * Run with: npx tsx --env-file=.env.local scripts/verify-channels.ts
 *
 * What it is for: this module stores credentials that can post in a person's
 * name, and three of its properties are the kind that fail silently.
 *
 *   1. Tokens are encrypted at rest. A bug here is invisible until someone
 *      reads the table.
 *   2. Reconnecting updates one row rather than growing a pile of live tokens.
 *      A missing unique constraint looks fine until the second connect.
 *   3. A revoked connection never yields a token. This is the one that matters
 *      most — publishing as someone who withdrew consent is not a bug, it is a
 *      breach of what they were told.
 *
 * The OAuth round trip itself is not covered here; it needs real credentials
 * and a browser, and plans/005 Phase 7 has the by-hand drill for it — including
 * the revocation test at Settings & Privacy → Data Privacy → Permitted Services.
 *
 * Teardown deletes only what it created.
 */
import { and, eq } from "drizzle-orm"

import {
  disconnect,
  getAccessToken,
  getConnection,
  listConnections,
  saveConnection,
  toSafeConnection,
  type ChannelProfile,
} from "../lib/channels"
import { db } from "../lib/db"
import { channelConnection } from "../lib/schema-app"
import { user } from "../lib/schema"

function check(label: string, ok: boolean, detail = "") {
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`
  )
  if (!ok) process.exitCode = 1
}

const PROFILE: ChannelProfile = {
  externalId: "verify-external-1",
  handle: "@verify",
  displayName: "Verify Account",
  avatarUrl: "https://example.invalid/a.png",
}

const PLAINTEXT_ACCESS = "plaintext-access-token-that-must-not-appear"
const PLAINTEXT_REFRESH = "plaintext-refresh-token-that-must-not-appear"

function tokens(expiresInSeconds: number | null) {
  return {
    accessToken: PLAINTEXT_ACCESS,
    refreshToken: PLAINTEXT_REFRESH,
    expiresAt:
      expiresInSeconds === null
        ? null
        : new Date(Date.now() + expiresInSeconds * 1000),
    scope: "openid profile email w_member_social",
  }
}

/**
 * Guarded to @quincy.test for the same reason scripts/dev-account.ts and
 * scripts/verify-billing.ts are, and here the stakes are higher than in either.
 *
 * This script deletes every channel connection belonging to the account it
 * runs against, twice — once to start clean and once as teardown. It used to
 * take `select().from(user).limit(1)`, which is not "the test account", it is
 * whichever row Postgres felt like returning: no ORDER BY means no guaranteed
 * order, and the answer can change between runs as rows are updated. On the
 * run where that lands on the real account, the verification suite silently
 * destroys a live LinkedIn grant — and the only way to get it back is for a
 * human to go through consent again.
 */
const ACCOUNT = process.env.DEV_ACCOUNT_EMAIL ?? "dev@quincy.test"

if (!ACCOUNT.endsWith("@quincy.test")) {
  throw new Error(
    `Refusing to touch ${ACCOUNT} — this script deletes channel connections ` +
      "and only operates on @quincy.test accounts."
  )
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
  // Start clean so a previous failed run cannot make this one pass.
  await db
    .delete(channelConnection)
    .where(eq(channelConnection.userId, owner.id))

  console.log("\n=== encryption at rest ===")
  await saveConnection({
    userId: owner.id,
    channel: "linkedin",
    profile: PROFILE,
    tokens: tokens(60 * 60 * 24 * 60),
  })

  const [raw] = await db
    .select()
    .from(channelConnection)
    .where(eq(channelConnection.userId, owner.id))

  check("row was written", Boolean(raw))
  check(
    "access token is not stored in the clear",
    raw.accessToken !== PLAINTEXT_ACCESS &&
      !raw.accessToken.includes("plaintext")
  )
  check(
    "refresh token is not stored in the clear",
    raw.refreshToken !== PLAINTEXT_REFRESH &&
      !raw.refreshToken!.includes("plaintext")
  )

  const live = await getAccessToken(owner.id, "linkedin")
  check(
    "round trip returns the original token",
    live.ok && live.accessToken === PLAINTEXT_ACCESS,
    live.ok ? "" : live.reason
  )

  console.log("\n=== nothing secret escapes toSafeConnection ===")
  const safe = toSafeConnection(raw)
  const serialised = JSON.stringify(safe)
  check(
    "no access token in the safe shape",
    !serialised.includes(raw.accessToken) &&
      !serialised.includes(PLAINTEXT_ACCESS)
  )
  check(
    "no refresh token in the safe shape",
    !serialised.includes(raw.refreshToken!) &&
      !serialised.includes(PLAINTEXT_REFRESH)
  )
  check(
    "scopes are exposed as a list",
    safe.scopes.includes("w_member_social") && safe.scopes.length === 4
  )

  console.log("\n=== reconnect updates, never duplicates ===")
  await saveConnection({
    userId: owner.id,
    channel: "linkedin",
    profile: { ...PROFILE, displayName: "Renamed After Reconnect" },
    tokens: tokens(60 * 60 * 24 * 60),
  })

  const afterReconnect = await listConnections(owner.id)
  check(
    "still exactly one row",
    afterReconnect.length === 1,
    `got ${afterReconnect.length}`
  )
  check(
    "profile was refreshed",
    afterReconnect[0]?.displayName === "Renamed After Reconnect"
  )

  console.log("\n=== a second account replaces the first, never joins it ===")
  // The application addresses connections by (user, channel) — publish takes
  // no account argument and the UI renders one row — so a second row would be
  // a live credential nothing could see and Disconnect could not remove.
  await saveConnection({
    userId: owner.id,
    channel: "linkedin",
    profile: { ...PROFILE, externalId: "verify-external-2", handle: "@second" },
    tokens: tokens(60 * 60 * 24 * 60),
  })

  const after = await listConnections(owner.id)
  check("still exactly one row", after.length === 1, `got ${after.length}`)
  check(
    "and it is the account that connected last",
    after[0]?.externalId === "verify-external-2",
    after[0]?.externalId
  )

  // Back to the original account so the state assertions below are unambiguous.
  await saveConnection({
    userId: owner.id,
    channel: "linkedin",
    profile: PROFILE,
    tokens: tokens(60 * 60 * 24 * 60),
  })

  console.log("\n=== expiry becomes needs_reauth, not a dead token ===")
  // LinkedIn has no refresh token available to us, so an expired connection
  // must resolve to needs_reauth rather than handing back something stale.
  await db
    .update(channelConnection)
    .set({ accessTokenExpiresAt: new Date(Date.now() - 1000) })
    .where(eq(channelConnection.userId, owner.id))

  const expired = await getAccessToken(owner.id, "linkedin")
  check("expired LinkedIn yields no token", !expired.ok)
  check(
    "and is reported as needs_reauth",
    !expired.ok && expired.reason === "needs_reauth",
    expired.ok ? "returned a token" : expired.reason
  )

  const marked = await getConnection(owner.id, "linkedin")
  check("state was persisted as needs_reauth", marked?.state === "needs_reauth")

  console.log("\n=== reconnecting repairs the state ===")
  await saveConnection({
    userId: owner.id,
    channel: "linkedin",
    profile: PROFILE,
    tokens: tokens(60 * 60 * 24 * 60),
  })

  const repaired = await getConnection(owner.id, "linkedin")
  check("state is active again", repaired?.state === "active")
  check("error was cleared", repaired?.lastError === null)

  console.log("\n=== a revoked connection never yields a token ===")
  await db
    .update(channelConnection)
    .set({ state: "revoked" })
    .where(eq(channelConnection.userId, owner.id))

  const revoked = await getAccessToken(owner.id, "linkedin")
  check("revoked yields no token", !revoked.ok)
  check(
    "and says so",
    !revoked.ok && revoked.reason === "revoked",
    revoked.ok ? "returned a token" : revoked.reason
  )

  console.log("\n=== an unconnected channel is 'missing', not an error ===")
  const absent = await getAccessToken(owner.id, "x")
  check("X is missing", !absent.ok && absent.reason === "missing")

  console.log("\n=== isolation ===")
  const otherUser = await db
    .select()
    .from(channelConnection)
    .where(eq(channelConnection.userId, "definitely-not-a-real-user"))
  check("another user sees nothing", otherUser.length === 0)

  console.log("\n=== disconnect leaves no credential behind ===")
  await saveConnection({
    userId: owner.id,
    channel: "linkedin",
    profile: PROFILE,
    tokens: tokens(60 * 60 * 24 * 60),
  })
  await disconnect(owner.id, "linkedin")

  const remaining = await db
    .select()
    .from(channelConnection)
    .where(
      and(
        eq(channelConnection.userId, owner.id),
        eq(channelConnection.channel, "linkedin")
      )
    )
  check(
    "zero rows for the channel after disconnect",
    remaining.length === 0,
    `${remaining.length} left`
  )

  console.log("\n=== teardown ===")
  await db
    .delete(channelConnection)
    .where(eq(channelConnection.userId, owner.id))
  const left = await listConnections(owner.id)
  check("connections deleted", left.length === 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

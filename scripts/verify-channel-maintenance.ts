/**
 * Exercises lib/channels-maintenance.ts — the daily sweep — without touching
 * LinkedIn, X, or Resend.
 * Run with:
 *   npx tsx --env-file=.env.local scripts/verify-channel-maintenance.ts
 *
 * What it is for: this sweep is the only thing standing between "someone
 * removed Quincy in LinkedIn's Permitted Services" and "Quincy keeps posting
 * as them". Its decisions are all judgment calls about ambiguous evidence, and
 * every one of them fails silently in production:
 *
 *   1. A 401 while the token should still be valid means revoked. A 503 means
 *      LinkedIn is having a bad morning and nothing should be written. Getting
 *      that backwards disconnects every user at once during an outage.
 *   2. The reconnect notice sends once per cycle. A sweep that re-sends daily
 *      is how a helpful nudge turns into the reason someone reports Quincy as
 *      spam.
 *   3. A revoked row is never re-probed and never mailed.
 *
 * The probe and the mail sender are injected, so all of this is decided
 * offline. What is NOT covered here is whether LinkedIn actually answers 401
 * on a withdrawn grant — that is the by-hand drill in plans/005 Phase 7, at
 * Settings & Privacy → Data Privacy → Permitted Services.
 *
 * Teardown deletes only what it created.
 */
import { eq } from "drizzle-orm"

import {
  isChannelEnabled,
  saveConnection,
  type ChannelProfile,
  type LivenessResult,
} from "../lib/channels"
import {
  runChannelMaintenance,
  type MaintenanceDeps,
} from "../lib/channels-maintenance"
import { db } from "../lib/db"
import { channelConnection } from "../lib/schema-app"
import { user } from "../lib/schema"

function check(label: string, ok: boolean, detail = "") {
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`
  )
  if (!ok) process.exitCode = 1
}

/**
 * Guarded to @quincy.test, and the sweep is additionally scoped to this one
 * user id. Both matter: the guard stops the script from choosing a real
 * account, and the scope stops `runChannelMaintenance` from probing every
 * other row in the table on its way past — including a live LinkedIn grant
 * that would be marked `revoked` by a stubbed 401.
 */
const ACCOUNT = process.env.DEV_ACCOUNT_EMAIL ?? "dev@quincy.test"

if (!ACCOUNT.endsWith("@quincy.test")) {
  throw new Error(
    `Refusing to touch ${ACCOUNT} — this script writes channel connections ` +
      "and only operates on @quincy.test accounts."
  )
}

const PROFILE: ChannelProfile = {
  externalId: "maintenance-external-1",
  handle: null,
  displayName: "Maintenance Verify",
  avatarUrl: null,
}

const DAY = 24 * 60 * 60 * 1000

function tokens(expiresInMs: number | null) {
  return {
    accessToken: "maintenance-access-token",
    refreshToken: null,
    expiresAt: expiresInMs === null ? null : new Date(Date.now() + expiresInMs),
    scope: "openid profile email w_member_social",
  }
}

/** Stubs. Each records what it was asked so the assertions can read it back. */
function deps(liveness: LivenessResult, mailFails = false) {
  const sent: string[] = []
  let probes = 0

  const value: MaintenanceDeps = {
    probe: async () => {
      probes += 1
      return liveness
    },
    send: async ({ to }) => {
      sent.push(to)
      return mailFails
        ? { ok: false, reason: "rejected", message: "stubbed failure" }
        : { ok: true, id: "stub-mail-id" }
    },
  }

  return {
    value,
    sent,
    get probes() {
      return probes
    },
  }
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

  const seed = (
    expiresInMs: number | null,
    channel: "linkedin" | "x" = "linkedin"
  ) =>
    saveConnection({
      userId: owner.id,
      channel,
      profile: PROFILE,
      tokens: tokens(expiresInMs),
    })

  const state = async () => {
    const [row] = await db
      .select()
      .from(channelConnection)
      .where(eq(channelConnection.userId, owner.id))
      .limit(1)
    return row
  }

  const sweep = (d: MaintenanceDeps) =>
    runChannelMaintenance({ userId: owner.id, deps: d })

  await reset()

  console.log("\n=== a healthy connection is left alone ===")
  await seed(50 * DAY)
  let d = deps({ live: true })
  let run = await sweep(d.value)
  check(
    "counted as active",
    run.outcomes.active === 1,
    JSON.stringify(run.outcomes)
  )
  check("state untouched", (await state()).state === "active")
  check("nobody was emailed", run.emailed === 0 && d.sent.length === 0)
  check("the platform was asked", d.probes === 1)

  console.log("\n=== an outage is not consent withdrawn ===")
  await reset()
  await seed(50 * DAY)
  d = deps({ live: "unknown", error: "503 Service Unavailable" })
  run = await sweep(d.value)
  check("counted as unreachable", run.outcomes.unreachable === 1)
  check(
    "state is still active — nothing was written",
    (await state()).state === "active"
  )
  check("no email on an outage", run.emailed === 0)

  console.log("\n=== rate limiting is not consent withdrawn either ===")
  // The 429 case specifically: probeLiveness must classify it as unknown, not
  // as a verdict about the credential. This asserts the real function, not a
  // stub, by checking how it maps a status it never sees in the happy path.
  await reset()
  await seed(50 * DAY)
  d = deps({ live: "unknown", error: "LinkedIn answered 429" })
  run = await sweep(d.value)
  check("429 leaves the row alone", (await state()).state === "active")

  console.log("\n=== approaching expiry warns once, ahead of time ===")
  await reset()
  await seed(5 * DAY)
  d = deps({ live: true })
  run = await sweep(d.value)
  check("counted as expiring", run.outcomes.expiring === 1)
  check("state became needs_reauth", (await state()).state === "needs_reauth")
  check("one email went out", run.emailed === 1 && d.sent.length === 1)
  check("addressed to the account owner", d.sent[0] === owner.email)

  const noticed = await state()
  check("the notice was recorded", noticed.reauthNoticeSentAt !== null)

  console.log("\n=== and does not warn again tomorrow ===")
  d = deps({ live: true })
  run = await sweep(d.value)
  check("still expiring", run.outcomes.expiring === 1)
  check("no second email", run.emailed === 0 && d.sent.length === 0)

  console.log("\n=== a token past its expiry asks for a reconnect ===")
  await reset()
  await seed(-1000)
  d = deps({ live: true })
  run = await sweep(d.value)
  check(
    "counted as expired",
    run.outcomes.expired === 1,
    JSON.stringify(run.outcomes)
  )
  check("state became needs_reauth", (await state()).state === "needs_reauth")
  check("emailed once", run.emailed === 1)
  check(
    "the platform was never asked — no token to ask with",
    d.probes === 0,
    `${d.probes} probes`
  )

  console.log("\n=== a failed send does not consume the cycle's one notice ===")
  await reset()
  await seed(5 * DAY)
  d = deps({ live: true }, true)
  run = await sweep(d.value)
  check("send was attempted", d.sent.length === 1)
  check("but not counted as emailed", run.emailed === 0)
  check(
    "and not recorded, so tomorrow retries",
    (await state()).reauthNoticeSentAt === null
  )

  console.log("\n=== a rejected token on a live grant is revocation ===")
  await reset()
  await seed(50 * DAY)
  d = deps({ live: false, status: 401, body: "REVOKED_ACCESS_TOKEN" })
  run = await sweep(d.value)
  check("counted as revoked", run.outcomes.revoked === 1)

  const revoked = await state()
  check("state became revoked", revoked.state === "revoked")
  check("the reason was recorded", Boolean(revoked.lastError))
  check(
    "no email — they said no on purpose",
    run.emailed === 0 && d.sent.length === 0
  )

  console.log("\n=== a revoked row is never swept again ===")
  d = deps({ live: true })
  run = await sweep(d.value)
  check("not selected", run.checked === 0, `checked ${run.checked}`)
  check("and never probed", d.probes === 0)

  console.log("\n=== reconnecting clears the notice and arms the next one ===")
  await saveConnection({
    userId: owner.id,
    channel: "linkedin",
    profile: PROFILE,
    tokens: tokens(60 * DAY),
  })
  const repaired = await state()
  check("state is active again", repaired.state === "active")
  check("notice marker was cleared", repaired.reauthNoticeSentAt === null)

  console.log("\n=== an ambiguous rejection does not accuse anyone ===")
  // No recorded expiry, so a 401 cannot be told apart from a token that simply
  // ran out. needs_reauth asks them to reconnect; revoked would be a claim
  // about intent we cannot support.
  await reset()
  await seed(null)
  d = deps({ live: false, status: 401, body: "invalid token" })
  run = await sweep(d.value)
  check("counted as expired, not revoked", run.outcomes.expired === 1)
  check("state is needs_reauth", (await state()).state === "needs_reauth")

  console.log("\n=== X near expiry is not the user's errand ===")
  // X refreshes itself, so an approaching expiry must not manufacture a
  // reconnect email. Only channels we cannot refresh warn.
  //
  // X is refreshable, and this case is about what that means — so it needs X to
  // read as configured whether or not this machine has an X app. `config()`
  // reads these at call time. The values are never used: the probe is stubbed
  // and a token five days out is not stale, so nothing reaches the network.
  process.env.X_CLIENT_ID ??= "verify-not-a-real-id"
  process.env.X_CLIENT_SECRET ??= "verify-not-a-real-secret"
  check("X reads as configured for this case", isChannelEnabled("x"))
  await reset()
  await seed(5 * DAY, "x")
  d = deps({ live: true })
  run = await sweep(d.value)
  check(
    "counted as active",
    run.outcomes.active === 1,
    JSON.stringify(run.outcomes)
  )
  check("state untouched", (await state()).state === "active")
  check("no email", run.emailed === 0)

  console.log("\n=== an unconfigured channel is skipped, not blamed ===")
  // The environment is set here rather than read, so this runs identically on
  // a machine that has X credentials and one that does not. `config()` reads
  // these at call time, so deleting them is what makes isChannelEnabled false.
  const savedId = process.env.X_CLIENT_ID
  const savedSecret = process.env.X_CLIENT_SECRET
  delete process.env.X_CLIENT_ID
  delete process.env.X_CLIENT_SECRET
  check("X reads as unconfigured for this case", !isChannelEnabled("x"))

  await reset()
  await seed(50 * DAY, "x")
  d = deps({ live: true })
  run = await sweep(d.value)
  check(
    "counted as unconfigured",
    run.outcomes.unconfigured === 1,
    JSON.stringify(run.outcomes)
  )
  check("the platform was never asked", d.probes === 0, `${d.probes} probes`)
  check("state untouched", (await state()).state === "active")
  check("nobody was emailed", run.emailed === 0 && d.sent.length === 0)
  check(
    "and no notice was recorded, so the cycle is not spent",
    (await state()).reauthNoticeSentAt === null
  )

  // Restore, so nothing after this case inherits the deletion.
  if (savedId !== undefined) process.env.X_CLIENT_ID = savedId
  if (savedSecret !== undefined) process.env.X_CLIENT_SECRET = savedSecret

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

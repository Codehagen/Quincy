/**
 * Locks the sign-in failure contract behind an assertion instead of memory.
 * Run with: npx tsx --env-file=.env.local scripts/verify-auth-recovery.ts
 *
 * The status code each sign-in failure returns is easy to get backwards — an
 * unverified account has already been reported here as a wrong password once,
 * and the fix for that bug was itself written against a documented status
 * code that turned out to be false. This drives better-auth's real HTTP
 * pipeline (`auth.handler`, not `auth.api.*`) so the rate limiter is actually
 * in the loop, and pins the resend endpoint's enumeration-safe response and
 * its own rate limit alongside it.
 */
import { eq, like } from "drizzle-orm"

import { auth } from "../lib/auth"
import { db } from "../lib/db"
import { rateLimit, user } from "../lib/schema"

function check(label: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`)
  if (!ok) process.exitCode = 1
}

const TEST_IP = "203.0.113.42" // TEST-NET-3, never a real client
const BASE = "http://localhost:3000/api/auth"

const TEST_EMAIL = "verify-recovery@quincy.test"
const UNKNOWN_EMAIL = "verify-recovery-unknown@quincy.test"
const CORRECT_PASSWORD = "verify-recovery-correct-password"
const WRONG_PASSWORD = "verify-recovery-wrong-password"

async function post(
  path: string,
  body: Record<string, unknown>
): Promise<{ status: number; json: Record<string, unknown> }> {
  const response = await auth.handler(
    new Request(`${BASE}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": TEST_IP,
      },
      body: JSON.stringify(body),
    })
  )
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>
  return { status: response.status, json }
}

/**
 * The bucket key is `${ip}|${path}` (better-auth's createRateLimitKey), so
 * every path this script exercises shares the TEST_IP prefix and one delete
 * clears all of them. Starting dirty — a leftover row from an interrupted
 * run — is the failure mode that makes this script flaky, so this runs both
 * before and after main().
 */
async function clearBuckets() {
  await db.delete(rateLimit).where(like(rateLimit.key, `${TEST_IP}|%`))
}

async function main() {
  await clearBuckets()

  try {
    console.log("=== setup: a disposable unverified account ===")
    // If this address already exists from a previous interrupted run,
    // better-auth answers with a synthetic success rather than an error
    // (AGENTS.md) — so the signup's own status is not asserted here; the
    // teardown below cleans up either way.
    await post("/sign-up/email", {
      name: "Verify Recovery",
      email: TEST_EMAIL,
      password: CORRECT_PASSWORD,
    })

    console.log("\n=== sign-in status contract ===")

    const wrongPassword = await post("/sign-in/email", {
      email: TEST_EMAIL,
      password: WRONG_PASSWORD,
    })
    check(
      "wrong password is 401 INVALID_EMAIL_OR_PASSWORD",
      wrongPassword.status === 401 &&
        wrongPassword.json.code === "INVALID_EMAIL_OR_PASSWORD",
      `status ${wrongPassword.status}, code ${String(wrongPassword.json.code)}`
    )

    const unverified = await post("/sign-in/email", {
      email: TEST_EMAIL,
      password: CORRECT_PASSWORD,
    })
    check(
      "unverified account is 403 EMAIL_NOT_VERIFIED",
      unverified.status === 403 && unverified.json.code === "EMAIL_NOT_VERIFIED",
      `status ${unverified.status}, code ${String(unverified.json.code)}`
    )

    // This is the property that lets the login form name the address on
    // screen without becoming an oracle for who has an account — if a wrong
    // password ever leaked EMAIL_NOT_VERIFIED, that UI copy would leak it too.
    check(
      "a wrong password never reveals verification state",
      !JSON.stringify(wrongPassword.json).includes("EMAIL_NOT_VERIFIED")
    )

    // Clear before the rate-limit check so the three attempts above do not
    // count toward the limit under test.
    await clearBuckets()

    let limited: { status: number; json: Record<string, unknown> } | undefined
    for (let i = 0; i < 6; i += 1) {
      limited = await post("/sign-in/email", {
        email: TEST_EMAIL,
        password: WRONG_PASSWORD,
      })
    }
    // The missing `code` is the specific fact that made the login form
    // mis-report rate limiting as something else, so it is asserted
    // explicitly rather than only asserting the status.
    check(
      "rate limited is 429 with no code field",
      limited?.status === 429 && limited?.json.code === undefined,
      `status ${limited?.status}, code ${String(limited?.json.code)}`
    )

    console.log("\n=== resend status contract ===")
    // These calls do attempt real Resend deliveries to @quincy.test, which is
    // not a deliverable domain — that is expected and costs nothing, and is
    // why the test addresses must stay on @quincy.test.
    await clearBuckets()

    const toUnknown = await post("/send-verification-email", {
      email: UNKNOWN_EMAIL,
    })
    check(
      "resend to an unknown address returns 200 status:true",
      toUnknown.status === 200 && toUnknown.json.status === true,
      `status ${toUnknown.status}, body ${JSON.stringify(toUnknown.json)}`
    )

    const toUnverified = await post("/send-verification-email", {
      email: TEST_EMAIL,
    })
    // The two responses being indistinguishable is what prevents account
    // enumeration — the identical shape is the point, not just the 200.
    check(
      "resend to an unverified address returns the identical response",
      toUnverified.status === toUnknown.status &&
        JSON.stringify(toUnverified.json) === JSON.stringify(toUnknown.json),
      `status ${toUnverified.status}, body ${JSON.stringify(toUnverified.json)}`
    )

    await clearBuckets()

    const resends: Array<{ status: number; json: Record<string, unknown> }> = []
    for (let i = 0; i < 4; i += 1) {
      resends.push(await post("/send-verification-email", { email: TEST_EMAIL }))
    }
    check(
      "resend is limited to 3 per 60s",
      resends.slice(0, 3).every((r) => r.status === 200) &&
        resends[3]?.status === 429,
      resends.map((r) => r.status).join(",")
    )
  } finally {
    await clearBuckets()
    // Exact email equality only — never a pattern. AGENTS.md records that
    // dev@quincy.test and christer@quincy.test live in the same database, and
    // a verify-*.ts teardown deleting more than it created has already
    // destroyed a working account in this repo once.
    await db.delete(user).where(eq(user.email, TEST_EMAIL))
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

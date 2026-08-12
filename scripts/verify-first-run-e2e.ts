/**
 * Drives first run the way a person does: a real browser, a real session, real
 * server actions, real redirects. See plans/022.
 *
 * Run with:
 *   pnpm dev
 *   npx tsx --env-file=.env.local scripts/verify-first-run-e2e.ts
 *
 * **Why this exists next to scripts/verify-onboarding.ts.** That one is library
 * level: it proves the read model and the write contract. It cannot see the
 * class of bug that has broken this flow twice, because both were in the seam
 * between a write and the next request:
 *
 * - "Do the rest later" wrote `onboardedAt` and then bounced back to /welcome,
 *   because `session.cookieCache` served the layout a five-minute-old copy of
 *   the user that still said null. Every library assertion passed.
 * - The in-flight turn was held as a bare string, so after the server advanced
 *   it silently dropped every answer after the first. Types, lint and a
 *   screenshot all passed.
 *
 * Both are only visible by clicking through, which is what this does.
 *
 * **Guarded on the address, not on NODE_ENV.** It answers the interview for
 * real, which writes brain pages and one riff, and there is one database.
 */
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { eq } from "drizzle-orm"

import { db } from "../lib/db"
import { brainPage, riff } from "../lib/schema-app"
import { user } from "../lib/schema"

const run = promisify(execFile)

const BROWSE =
  `${process.env.HOME}/.claude/skills/gstack/browse/dist/browse` as const
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000"

let failures = 0

function check(label: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`)
  if (!ok) failures += 1
}

async function browse(...args: string[]): Promise<string> {
  const { stdout } = await run(BROWSE, args, { maxBuffer: 8 * 1024 * 1024 })
  return stdout
}

/** Text out of the page, with the untrusted-content envelope stripped. */
async function pageText(): Promise<string> {
  const out = await browse("text")
  return out.replace(/--- (BEGIN|END) UNTRUSTED[^\n]*\n?/g, "")
}

async function click(startsWith: string): Promise<boolean> {
  const out = await browse(
    "js",
    `(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith(${JSON.stringify(
      startsWith
    )})); if(!b) return 'MISS'; b.scrollIntoView({block:'center'}); b.click(); return 'ok'})()`
  )
  return out.includes("ok")
}

async function currentUrl(): Promise<string> {
  return (await browse("url")).trim()
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

function assertTestAddress(email: string) {
  if (!email.endsWith("@quincy.test")) {
    throw new Error(
      `Refusing to run against ${email}. This answers the interview for real and deletes what it wrote. Use an @quincy.test address.`
    )
  }
}

async function main() {
  const email = process.env.DEV_ACCOUNT_EMAIL ?? "dev@quincy.test"
  const password = process.env.DEV_ACCOUNT_PASSWORD
  assertTestAddress(email)

  if (!password) {
    throw new Error("DEV_ACCOUNT_PASSWORD is not set in .env.local.")
  }

  const [owner] = await db
    .select({ id: user.id, trialEndsAt: user.trialEndsAt })
    .from(user)
    .where(eq(user.email, email))
    .limit(1)

  if (!owner) throw new Error(`No user with email ${email}`)
  const userId = owner.id

  console.log(`\n=== setup: a cold account at ${BASE} ===`)
  await db.delete(brainPage).where(eq(brainPage.userId, userId))
  await db.delete(riff).where(eq(riff.userId, userId))

  /**
   * Entitlement, granted for the run and put back in teardown.
   *
   * The last question spends a model call and is gated like every other
   * spending path, and `dev@quincy.test` is deliberately left lapsed so the
   * paywall copy has somewhere to be exercised. Without this the run stops at
   * question four with "Your subscription is no longer active", which is
   * correct behaviour and not what this script is testing.
   */
  await db
    .update(user)
    .set({
      onboardedAt: null,
      trialEndsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    })
    .where(eq(user.id, userId))

  // A real sign-in, so the session cookie is the one better-auth issues —
  // including the cache cookie whose staleness broke the exits.
  const signIn = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // better-auth refuses a request with no Origin — MISSING_OR_NULL_ORIGIN,
      // answered as 403, which reads exactly like an unverified address. Node's
      // fetch does not send one on its own.
      Origin: BASE,
    },
    body: JSON.stringify({ email, password }),
  })

  /**
   * Every cookie the sign-in issued, not just the session token.
   *
   * better-auth sets a second one, `better-auth.session_data`, holding a
   * cached copy of the user (`session.cookieCache` in lib/auth.ts). Replaying
   * only the token left the browser carrying a *previous* run's cached user —
   * which said `onboardedAt` was set — so the next run started already past
   * the gate and every interview assertion failed against /studio. The flake
   * was in this script, not in the app.
   */
  const jar = signIn.headers.getSetCookie()
  const token = jar
    .map((c) => /better-auth\.session_token=([^;]+)/.exec(c)?.[1])
    .find(Boolean)

  /**
   * The status alone identifies the failure, which is why it is printed.
   * 429 is the rate limiter (5 per 60s on this route) and means run it again
   * in a minute; 403 is an unverified address and means `dev-account.ts` has
   * not been run; 401 is the wrong password. See AGENTS.md, "Signing in
   * locally".
   */
  check("signed in", signIn.status === 200 && Boolean(token), `${signIn.status}`)
  if (!token) {
    const body = await signIn.text()
    throw new Error(
      `No session cookie (HTTP ${signIn.status}). ${body.slice(0, 200)}`
    )
  }

  await browse("viewport", "1440x1000")
  // The public root, purely to give the browser an origin the cookie can be
  // set on. /login would redirect twice for a session that already exists.
  await browse("goto", `${BASE}/`)
  for (const cookie of jar) {
    const pair = cookie.split(";")[0]
    if (pair.includes("=")) await browse("cookie", pair)
  }

  console.log("\n=== the gate ===")

  await browse("goto", `${BASE}/studio`)
  await wait(1500)
  check(
    "a cold account is sent from /studio to /welcome",
    (await currentUrl()).endsWith("/welcome"),
    await currentUrl()
  )

  const chrome = await pageText()
  check(
    "first run has no sidebar to bounce off",
    !chrome.includes("Conversations") && !chrome.includes("Lineup"),
    chrome.includes("Lineup") ? "sidebar present" : "clean"
  )

  console.log("\n=== the interview ===")

  await wait(4000)
  const opening = await pageText()
  check(
    "Quincy introduces itself before asking",
    opening.includes("I'm Quincy, and I write in your name"),
    opening.slice(0, 60)
  )
  check(
    "and says what it costs",
    opening.includes("none of this publishes anything")
  )

  const answers: [string, string][] = [
    ["I build in public", "My Human"],
    ["Founders and operators", "Who you write for"],
    ["English", "Voice"],
  ]

  for (const [chip, page] of answers) {
    check(`chip "${chip}" is offered`, await click(chip))
    await wait(3500)
    const after = await pageText()
    check(`  the answer lands under ${page}`, after.includes(page), "")
  }

  // The last question spends a model call, so it is typed rather than chipped
  // and the wait is real.
  await browse(
    "js",
    `(()=>{const t=document.querySelector('textarea'); const set=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set; set.call(t,'Shipped the end to end test for first run'); t.dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('form')?.requestSubmit(); return 'sent'})()`
  )

  console.log("  … waiting on the angle generation (a real model call)")
  let handed = false
  let last = ""
  for (let i = 0; i < 20 && !handed; i += 1) {
    await wait(3000)
    last = await pageText()
    handed = last.includes("That is the talking done")
    // The action refuses fast when it refuses at all — entitlement, an empty
    // answer, a failed write — and renders the reason under the composer.
    // Reporting it beats waiting sixty seconds for a timeout that says nothing.
    if (/cannot work on this yet|did not save|nothing in that/i.test(last)) break
  }
  check(
    "the last answer is accepted and Quincy hands over",
    handed,
    handed ? "" : `page ends: …${last.slice(-160).replace(/\s+/g, " ")}`
  )

  console.log("\n=== the wiring ===")

  const wiring = await pageText()
  check(
    "the transcript is still on screen above it",
    wiring.includes("I'm Quincy, and I write in your name"),
    "replaced"
  )
  check("channels are offered", wiring.includes("Where the writing goes out"))
  check("sources are named", wiring.includes("Where the material comes in"))
  check(
    "Circleback is described rather than linked into a redirect loop",
    wiring.includes("After setup"),
    "no dead Connect"
  )

  console.log("\n=== the exits ===")

  check("'Do the rest later' is offered", await click("Do the rest later"))
  await wait(4000)

  const landed = await currentUrl()
  check(
    "skipping actually leaves first run",
    landed.endsWith("/studio"),
    // The failure this test was written for: the write lands, the cached
    // session still says null, and the layout bounces you straight back.
    landed.endsWith("/welcome") ? "bounced back to /welcome" : landed
  )

  const [after] = await db
    .select({ onboardedAt: user.onboardedAt })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
  check("onboardedAt is set", Boolean(after?.onboardedAt))

  await browse("goto", `${BASE}/welcome`)
  await wait(1500)
  check(
    "and /welcome no longer takes you back",
    (await currentUrl()).endsWith("/studio"),
    await currentUrl()
  )

  console.log("\n=== teardown ===")
  await db.delete(brainPage).where(eq(brainPage.userId, userId))
  await db.delete(riff).where(eq(riff.userId, userId))
  await db
    .update(user)
    .set({ onboardedAt: new Date(), trialEndsAt: owner.trialEndsAt })
    .where(eq(user.id, userId))
  check(
    "nothing left behind",
    true,
    "brain and riffs cleared, entitlement and onboarded_at restored"
  )

  console.log(
    failures === 0
      ? "\nAll checks passed.\n"
      : `\n${failures} check(s) failed.\n`
  )
  if (failures > 0) process.exitCode = 1
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  (error) => {
    console.error(error)
    process.exit(1)
  }
)

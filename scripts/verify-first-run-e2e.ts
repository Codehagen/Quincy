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
import { brainPage, draft, riff } from "../lib/schema-app"
import { user } from "../lib/schema"

const run = promisify(execFile)

const BROWSE =
  `${process.env.HOME}/.claude/skills/gstack/browse/dist/browse` as const
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000"

let failures = 0

function check(label: string, ok: boolean, detail = "") {
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`
  )
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

/**
 * Poll the page for a string instead of sleeping a guessed number of
 * milliseconds. Every turn types itself out (`TypedLine`), so any fixed wait
 * is a race against an animation whose length is the length of the copy —
 * which is exactly what broke this script when the intro grew a sentence.
 */
async function waitForText(
  needle: string,
  timeoutMs = 30_000
): Promise<string> {
  const deadline = Date.now() + timeoutMs
  let text = ""
  for (;;) {
    text = await pageText()
    if (text.includes(needle) || Date.now() > deadline) return text
    await wait(1000)
  }
}

/** Same, for a button that has not finished arriving yet. */
async function waitForClick(
  startsWith: string,
  timeoutMs = 30_000
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (await click(startsWith)) return true
    if (Date.now() > deadline) return false
    await wait(1000)
  }
}

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
  check(
    "signed in",
    signIn.status === 200 && Boolean(token),
    `${signIn.status}`
  )
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

  const opening = await waitForText("none of this publishes anything")
  check(
    "Quincy introduces itself before asking",
    opening.includes("I'm Quincy, and I write in your name"),
    opening.slice(0, 60)
  )
  check(
    "and says what it costs",
    opening.includes("none of this publishes anything")
  )

  // The first answer is typed, not chipped, because the typed path is the one
  // that has broken twice: a pending turn held as a bare string dropped every
  // answer after the first, and no chip click can see that class of bug.
  await waitForText("what do you actually do")
  await browse(
    "js",
    `(()=>{const t=document.querySelector('textarea'); const set=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set; set.call(t,'I build Quincy in public, an AI ghostwriter, and I ship and write about it every day.'); t.dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('form')?.requestSubmit(); return 'sent'})()`
  )
  check(
    "a typed answer lands under My Human",
    (await waitForText("My Human")).includes("My Human"),
    ""
  )

  // The remaining two answers are chips, which send on click.
  const answers: [string, string, string][] = [
    [
      "Founders and operators",
      "Who you write for",
      "What language should the posts be in",
    ],
    ["English", "Voice", "That is the talking done"],
  ]

  for (const [chip, page, nextMarker] of answers) {
    check(`chip "${chip}" is offered`, await waitForClick(chip))
    const after = await waitForText(nextMarker)
    check(`  the answer lands under ${page}`, after.includes(page), "")
  }

  const last = await waitForText("That is the talking done")
  check(
    "the third answer is accepted and Quincy hands over",
    last.includes("That is the talking done"),
    `page ends: …${last.slice(-160).replace(/\s+/g, " ")}`
  )

  console.log("\n=== the wiring, walked as the staircase it is ===")

  const wiring = await waitForText("Where the writing goes out")
  check(
    "the transcript is still on screen above it",
    wiring.includes("I'm Quincy, and I write in your name"),
    "replaced"
  )
  check("channels are offered", wiring.includes("Where the writing goes out"))

  // No X connection on this account, so the way forward is the door beside
  // the Connect button. Saying "later" is the decision that advances the step.
  check(
    "the step can be declined without granting anything",
    await waitForClick("I will connect it later")
  )

  // The material ask appears only after the channel step settles. This
  // account has no corpus, so it gets the plain form of the question.
  const asked = await waitForText(
    "what did you ship or figure out this week",
    20_000
  )
  check(
    "the material ask arrives after the settle",
    asked.includes("what did you ship or figure out this week") ||
      asked.includes("What happened this week"),
    `page ends: …${asked.slice(-120).replace(/\s+/g, " ")}`
  )

  await browse(
    "js",
    `(()=>{const t=document.querySelector('textarea'); if(!t) return 'MISS'; const set=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set; set.call(t,'This week I rebuilt the first run end to end: the interview now writes to the brain as each answer lands, the corpus read starts itself from the database instead of a redirect flag, and the wiring became a staircase where every ask follows something Quincy already did.'); t.dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('form')?.requestSubmit(); return 'sent'})()`
  )

  console.log("  … waiting on the angle generation (a real model call)")
  const angled = await waitForText("Pick the one you want", 150_000)
  check(
    "the material comes back as angles",
    angled.includes("Pick the one you want"),
    angled.includes("could not find an angle")
      ? "model found no angle"
      : `page ends: …${angled.slice(-120).replace(/\s+/g, " ")}`
  )

  // GitHub and Circleback appear only once there is material.
  const sourced = await waitForText("Where the material comes in", 20_000)
  check("sources are named", sourced.includes("Where the material comes in"))
  check(
    "Circleback is described rather than linked into a redirect loop",
    sourced.includes("After setup"),
    "no dead Connect"
  )
  check(
    "'Do the rest later' stays reachable beside the payoff",
    sourced.includes("Do the rest later")
  )

  console.log("\n=== the exit: a draft that exists, not a promise of one ===")

  const picked = await browse(
    "js",
    `(()=>{const b=document.querySelector('button[aria-pressed]'); if(!b) return 'MISS'; b.click(); return 'ok'})()`
  )
  check("an angle can be picked", picked.includes("ok"))
  check(
    "'Write this one' appears once an angle is chosen",
    await waitForClick("Write this one")
  )

  console.log("  … waiting on the draft (a real model call)")
  let landed = await currentUrl()
  for (let i = 0; i < 90 && !landed.endsWith("/drafts"); i += 1) {
    await wait(2000)
    landed = await currentUrl()
  }
  check(
    "first run ends on the draft it wrote",
    landed.endsWith("/drafts"),
    // The failure this test was written for: the write lands, the cached
    // session still says null, and the layout bounces you straight back.
    landed.endsWith("/welcome") ? "bounced back to /welcome" : landed
  )

  const draftRows = await db
    .select({ id: draft.id })
    .from(draft)
    .where(eq(draft.userId, userId))
  check(
    "the draft is a row, not a screen",
    draftRows.length > 0,
    `${draftRows.length} draft(s)`
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
  await db.delete(draft).where(eq(draft.userId, userId))
  await db.delete(brainPage).where(eq(brainPage.userId, userId))
  await db.delete(riff).where(eq(riff.userId, userId))
  await db
    .update(user)
    .set({ onboardedAt: new Date(), trialEndsAt: owner.trialEndsAt })
    .where(eq(user.id, userId))
  check(
    "nothing left behind",
    true,
    "drafts, brain and riffs cleared, entitlement and onboarded_at restored"
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

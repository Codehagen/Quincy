/**
 * The Studio chat's tools, against a running dev server and a real model.
 *
 *   npx tsx --env-file=.env.local scripts/verify-chat-tools.ts
 *   npx tsx --env-file=.env.local scripts/verify-chat-tools.ts --port 3100
 *
 * lib/chat-tools.test.ts proves the rendering: given rows, what does each tool
 * say. What it cannot prove is the part that decides whether this feature
 * exists at all — that a real model, given this system prompt and these tool
 * descriptions, actually *calls* one instead of answering from the brain. That
 * is a property of the prompt and the descriptions, not of the code, and the
 * only way to know it is to ask.
 *
 * So this one spends money, deliberately and once: a couple of cents for a turn
 * that would otherwise be guessed at.
 *
 * **It holds the dev account's trial open for the length of the run and puts it
 * back exactly as it was.** The chat route's entitlement gate is above
 * everything else, so an expired trial makes every assertion below pass for the
 * wrong reason — the same trap scripts/verify-rhythms.ts fell into, where eight
 * checks reported success because the handler never ran at all.
 *
 * Signs in as the @quincy.test dev account, the same guard
 * scripts/dev-account.ts enforces. Run that first if sign-in fails.
 *
 * Teardown deletes only what it created — the conversation, and the riff the
 * capture turn makes. Messages and angles cascade.
 */
import { eq } from "drizzle-orm"

import { db } from "../lib/db"
import { conversation, riff } from "../lib/schema-app"
import { user } from "../lib/schema"
import { requireTestTarget } from "./target-guard"

const portFlag = process.argv.indexOf("--port")
const PORT = portFlag > -1 ? process.argv[portFlag + 1] : "3000"
const BASE = `http://localhost:${PORT}`

const ACCOUNT = requireTestTarget(
  process.env.DEV_ACCOUNT_EMAIL ?? "dev@quincy.test",
  "verify-chat-tools.ts"
)

const CONVERSATION_ID = `conv_verify_chat_tools`

let failures = 0

function check(condition: boolean, label: string) {
  console.log(`  ${condition ? "PASS" : "FAIL"}  ${label}`)
  if (!condition) failures += 1
}

async function main() {
  const [account] = await db
    .select({ id: user.id, trialEndsAt: user.trialEndsAt })
    .from(user)
    .where(eq(user.email, ACCOUNT))
    .limit(1)

  if (!account) {
    throw new Error(
      `No ${ACCOUNT}. Run: npx tsx --env-file=.env.local scripts/dev-account.ts`
    )
  }

  /**
   * The exact prior value, restored in the `finally` no matter how this ends.
   *
   * Not "a sensible default" — the point is that the account is indistinguishable
   * afterwards from how it was found.
   */
  const trialWas = account.trialEndsAt

  /**
   * Every riff this account already had. The capture check asserts on what is
   * new, so a dev account with history does not fail it — and teardown removes
   * only rows this run is responsible for.
   */
  const existingRiffIds = new Set(
    (
      await db
        .select({ id: riff.id })
        .from(riff)
        .where(eq(riff.userId, account.id))
    ).map((row) => row.id)
  )
  let createdRiffIds: string[] = []

  try {
    await db
      .update(user)
      .set({ trialEndsAt: new Date(Date.now() + 60 * 60 * 1000) })
      .where(eq(user.id, account.id))

    console.log(`── the chat's tools (${BASE}, real model) ──`)

    const cookie = await signIn()
    check(Boolean(cookie), "session cookie issued")
    if (!cookie) throw new Error("cannot continue without a session")

    // Deliberately a question the brain cannot answer. "What is waiting for me"
    // is only answerable by reading this account's rows, so a reply with no
    // tool call in it is the model inventing or deflecting — which is the exact
    // failure this whole file exists to catch.
    const stream = await ask(
      cookie,
      "What is waiting for me right now? Check before you answer."
    )

    check(stream.status === 200, `chat answered 200 (got ${stream.status})`)

    const calledATool = /tool-read_|"toolName"\s*:\s*"read_/.test(stream.body)
    check(calledATool, "the model called a read tool rather than guessing")

    // The account has no riffs, so the honest answer names where they come
    // from. A model that says "you have three riffs" here is hallucinating.
    const namedTheEmptyState =
      /voice note|nothing is waiting|nothing is drafted/i.test(stream.body)
    check(namedTheEmptyState, "the empty state reached the answer")

    // The invariant. Nothing in this product may tell a user something posted.
    const claimedToPublish =
      /\b(i (have )?)?(published|posted|scheduled) (it|your|the)/i.test(
        stream.body
      )
    check(!claimedToPublish, "nothing in the reply claims to have published")

    /**
     * The loop that makes the chat a front door rather than a window.
     *
     * On 2026-08-13 the user pasted a script into the chat and got a correct
     * refusal: draft_angle needs an angle id, and pasted text has none. The
     * model then offered to write the post inside the conversation, which is
     * the failure this checks against — writing that never becomes a draft
     * never reaches /drafts and can never be published.
     */
    const captured = await ask(
      cookie,
      "Capture this so we can work on it. We killed per-seat pricing this " +
        "week. The reason is that per-seat charges a customer more for " +
        "adopting the product, which is backwards: the moment a tool starts " +
        "working, the invoice punishes you for it. We watched a team keep " +
        "three people off an account they had already decided to use, purely " +
        "so the bill stayed flat, and that is the whole argument. One price " +
        "for the team now. Revenue per account went down about eleven per " +
        "cent in the first month and adoption inside each account roughly " +
        "doubled, which is the trade we wanted."
    )

    check(
      captured.status === 200,
      `capture answered 200 (got ${captured.status})`
    )
    check(
      /capture_riff/.test(captured.body),
      "the model captured the material instead of answering around it"
    )

    // The row is the proof. A tool call in the stream that wrote nothing would
    // pass the check above and fail the product.
    const rows = await db
      .select({ id: riff.id, state: riff.state })
      .from(riff)
      .where(eq(riff.userId, account.id))
    const fresh = rows.filter((row) => !existingRiffIds.has(row.id))

    if (fresh.length !== 1) {
      /**
       * The tool's own refusal, surfaced.
       *
       * "0 riffs" alone sends the reader to the wrong place: a lapsed trial, a
       * cooldown and text over the ceiling all look identical from the row
       * count, and only one of them is a bug.
       */
      const refusal = captured.body.match(/Not captured:[^"\\]*/)?.[0]
      console.log(`     tool said: ${refusal ?? "(no refusal in the stream)"}`)
    }

    check(
      fresh.length === 1,
      `exactly one riff was created (got ${fresh.length})`
    )
    check(
      fresh[0]?.state === "ready",
      `the new riff is ready, not stuck (state ${fresh[0]?.state ?? "none"})`
    )

    createdRiffIds = fresh.map((row) => row.id)
  } finally {
    await db
      .update(user)
      .set({ trialEndsAt: trialWas })
      .where(eq(user.id, account.id))
    console.log(
      `\n  restored trial_ends_at to ${trialWas?.toISOString() ?? "null"}`
    )

    const removed = await db
      .delete(conversation)
      .where(eq(conversation.id, CONVERSATION_ID))
      .returning({ id: conversation.id })
    console.log(`  removed ${removed.length} conversation(s)`)

    for (const id of createdRiffIds) {
      await db.delete(riff).where(eq(riff.id, id))
    }
    console.log(`  removed ${createdRiffIds.length} riff(s)`)
  }
}

/** One turn, read to the end so the whole stream can be asserted against. */
async function ask(cookie: string, text: string) {
  const response = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE, cookie },
    body: JSON.stringify({
      id: CONVERSATION_ID,
      messages: [
        {
          id: "msg_verify_1",
          role: "user",
          parts: [{ type: "text", text }],
        },
      ],
    }),
  })

  return { status: response.status, body: await response.text() }
}

async function signIn(): Promise<string> {
  const password = process.env.DEV_ACCOUNT_PASSWORD

  if (!password) {
    throw new Error(
      "DEV_ACCOUNT_PASSWORD is not set. See scripts/dev-account.ts."
    )
  }

  let response = await signInOnce(ACCOUNT, password)

  // Better Auth rate-limits sign-in at 5 per 60s, and a script meant to be run
  // repeatedly hits that honestly. Waiting it out beats reporting it as a bad
  // password, which is a different status code entirely (401 vs 429).
  for (let attempt = 0; response.status === 429 && attempt < 6; attempt++) {
    console.log("  rate limited, waiting 15s")
    await new Promise((resolve) => setTimeout(resolve, 15_000))
    response = await signInOnce(ACCOUNT, password)
  }

  if (!response.ok) {
    throw new Error(
      `sign-in failed (${response.status}): ${await response.text()}. ` +
        `Run: npx tsx --env-file=.env.local scripts/dev-account.ts`
    )
  }

  return (response.headers.getSetCookie?.() ?? [])
    .map((entry) => entry.split(";")[0])
    .join("; ")
}

function signInOnce(email: string, password: string) {
  // Origin is not optional. Better Auth rejects a state-changing request
  // without one as CSRF, and node's fetch does not add it the way a browser
  // does — so omitting it fails with MISSING_OR_NULL_ORIGIN and looks like bad
  // credentials. It must match the configured BETTER_AUTH_URL.
  return fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email, password }),
  })
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

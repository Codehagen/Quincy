/**
 * Exercises first run against Neon. See plans/022.
 * Run with: npx tsx --env-file=.env.local scripts/verify-onboarding.ts
 *
 * Library level on purpose, so it is deterministic and needs no server: the
 * two redirect behaviours it cannot reach from here (the layout gate, and
 * /welcome bouncing a finished account) are HTTP concerns and are checked by
 * hand against a dev server — see the note at the bottom of this file.
 *
 * **Guarded on the address, not on NODE_ENV.** There is one Neon branch, so
 * the environment cannot tell you anything about which data you are about to
 * delete. Only the target can. This script wipes brain pages and riffs.
 */
import { eq } from "drizzle-orm"

import { getPage, putPage } from "../lib/brain"
import { resolveReturnTo } from "../lib/channels"
import { db } from "../lib/db"
import { latestRiffScrap, QUESTIONS, readInterview } from "../lib/onboarding"
import { brainPage, riff, sourceItem } from "../lib/schema-app"
import { user } from "../lib/schema"
import { compileVoice } from "../lib/voice"

function check(label: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`)
  if (!ok) process.exitCode = 1
}

/**
 * The whole safety story. `dev-account.ts` refuses any address outside
 * @quincy.test for the same reason and says so at length: this script deletes
 * a user's brain, and the dev database is the production database.
 */
function assertTestAddress(email: string) {
  if (!email.endsWith("@quincy.test")) {
    throw new Error(
      `Refusing to run against ${email}. This script deletes brain pages and riffs, and there is only one database. Use an @quincy.test address.`
    )
  }
}

async function main() {
  const email = process.argv[2] ?? "christer@quincy.test"
  assertTestAddress(email)

  const [owner] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1)

  if (!owner) throw new Error(`No user with email ${email}`)
  const userId = owner.id

  // Explicit teardown first, so a failed previous run cannot pass this one.
  await db.delete(brainPage).where(eq(brainPage.userId, userId))
  await db.delete(riff).where(eq(riff.userId, userId))
  await db.delete(sourceItem).where(eq(sourceItem.userId, userId))
  await db.update(user).set({ onboardedAt: null }).where(eq(user.id, userId))

  console.log("\n=== progress is derived from the brain ===")

  let state = await readInterview(userId, await latestRiffScrap(userId))
  check(
    "a fresh account is asked the first question",
    state.next?.id === "human",
    state.next?.id ?? "none"
  )
  check("nothing is answered yet", state.answered.length === 0)

  await putPage({
    userId,
    slug: "human",
    kind: "identity",
    title: "My Human",
    body: "Sells commercial real estate and ships software at night.",
    provenance: "user",
  })

  state = await readInterview(userId, await latestRiffScrap(userId))
  check(
    "answering one moves to the second question",
    state.next?.id === "reader",
    state.next?.id ?? "none"
  )
  check(
    "the answer comes back for the transcript",
    state.answered[0]?.answer.startsWith("Sells commercial"),
    state.answered[0]?.answer ?? "empty"
  )

  await putPage({
    userId,
    slug: "memory/who-you-write-for",
    kind: "memory",
    title: "Who you write for",
    body: "Founders and operators building real businesses.",
    provenance: "user",
  })

  state = await readInterview(userId, await latestRiffScrap(userId))
  check(
    "resuming after a reload lands on the third question",
    state.next?.id === "language",
    state.next?.id ?? "none"
  )

  console.log("\n=== the language rule ===")

  // What the action writes, restated here rather than imported: "use server"
  // modules are a Next build concern and importing one into a plain tsx script
  // is not a contract this repo relies on anywhere else.
  await putPage({
    userId,
    slug: "voice",
    kind: "voice",
    title: "Voice",
    data: { rules: ["Write all posts and drafts in English."] },
    provenance: "user",
  })

  state = await readInterview(userId, await latestRiffScrap(userId))
  check(
    "a voice page with no body falls back to its first rule",
    state.answered[2]?.answer === "Write all posts and drafts in English.",
    state.answered[2]?.answer ?? "empty"
  )

  // What the action actually writes: the raw answer in `body`, the rule in
  // `data`. The transcript has to show what the person said, not Quincy's
  // phrasing of it.
  await putPage({
    userId,
    slug: "voice",
    kind: "voice",
    title: "Voice",
    body: "English",
    data: { rules: ["Write all posts and drafts in English."] },
    provenance: "user",
  })

  state = await readInterview(userId, await latestRiffScrap(userId))
  check(
    "the transcript shows the words that were typed, not the rule",
    state.answered[2]?.answer === "English",
    state.answered[2]?.answer ?? "empty"
  )
  check(
    "the last question is material",
    state.next?.id === "material",
    state.next?.id ?? "none"
  )

  const voice = await getPage(userId, "voice")
  check(
    "the voice page is user-owned",
    voice?.provenance === "user",
    voice?.provenance ?? "missing"
  )

  console.log("\n=== the corpus read cannot overwrite a stated preference ===")

  /**
   * The interaction the whole provenance rule exists for. A person states
   * their posting language in question three, and ninety seconds later the
   * corpus read compiles a voice from 57 posts. If the compile wrote `voice`,
   * an inferred rule would replace a stated one.
   */
  await db.insert(sourceItem).values([
    {
      id: `si_verify_${Date.now()}_1`,
      userId,
      source: "x",
      externalId: `verify-${Date.now()}-1`,
      url: "https://x.com/CodeHagen/status/1",
      postedAt: new Date("2026-08-01T10:00:00Z"),
      body: "Shipped the thing. No em dashes anywhere in it.",
      meta: {},
    },
  ])

  const compiled = await compileVoice({
    userId,
    // Stubbed: this check is about which page gets written, not about what a
    // model infers. A real model call would also make the result nondeterministic.
    extract: async () => ({
      portrait: "Ships fast, writes short.",
      rules: ["Keep the lines short and stacked."],
      stories: [],
    }),
  })

  const voiceAfter = await getPage(userId, "voice")
  const voiceRules = ((voiceAfter?.data as { rules?: string[] } | undefined)
    ?.rules ?? []) as string[]

  check(
    "the stated language rule survives the compile untouched",
    voiceRules[0] === "Write all posts and drafts in English.",
    JSON.stringify(voiceRules)
  )
  check(
    "the compile did not have to skip anything, because it targets voice/x",
    compiled.skipped.includes("voice") === false,
    compiled.skipped.join(", ") || "nothing skipped"
  )

  const compiledVoice = await getPage(userId, "voice/x")
  check(
    "the compile writes voice/x instead",
    Boolean(compiledVoice),
    compiledVoice ? "written" : "missing"
  )
  check(
    "and voice/x is not user-owned, so a later compile may replace it",
    compiledVoice?.provenance !== "user",
    compiledVoice?.provenance ?? "missing"
  )

  console.log("\n=== the connect return path ===")

  check("a published path is allowed", resolveReturnTo("/welcome") === "/welcome")
  for (const hostile of [
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/welcome.evil.example",
    "/welcome?x=1",
    "/studio",
  ]) {
    check(`refuses ${hostile}`, resolveReturnTo(hostile) === null)
  }

  console.log("\n=== finishing ===")

  await db.update(user).set({ onboardedAt: new Date() }).where(eq(user.id, userId))
  const [after] = await db
    .select({ onboardedAt: user.onboardedAt })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)

  check("onboardedAt is set", Boolean(after?.onboardedAt))

  console.log("\n=== teardown ===")
  await db.delete(brainPage).where(eq(brainPage.userId, userId))
  await db.delete(sourceItem).where(eq(sourceItem.userId, userId))
  await db.delete(riff).where(eq(riff.userId, userId))
  const left = await db
    .select({ id: brainPage.id })
    .from(brainPage)
    .where(eq(brainPage.userId, userId))
  check("nothing left behind", left.length === 0, `${left.length} pages`)

  console.log(
    "\nChecked by hand against a dev server, because they are redirects:\n" +
      "  - /studio with onboardedAt null answers 307 to /welcome\n" +
      "  - /welcome with onboardedAt set answers 307 to /studio\n" +
      `  - QUESTIONS has ${QUESTIONS.length} entries and the rail counts against it\n`
  )
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  (error) => {
    console.error(error)
    process.exit(1)
  }
)

"use server"

import { revalidatePath } from "next/cache"
import { headers as nextHeaders } from "next/headers"
import { eq } from "drizzle-orm"

import { auth } from "@/lib/auth"
import { getPage, putPage, RULE_CAP } from "@/lib/brain"
import { isEntitled, resolveEntitlementForRequest } from "@/lib/entitlement"
import { db } from "@/lib/db"
import { isQuestionId, type QuestionId } from "@/lib/onboarding"
import { completeSpokenRiff, startTypedRiff } from "@/lib/riffs"
import { user } from "@/lib/schema"
import { getSession } from "@/lib/session"

/**
 * First run's writes. See plans/022.
 *
 * Every answer lands the moment it is given rather than being batched at the
 * end, which is what makes abandoning first run survivable: `readInterview`
 * derives the next question from what is already written, so a closed laptop
 * resumes in the right place with no progress state to keep in sync.
 *
 * All four pages are written `provenance: "user"`. That is load-bearing rather
 * than incidental — `compileVoice` skips any page a person owns (lib/voice.ts,
 * "the heartbeat rule"), so the language stated in question three survives the
 * corpus read that may happen ninety seconds later on the next screen. Get the
 * provenance wrong and a model overwrites a stated preference with an inferred
 * one.
 */

export type AnswerResult =
  | { ok: true }
  | { ok: false; message: string }

const MAX_ANSWER_CHARS = 2_000

export async function answerQuestion(
  id: string,
  answer: string
): Promise<AnswerResult> {
  const session = await getSession()
  if (!session) {
    return { ok: false, message: "Not signed in." }
  }

  if (!isQuestionId(id)) {
    return { ok: false, message: "That is not one of the questions." }
  }

  const text = answer.trim().slice(0, MAX_ANSWER_CHARS)
  if (!text) {
    return { ok: false, message: "Say something and I will write it down." }
  }

  const userId = session.user.id

  try {
    switch (id satisfies QuestionId) {
      case "human":
        await putPage({
          userId,
          slug: "human",
          kind: "identity",
          title: "My Human",
          body: text,
          provenance: "user",
        })
        break

      case "reader":
        await putPage({
          userId,
          slug: "memory/who-you-write-for",
          kind: "memory",
          title: "Who you write for",
          body: text,
          provenance: "user",
        })
        break

      case "language":
        await writeLanguageRule(userId, text)
        break

      case "material":
        // The whole session user, not just an id: `resolveEntitlementForRequest`
        // starts a trial when `trialEndsAt` is absent, so passing `{ id }`
        // turns every read into a write.
        return await writeFirstRiff(session.user, text)
    }
  } catch (cause) {
    console.error("[welcome] could not write the answer:", cause)
    return {
      ok: false,
      message: "That did not save. Try again.",
    }
  }

  revalidatePath("/welcome")
  return { ok: true }
}

/**
 * The language answer becomes a voice rule, merged rather than replacing.
 *
 * Read-modify-write on `data.rules`, because the voice page is a list and a
 * blind `putPage` would drop anything already there. `RULE_CAP` cannot be hit
 * by one rule on a fresh account, and the guard is written anyway — a comment
 * explaining why a guard is unnecessary is the smell AGENTS.md's money section
 * exists for, and the same reasoning applies to caps.
 */
async function writeLanguageRule(userId: string, answer: string) {
  const rule = `Write all posts and drafts in ${answer}.`

  const existing = await getPage(userId, "voice")
  const rules = Array.isArray((existing?.data as { rules?: unknown })?.rules)
    ? ((existing!.data as { rules: string[] }).rules ?? [])
    : []

  // Replace a previous answer to this same question rather than stacking a
  // second language rule beside it. Re-answering happens whenever somebody
  // reloads mid-interview and goes back.
  const kept = rules.filter((r) => !r.startsWith("Write all posts and drafts in"))

  await putPage({
    userId,
    slug: "voice",
    kind: "voice",
    title: "Voice",
    /**
     * The raw answer, kept so the transcript can show what the person actually
     * said. Reading `data.rules[0]` back into the bubble echoed Quincy's
     * phrasing — somebody who typed "English" saw "Write all posts and drafts
     * in English." attributed to them, which is a small lie in the one place
     * the screen is claiming to be a record of their words.
     */
    body: answer,
    data: { rules: [rule, ...kept].slice(0, RULE_CAP) },
    provenance: "user",
  })
}

/**
 * Question four's answer becomes the first riff.
 *
 * This is the one question that spends: `completeSpokenRiff` calls a model to
 * find angles. It is therefore entitlement-gated like every other spending
 * path, and bounded by that function's own transcript ceiling.
 *
 * **A failed model call still counts as answered.** The riff exists before the
 * angles are asked for, so the material is never lost — and returning an error
 * that sent someone back to retype what they just typed would be the worst
 * possible first minute. The card carries its own retry.
 */
async function writeFirstRiff(
  sessionUser: { id: string; trialEndsAt?: Date | string | null },
  text: string
): Promise<AnswerResult> {
  const userId = sessionUser.id
  const entitlement = await resolveEntitlementForRequest(sessionUser)

  if (!isEntitled(entitlement)) {
    return {
      ok: false,
      message:
        entitlement.state === "lapsed"
          ? "Your subscription is no longer active, so I cannot work on this yet."
          : "Your free day is over, so I cannot work on this yet.",
    }
  }

  const riffId = await startTypedRiff(userId)

  const result = await completeSpokenRiff({
    riffId,
    userId,
    transcript: text,
    // "That recording came back empty" is a lie here — nothing was recorded.
    emptyMessage: "There was nothing in that to work with.",
  })

  revalidatePath("/welcome")
  revalidatePath("/riffs")

  if (!result.ok) {
    // The riff is written and the material is safe. Say so, rather than
    // reporting a failure that reads as "your answer is gone".
    console.error("[welcome] first riff angles failed:", result)
    return { ok: true }
  }

  return { ok: true }
}

/**
 * The two ways first run ends, and the only two things that write
 * `onboardedAt`.
 *
 * In particular the corpus import does not, or somebody who connects X from
 * /channels months later would silently count as onboarded.
 */
export async function finishFirstRun(): Promise<void> {
  await markOnboarded()
}

export async function skipFirstRun(): Promise<void> {
  await markOnboarded()
}

async function markOnboarded() {
  const session = await getSession()
  if (!session) return

  await db
    .update(user)
    .set({ onboardedAt: new Date() })
    .where(eq(user.id, session.user.id))

  /**
   * Rewrite the cached session, or the write above changes nothing the app can
   * see for five minutes.
   *
   * `session.cookieCache` is enabled (lib/auth.ts) and holds the whole user
   * object in a signed cookie that is read without touching the database. The
   * `(app)` layout gates on `session.user.onboardedAt`, so after the update it
   * was still reading `null` out of that cookie and bouncing straight back to
   * /welcome — which is what "Do the rest later" looked like from the outside:
   * a button that did nothing. Both exits were broken by it, not just the skip.
   *
   * `disableCookieCache` forces a real read, and `nextCookies()` is what puts
   * the refreshed cookie on this action's response.
   */
  await auth.api.getSession({
    headers: await nextHeaders(),
    query: { disableCookieCache: true },
  })

  // The layout reads `onboardedAt` off the session on every navigation in the
  // group, so every cached render in it is now stale.
  revalidatePath("/", "layout")
}

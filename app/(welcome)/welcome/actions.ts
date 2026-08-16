"use server"

import { revalidatePath } from "next/cache"
import { headers as nextHeaders } from "next/headers"
import { eq } from "drizzle-orm"

import { importFromX } from "@/app/(app)/sources/actions"
import { auth } from "@/lib/auth"
import { getPage, putPage, RULE_CAP } from "@/lib/brain"
import { isEntitled, resolveEntitlementForRequest } from "@/lib/entitlement"
import { db } from "@/lib/db"
import {
  corpusReceipt,
  humanAddition,
  isQuestionId,
  isThinMaterial,
  type CorpusReceipt,
  type QuestionId,
} from "@/lib/onboarding"
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

export type AnswerResult = { ok: true } | { ok: false; message: string }

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
  const kept = rules.filter(
    (r) => !r.startsWith("Write all posts and drafts in")
  )

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
 * The material ask, answered — and the moment the first riff exists.
 *
 * Its own action rather than a fourth case in `answerQuestion`, because it is
 * no longer one of the questions: it is asked after the corpus read, from the
 * wiring, and it writes a riff instead of a brain page. Folding it back into
 * the interview would put a special case in a function whose whole virtue is
 * that every branch now writes a page.
 *
 * **This is where the sequencing fix pays off.** By the time it runs, the brain
 * holds the portrait, the voice rules and the person's recurring themes — so
 * `completeSpokenRiff` cuts the angles once, against a Quincy that has read
 * them. It used to run before any of that existed and then need a second,
 * paid re-cut afterwards to fix what it produced.
 */
export type MaterialResult =
  | { ok: true }
  /**
   * Not a refusal. Quincy has the answer and would like one more sentence, and
   * `answered` is what it heard — so the screen can show it back as a turn
   * rather than leaving it in the composer looking rejected.
   */
  | { ok: false; reason: "thin"; followUp: string; answered: string }
  | { ok: false; reason: "failed"; message: string }

export async function answerMaterial(
  text: string,
  /**
   * Send it as it is. Set by "That is all I have", which is the escape from the
   * follow-up — nobody is ever held on this screen by a word count.
   */
  force = false
): Promise<MaterialResult> {
  const session = await getSession()
  if (!session) {
    return { ok: false, reason: "failed", message: "Not signed in." }
  }

  const trimmed = text.trim().slice(0, MAX_ANSWER_CHARS)
  if (!trimmed) {
    return {
      ok: false,
      reason: "failed",
      message: "Say something and I will work on it.",
    }
  }

  /**
   * **A follow-up, not a rejection — and that distinction cost a real run.**
   *
   * This used to refuse a short answer outright and print "what actually
   * changed, and what was annoying about it?" under the composer. It fired on
   * "So i just launched Quincy and building it in public", which is a launch,
   * a theme and a fact — genuinely enough to write from — and the person's
   * reply was "i didnt understand what you want here". Two failures in one
   * exchange: it blocked material that was fine, and the sentence meant to
   * teach taught nothing because it asked two abstract questions at once.
   *
   * An interviewer who gets a headline asks one more question. They do not hand
   * the answer back. So Quincy now says what it heard, asks a single concrete
   * thing, and leaves the way out open — the answer is already safe by then,
   * because the caller keeps it and sends it back with the addition.
   *
   * `force` is that way out, and it is unconditional. A word count must never
   * be the reason somebody cannot finish first run.
   */
  if (!force && isThinMaterial(trimmed)) {
    return {
      ok: false,
      reason: "thin",
      answered: trimmed,
      followUp:
        "Good — that is the thing, then. One more sentence and I can write it properly: what was the hardest part to get right, or the bit that nearly did not work?",
    }
  }

  try {
    // The whole session user, not just an id: `resolveEntitlementForRequest`
    // starts a trial when `trialEndsAt` is absent, so passing `{ id }` turns
    // every read into a write.
    const written = await writeFirstRiff(session.user, trimmed)
    return written.ok
      ? { ok: true }
      : { ok: false, reason: "failed", message: written.message }
  } catch (cause) {
    console.error("[welcome] could not write the first riff:", cause)
    return {
      ok: false,
      reason: "failed",
      message: "That did not save. Try again.",
    }
  }
}

/**
 * The material becomes the first riff.
 *
 * This is the one part of first run that spends on angles: `completeSpokenRiff`
 * calls a model to find them. It is therefore entitlement-gated like every
 * other spending path, and bounded by that function's own transcript ceiling.
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
 * The corpus read, and what it learned, in one round trip.
 *
 * `importFromX` is called unchanged — it carries the entitlement gate, and
 * `importXCorpus` behind it carries the ceiling and the ten-minute cooldown. A
 * copy of it without those, reachable by an account ninety seconds old, is
 * exactly the cost bug AGENTS.md's money section describes. This wrapper adds
 * no spending of its own; it only reads back what the compile wrote.
 *
 * The receipt is returned rather than re-fetched by the client, because the
 * screen says one sentence about it the moment it lands and a second round trip
 * would put a gap in the middle of that sentence.
 */
export type CorpusReadResult =
  | {
      ok: true
      postsRead: number
      /** Null when the corpus was too thin to compile a voice page from. */
      receipt: CorpusReceipt | null
      /**
       * Computed here rather than in the component, because `humanAddition`
       * lives beside `db` and a client bundle must not import that module for a
       * value. Returned with the read so the offer can appear in the same beat
       * as the portrait instead of waiting for a refresh.
       */
      addition: string | null
      truncated: boolean
    }
  | { ok: false; message: string }

export async function readCorpus(): Promise<CorpusReadResult> {
  const session = await getSession()
  if (!session) {
    return { ok: false, message: "Not signed in." }
  }

  const imported = await importFromX()
  if (!imported.ok) {
    return { ok: false, message: imported.message }
  }

  /**
   * A failed read-back is not a failed import. The posts are stored and the
   * money is spent by this point, so reporting an error here would tell
   * somebody the thing they just paid for did not happen. The count is the
   * fallback receipt.
   */
  let receipt: CorpusReceipt | null = null
  try {
    receipt = await corpusReceipt(session.user.id)
  } catch (cause) {
    console.error("[welcome] could not read the corpus receipt:", cause)
  }

  /**
   * No re-cut here any more, and its absence is the point.
   *
   * This used to call `recutAngles` — a second, paid angle generation to repair
   * the first, which had been cut before any of this existed. The material ask
   * moved after this read instead, so the angles are only ever cut once, and by
   * then everything the compile just wrote is in the brain. The fix is a
   * deleted model call rather than an added one.
   */
  revalidatePath("/welcome")

  return {
    ok: true,
    postsRead: imported.postsRead,
    receipt,
    addition: humanAddition(receipt),
    // No silent caps: `truncated` reaches the copy.
    truncated: imported.truncated,
  }
}

/**
 * Adds what the read learned to the person's own answer, on their say-so.
 *
 * The person's words stay first and the sentence is appended under them, so
 * nothing they typed is lost or reworded. `provenance: "confirmed"` rather than
 * `"user"` records the truth of it: they approved a line Quincy drafted. That
 * is what `confirmPage` in lib/brain.ts means by the word, and using it here
 * keeps one vocabulary for "a human agreed to this".
 *
 * Idempotent by content — pressing twice, or a retry after a dropped response,
 * cannot stack the same sentence twice.
 */
export async function enrichHuman(): Promise<AnswerResult> {
  const session = await getSession()
  if (!session) {
    return { ok: false, message: "Not signed in." }
  }

  const userId = session.user.id

  try {
    const [page, receipt] = await Promise.all([
      getPage(userId, "human"),
      corpusReceipt(userId),
    ])

    const addition = humanAddition(receipt)
    if (!page || !addition) {
      return { ok: false, message: "There is nothing to add yet." }
    }

    const existing = (page.body ?? "").trim()
    if (existing.includes(addition)) return { ok: true }

    await putPage({
      userId,
      slug: "human",
      kind: "identity",
      title: "My Human",
      body: existing ? `${existing}\n\n${addition}` : addition,
      provenance: "confirmed",
    })
  } catch (cause) {
    console.error("[welcome] could not enrich the human page:", cause)
    return { ok: false, message: "That did not save. Try again." }
  }

  revalidatePath("/welcome")
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

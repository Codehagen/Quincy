import { createHmac, timingSafeEqual } from "node:crypto"
import { and, eq, like } from "drizzle-orm"
import { generateText, Output, type LanguageModelUsage } from "ai"

import { db } from "../db"
import { usageEvent } from "../schema-app"
import {
  CHECK_MODEL,
  CHECK_OFFER_TTL_MS,
  checkTagPrefix,
  checkVerdictSchema,
  type CheckVerdict,
} from "./self-check"

/**
 * The server half of the self-check: the offer a run hands the browser, the
 * one-check-per-run lookup, and the one model call.
 */

/**
 * The offer is signed so the check route can trust two things it cannot see
 * for itself: that this run happened on this project, and that it changed
 * the picture or captions. Without it a script could name a fresh run id per
 * request and buy a check each time.
 */
export type CheckOffer = {
  projectId: string
  runId: string
  /** The scene the run cut; null for a run on the scene on screen. */
  sceneId: string | null
  expiresAt: number
}

function secret(): string {
  const value = process.env.BETTER_AUTH_SECRET
  if (!value) throw new Error("BETTER_AUTH_SECRET is not set.")
  return value
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(`self-check.${payload}`).digest("base64url")
}

/**
 * `sceneId` names the cut a three-cuts sub-run made (phase D), so the check
 * looks at that scene and not at whichever one is on screen. It is signed
 * with the rest: a forged scene id cannot buy a check of another cut.
 */
export function signOffer(
  projectId: string,
  runId: string,
  now = Date.now(),
  sceneId: string | null = null
): string {
  const payload = `${projectId}.${runId}.${sceneId ?? "-"}.${now + CHECK_OFFER_TTL_MS}`
  return `${payload}.${sign(payload)}`
}

export function verifyOffer(token: string, now = Date.now()): CheckOffer | null {
  const parts = token.split(".")
  if (parts.length !== 5) return null
  const [projectId, runId, scene, expires, signature] = parts
  const expected = Buffer.from(sign(`${projectId}.${runId}.${scene}.${expires}`))
  const given = Buffer.from(signature)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  const expiresAt = Number(expires)
  if (!Number.isFinite(expiresAt) || expiresAt < now) return null
  return { projectId, runId, sceneId: scene === "-" ? null : scene, expiresAt }
}

/**
 * Whether this run has been checked already. The metering row is the
 * attempt log: it is written for every model call, failed ones included, so
 * a second request for the same run is refused whatever the first returned.
 */
export async function alreadyChecked(userId: string, runId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: usageEvent.id })
    .from(usageEvent)
    .where(and(eq(usageEvent.userId, userId), like(usageEvent.conversationId, `${checkTagPrefix(runId)}%`)))
    .limit(1)
  return Boolean(row)
}

const PROMPT = `You are checking three frames of a short vertical or wide video cut, as the editor who just cut it.
Look for exactly these problems:
- a caption covering a face, a mouth or the subject;
- framing that cuts the speaker off or leaves them badly off centre;
- a push-in that is not on the speaker.
For each frame, note in a few plain words what you saw. Only ask for a fix you can see a reason for in the frames; when everything reads clear, both fixes are null.
Captions sit near the bottom of the frame by default; "up" lifts them, "down" lowers them.`

export type CheckAnswer = {
  verdict: CheckVerdict
  usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number }
}

/**
 * The one model call. Throws on failure; the caller meters either way.
 *
 * `onUsage` hears the call's usage as soon as the model has answered, before
 * the answer is parsed: an answer that fails the schema throws, and the
 * tokens it took were still spent.
 */
export async function lookAtFrames(
  frames: { dataUrl: string; atLabel: string }[],
  abortSignal?: AbortSignal,
  onUsage?: (usage: LanguageModelUsage) => void
): Promise<CheckAnswer> {
  const result = await generateText({
    model: CHECK_MODEL,
    output: Output.object({ schema: checkVerdictSchema }),
    maxOutputTokens: 600,
    abortSignal,
    onStepEnd: (step) => onUsage?.(step.usage),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: PROMPT },
          ...frames.flatMap((frame, index) => [
            { type: "text" as const, text: `Frame ${index} at ${frame.atLabel}:` },
            { type: "file" as const, mediaType: "image/jpeg", data: frame.dataUrl.replace(/^data:image\/jpeg;base64,/, "") },
          ]),
        ],
      },
    ],
  })

  return {
    verdict: result.output,
    usage: {
      inputTokens: result.usage.inputTokens ?? 0,
      cachedInputTokens: result.usage.inputTokenDetails?.cacheReadTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
    },
  }
}

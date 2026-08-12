import {
  convertToModelMessages,
  createIdGenerator,
  createUIMessageStream,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai"

import { getAsset } from "@/lib/editor/assets"
import { createRun, describeScene, editorTools } from "@/lib/editor/agent"
import type { EditOp } from "@/lib/editor/ops"
import {
  getProject,
  lockProject,
  saveDocument,
  unlockProject,
  RevisionConflictError,
} from "@/lib/editor/projects"
import { findMainTrack } from "@/lib/editor/timeline"
import { wordsFromDeepgram } from "@/lib/editor/transcript"
import type { VideoElement } from "@/lib/editor/types"
import {
  isEntitled,
  paywallResponse,
  resolveEntitlementForRequest,
} from "@/lib/entitlement"
import { getSession } from "@/lib/session"
import { recordUsage } from "@/lib/usage"

/**
 * Cutting by prompt.
 *
 * The shape is the same as /api/chat — gateway model slug, `streamText`,
 * `toUIMessageStream` — with three things this one needs and that one does not.
 *
 * **It holds the document for the length of the run.** That is `DocumentLock`
 * made real, and it is the tradeoff written down in types.ts: a genuine merge
 * between concurrent human and agent edits is a CRDT and weeks of work for a
 * case that lasts a few seconds. The timeline goes read-only with a visible
 * reason instead of silently resolving a conflict the user did not know they
 * were in.
 *
 * **Ops stream as they land.** Every tool call writes its batch to the browser
 * as a transient data part, and the editor applies it to its own copy. So the
 * timeline moves while the model is still talking, rather than snapping into
 * place after it finishes — which for a run that removes forty pauses is the
 * difference between watching an edit and waiting for one.
 *
 * **The document is written once, at the end.** Tools mutate a working snapshot
 * in memory; the save goes in against the revision the run started from. A run
 * either lands whole or does not land, and a crash halfway through leaves the
 * project exactly as the user left it.
 */

export const maxDuration = 120

const MODEL = process.env.EDITOR_MODEL ?? "anthropic/claude-sonnet-5"

const generateMessageId = createIdGenerator({ prefix: "msg", size: 16 })
const generateRunId = createIdGenerator({ prefix: "run", size: 16 })

/**
 * Enough steps to read, act, check and say something.
 *
 * Not unbounded. A model that cannot make progress will keep calling
 * describe_timeline, and a loop that costs money should end on its own.
 */
const MAX_STEPS = 8

const SYSTEM = `You are the cutting room inside Quincy, editing one video project with the person who recorded it.

You edit by calling tools. Never describe an edit you have not made — call the tool and then say what happened. Your tools change the same timeline the user is looking at, and every change they make lands live in front of them.

Rules that matter:
- The user's cut is theirs. Do one thing they asked for, not the four you would also do. If a request is broad ("make this good"), do the obvious first step and say what else you would suggest.
- A tool that reports it changed nothing changed nothing. Say so plainly rather than claiming success.
- Reframing does not crop. Going from wide to vertical fits the picture inside the taller frame with black either side; say that, because it is not what most people expect.
- Captions are built from the transcript and are not automatic. If someone asks why there are no captions, that is the answer.
- Be brief. Two sentences after a cut lands, not a paragraph. Lead with what changed.
- No preamble, no restating the request, no "great question".`

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()

  if (!session) {
    return Response.json({ error: "Not signed in." }, { status: 401 })
  }

  // The money gate, above the body parse and above the lock — a request that
  // cannot spend must not take the document hostage either.
  const entitlement = await resolveEntitlementForRequest(session.user)

  if (!isEntitled(entitlement)) {
    return paywallResponse(entitlement)
  }

  if (!process.env.AI_GATEWAY_API_KEY) {
    return Response.json(
      { error: "AI_GATEWAY_API_KEY is not set. Add it to .env.local." },
      { status: 503 }
    )
  }

  const { id } = await params

  let body: { messages?: UIMessage[] }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 })
  }

  const messages = body.messages ?? []

  const project = await getProject(id, session.user.id)
  if (!project) {
    return Response.json({ error: "No such project." }, { status: 404 })
  }

  const runId = generateRunId()

  // Claimed before anything expensive starts. The claim is a conditional UPDATE
  // rather than a read-then-write, because two runs arriving together is
  // precisely the case a lock exists to prevent.
  if (!(await lockProject(id, session.user.id, runId))) {
    return Response.json(
      { error: "Something is already cutting this project." },
      { status: 409 }
    )
  }

  const startedAtRevision = project.revision

  const run = createRun({
    initial: {
      document: project.document,
      revision: project.revision,
      lock: {
        status: "locked",
        runId,
        lockedBy: "agent",
        startedAt: new Date().toISOString(),
      },
    },
    runId,
    onCommit: (ops) => streamOps(ops),
    loadWords: async () => {
      const scene =
        project.document.scenes.find(
          (candidate) => candidate.id === project.document.currentSceneId
        ) ?? project.document.scenes[0]

      const clip = scene && findMainTrack(scene)?.elements.find(isVideo)
      if (!clip) return null

      const asset = await getAsset(clip.mediaId, session.user.id)
      return asset?.transcript ? wordsFromDeepgram(asset.transcript) : null
    },
  })

  /**
   * Set by the stream's `execute` before any tool can run.
   *
   * `createRun` needs somewhere to send ops and the writer does not exist until
   * `createUIMessageStream` calls back, so the two are tied together here
   * rather than by constructing the run inside `execute` — where the `finally`
   * that unlocks could not see it.
   */
  let streamOps: (ops: EditOp[]) => void = () => {}

  const scene =
    project.document.scenes.find(
      (candidate) => candidate.id === project.document.currentSceneId
    ) ?? project.document.scenes[0]

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      streamOps = (ops) =>
        writer.write({
          type: "data-ops",
          data: { ops },
          // Transient: the browser applies these to its own document and the
          // document is what persists. Keeping them in the message history
          // would mean a reload replays every edit of every past run on top of
          // a project that already has them.
          transient: true,
        })

      const result = streamText({
        model: MODEL,
        system: scene
          ? `${SYSTEM}\n\nThe cut as it stands: ${describeScene(scene)}`
          : SYSTEM,
        messages: await convertToModelMessages(messages),
        tools: editorTools(run),
        stopWhen: isStepCount(MAX_STEPS),
      })

      writer.merge(
        toUIMessageStream({
          stream: result.stream,
          originalMessages: messages,
          generateMessageId,
          onEnd: async () => {
            try {
              const usage = await result.usage

              await recordUsage({
                userId: session.user.id,
                conversationId: `project:${id}`,
                model: MODEL,
                inputTokens: usage.inputTokens ?? 0,
                cachedInputTokens:
                  usage.inputTokenDetails?.cacheReadTokens ?? 0,
                outputTokens: usage.outputTokens ?? 0,
              })
            } catch (cause) {
              console.error("[editor agent] could not record usage:", cause)
            }

            /**
             * Saved even on an abort, and that is deliberate.
             *
             * The edits already happened — they are on the user's screen,
             * applied by the ops that streamed while the model was working.
             * Throwing them away because the user stopped the *talking* would
             * mean the timeline they are looking at is not the timeline that
             * is stored, and the next autosave would either fight it or lose
             * it. Stop cancels the rest of the run, not what it already did.
             */
            if (!run.touched()) return

            try {
              const saved = await saveDocument(
                id,
                session.user.id,
                run.snapshot().document,
                startedAtRevision
              )

              // The browser has been applying ops as they arrived, so its
              // document already matches. What it does not know is the
              // revision the server now holds — and without it, its next
              // autosave states a revision that has moved and 409s.
              writer.write({
                type: "data-saved",
                data: { revision: saved.revision },
                transient: true,
              })
            } catch (cause) {
              const conflict = cause instanceof RevisionConflictError

              console.error(`[editor agent] could not save ${id}:`, cause)

              writer.write({
                type: "data-run-failed",
                data: {
                  message: conflict
                    ? "This project changed underneath the run, so the cut was not saved. Reload and try again."
                    : "The cut could not be saved. Your timeline still shows the edit — reload to see what is stored.",
                },
                transient: true,
              })
            }
          },
        })
      )
    },
    onError: (error) => {
      console.error("[editor agent] run failed:", error)
      return "The cut failed partway through. Anything already applied is still there."
    },
    /**
     * The lock comes off here and nowhere else.
     *
     * `onFinish` runs on a clean end, an abort and a thrown error alike, which
     * is the only property that matters: a run that dies holding the lock
     * leaves the project permanently read-only, and the user's only recourse
     * is a support message.
     */
    onFinish: async () => {
      try {
        await unlockProject(id, session.user.id)
      } catch (cause) {
        console.error(`[editor agent] could not unlock ${id}:`, cause)
      }
    },
  })

  return createUIMessageStreamResponse({ stream })
}

function isVideo(element: { kind: string }): element is VideoElement {
  return element.kind === "video"
}

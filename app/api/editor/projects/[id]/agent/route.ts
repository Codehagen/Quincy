import {
  convertToModelMessages,
  createIdGenerator,
  createUIMessageStream,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
} from "ai"

import { getAsset } from "@/lib/editor/assets"
import { currentScene } from "@/lib/editor/document"
import {
  createRun,
  describeScene,
  dryRun,
  editorTools,
  type CommitMeta,
} from "@/lib/editor/agent"
import { gateLedger, GATED_TOOLS, type GateLedger } from "@/lib/editor/gate"
import {
  AGENT_COOLDOWN_MS,
  AGENT_TAG,
  answeredQuestion,
  CONTINUE_WINDOW_MS,
  continueTag,
  gateRecords,
  knownToolCalls,
  sameClips,
  type GateRecord,
} from "@/lib/editor/agent-guards"
import { tokenMeter } from "@/lib/editor/meter"
import { needsCheck } from "@/lib/editor/self-check"
import type { CutsMessage } from "@/lib/editor/stream-parts"
import { threeCutsResponse } from "@/lib/editor/three-cuts-run"
import { signOffer } from "@/lib/editor/self-check-server"
import { signGateRecord, toolApprovalSecret } from "@/lib/editor/server-keys"
import type { EditOp } from "@/lib/editor/ops"
import {
  getProject,
  lockProject,
  saveDocument,
  unlockProject,
  RevisionConflictError,
  type VideoProjectRow,
} from "@/lib/editor/projects"
import { findMainTrack } from "@/lib/editor/timeline"
import { wordsFromDeepgram } from "@/lib/editor/transcript"
import type { Scene, VideoElement } from "@/lib/editor/types"
import { cooldownDecision } from "@/lib/cooldown"
import {
  isEntitled,
  paywallResponse,
  resolveEntitlementForRequest,
} from "@/lib/entitlement"
import { ceilingVerdict, inputVerdict } from "@/lib/chat-guards"
import { getSession } from "@/lib/session"
import { recordUsage, spendCooldown, summariseUsage } from "@/lib/usage"
import { EDITOR_AGENT_ATTEMPT } from "@/lib/usage-attempts"

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

/** Development replays write no usage rows, so these stand in for them. */
const replayStarted = new Map<string, number>()
const replayContinued = new Set<string>()

const SYSTEM = `You are the cutting room inside Quincy, editing one video project with the person who recorded it.

You edit by calling tools. Never describe an edit you have not made — call the tool and then say what happened. Your tools change the same timeline the user is looking at, and every change they make lands live in front of them.

Rules that matter:
- The user's cut is theirs. Do one thing they asked for, not the four you would also do. If a request is broad ("make this good"), do the obvious first step and say what else you would suggest.
- A tool that reports it changed nothing changed nothing. Say so plainly rather than claiming success.
- Reframing fills the new frame by cropping around the centre, so a wide take made vertical keeps the speaker and loses the sides. For a screen recording, where the sides matter, pass show: "whole" to fit the whole picture with bars, and say so.
- Captions are built from the transcript and are not automatic. If someone asks why there are no captions, that is the answer.
- Be brief. Two sentences after a cut lands, not a paragraph. Lead with what changed, in words: the run's summary line already shows the number of edits and the length before and after, so do not repeat numbers.
- To remove several clips, name them all in one delete_clip call.
- "Tighten" means the pauses (remove_silences). Filler sounds (um, uh, øh) go with remove_fillers when the person asks for them; "liksom" and "altså" stay unless they name those words.
- A large cut (more than 30% of the take, or whole spoken sentences) waits for the person's answer. When they say no, do not try it again; say you left it as it was and offer a smaller cut.
- No preamble, no restating the request, no "great question".`

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()

  if (!session) {
    return Response.json({ error: "Not signed in." }, { status: 401 })
  }

  /**
   * Development only: play the model's part from a script (replay-model.ts),
   * so the cursor and the gate can be watched on a real project without a
   * model call. Never in production, whatever the request says. A replay
   * calls no model, so the entitlement gate below does not apply to it; the
   * test account has no plan, and the replay is how the motion is checked.
   */
  const replay =
    process.env.NODE_ENV !== "production" &&
    new URL(request.url).searchParams.get("replay") === "1"

  // The money gate, above the body parse and above the lock — a request that
  // cannot spend must not take the document hostage either.
  if (!replay) {
    const entitlement = await resolveEntitlementForRequest(session.user)

    if (!isEntitled(entitlement)) {
      return paywallResponse(entitlement)
    }
  }

  if (!replay && !process.env.AI_GATEWAY_API_KEY) {
    return Response.json(
      { error: "AI_GATEWAY_API_KEY is not set. Add it to .env.local." },
      { status: 503 }
    )
  }

  const { id } = await params

  let body: { messages?: CutsMessage[]; mode?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 })
  }

  const messages = body.messages ?? []

  /**
   * The same two ceilings /api/chat carries, and this route needs them more.
   *
   * `MAX_STEPS` below bounds one run's *tool* loop and nothing else: it says a
   * request may call the model eight times, not that a day may hold a hundred
   * such requests. Until now the only thing between this endpoint and an
   * unbounded bill was the entitlement check, which asks whether you may spend
   * and never how much — so a trialling account with a script could spend a
   * day's worth of a paid plan in a few minutes, eight calls at a time.
   *
   * Ordered like the chat route, cheapest first: the input verdict is free and
   * in-process, the ceiling is one aggregate query. Both sit above `getProject`
   * and above the lock, because a request that is not allowed to spend must not
   * take the document hostage on its way to being refused.
   */
  const verdict = inputVerdict(messages)
  if (!verdict.ok) {
    return Response.json({ error: verdict.error }, { status: 413 })
  }

  /**
   * Three cuts from one recording (plans/036, phase D): one orchestrating run
   * under this project's one lock, with its own cooldown and a ceiling that
   * must cover all three cuts before any starts (lib/editor/three-cuts-run.ts).
   */
  if (body.mode === "three-cuts") {
    return threeCutsResponse({
      request,
      projectId: id,
      userId: session.user.id,
      replay,
      model: MODEL,
      system: SYSTEM,
      maxSteps: MAX_STEPS,
      runId: generateRunId(),
      messageId: generateMessageId(),
    })
  }

  // Rolling 24 hours rather than the calendar day, so a session either side of
  // midnight cannot spend the ceiling twice. Counts every model call the
  // account made, this route's and the chat's alike — see lib/chat-guards.ts.
  const spent = await summariseUsage(
    session.user.id,
    new Date(Date.now() - 24 * 60 * 60 * 1000)
  )
  const ceiling = ceilingVerdict(spent.costMicros)
  if (!ceiling.ok) {
    return Response.json(
      { error: ceiling.error, state: "ceiling" },
      { status: 429 }
    )
  }

  // Signed with a key derived from the server secret; read here, above the
  // lock, so a missing secret refuses the request before it holds anything.
  const approvalSecret = toolApprovalSecret()

  /**
   * The cooldown (see agent-guards.ts), skipped once for the browser's
   * automatic continuation after the person answers a gate question.
   */
  const records = gateRecords(messages)
  const answering = answeredQuestion(messages, records)
  const userId = session.user.id
  const answerTag = answering === null ? null : continueTag(answering)
  const continuing =
    answerTag !== null &&
    (replay
      ? !replayContinued.has(`${userId}|${answerTag}`)
      : (await spendCooldown(userId, answerTag, CONTINUE_WINDOW_MS)).ready)

  if (!continuing) {
    const cooldown = replay
      ? cooldownDecision(
          replayStarted.has(userId) ? new Date(replayStarted.get(userId)!) : null,
          AGENT_COOLDOWN_MS
        )
      : await spendCooldown(userId, AGENT_TAG, AGENT_COOLDOWN_MS)
    if (!cooldown.ready) {
      const s = cooldown.secondsLeft
      return Response.json(
        {
          error: `Quincy is still on the last cut. Try again in ${s} ${s === 1 ? "second" : "seconds"}.`,
          state: "cooldown",
          secondsLeft: s,
        },
        { status: 429 }
      )
    }
  }

  const project = await getProject(id, userId)
  if (!project) {
    return Response.json({ error: "No such project." }, { status: 404 })
  }

  const runId = generateRunId()

  // Claimed before anything expensive starts. The claim is a conditional UPDATE
  // rather than a read-then-write, because two runs arriving together is
  // precisely the case a lock exists to prevent.
  if (!(await lockProject(id, userId, runId))) {
    return Response.json(
      { error: "Something is already cutting this project." },
      { status: 409 }
    )
  }

  /**
   * From here until the stream exists, a throw would leave the project
   * locked: the `onFinish` that unlocks belongs to the stream. So everything
   * in between gives the lock back on its way out.
   */
  try {
    // The attempt rows the cooldown reads, written the moment the run is ours.
    if (replay) {
      replayStarted.set(userId, Date.now())
      if (continuing && answerTag) replayContinued.add(`${userId}|${answerTag}`)
    } else {
      const attempt = { userId, model: EDITOR_AGENT_ATTEMPT, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 }
      await recordUsage({ ...attempt, conversationId: AGENT_TAG })
      if (continuing && answerTag) {
        await recordUsage({ ...attempt, conversationId: answerTag })
      }
    }

    return startRun({
      id,
      userId,
      runId,
      replay,
      project,
      messages,
      records,
      approvalSecret,
      signal: request.signal,
    })
  } catch (cause) {
    console.error(`[editor agent] could not start on ${id}:`, cause)
    await unlockProject(id, userId, runId).catch(() => {})
    return Response.json({ error: "The cut could not start." }, { status: 500 })
  }
}

/** The run itself, once the lock is held and the attempt is logged. */
function startRun({
  id,
  userId,
  runId,
  replay,
  project,
  messages,
  records,
  approvalSecret,
  signal,
}: {
  id: string
  userId: string
  runId: string
  replay: boolean
  project: VideoProjectRow
  messages: CutsMessage[]
  records: Map<string, GateRecord>
  approvalSecret: string
  /** The request's, so Stop ends the model call and not only the stream. */
  signal: AbortSignal
}): Response {
  const startedAtRevision = project.revision
  const scene = currentScene(project.document)

  /** What this run changed, for whether it earns the self-check. */
  const committedTools = new Set<string>()

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
    onCommit: (ops, meta) => {
      if (meta?.toolName) committedTools.add(meta.toolName)
      streamOps(ops, meta)
    },
    loadWords: async () => {
      const clip = scene && findMainTrack(scene)?.elements.find(isVideo)
      if (!clip) return null

      const asset = await getAsset(clip.mediaId, userId)
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
  let streamOps: (ops: EditOp[], meta?: CommitMeta) => void = () => {}

  /**
   * Tool calls the browser already knows about. The SDK re-evaluates the
   * approval policy when an approved call is replayed, and the question must
   * not be asked a second time.
   */
  const knownCalls = knownToolCalls(messages)

  /** The run's gate, made on the first measured call (it needs the words). */
  let ledger: GateLedger | null = null

  /**
   * What the run spent, step by step, metered once whatever ends it: the
   * stream's `onEnd` on a clean finish, the outer `onFinish` when Stop or a
   * throw means `onEnd` never comes.
   */
  const meter = tokenMeter()
  let metered = false
  const recordSpend = async () => {
    // A replay calls no model, so there is nothing to meter.
    if (replay || metered) return
    metered = true
    try {
      await recordUsage({
        userId,
        conversationId: `project:${id}`,
        model: MODEL,
        ...meter.total(),
      })
    } catch (cause) {
      console.error("[editor agent] could not record usage:", cause)
    }
  }

  const stream = createUIMessageStream<CutsMessage>({
    /**
     * The conversation so far, so the stream knows which message it carries
     * on. With an `onFinish` the stream assembles the message itself, and the
     * run that follows a yes appends to the message that asked: without the
     * history, the approved call's result names a call it has never seen,
     * and the stream ends in an error after the cut has already landed.
     */
    originalMessages: messages,
    execute: async ({ writer }) => {
      streamOps = (ops, meta) =>
        writer.write({
          type: "data-ops",
          data: { ops, toolCallId: meta?.toolCallId, toolName: meta?.toolName },
          // Transient: the browser applies these to its own document and the
          // document is what persists. Keeping them in the message history
          // would mean a reload replays every edit of every past run on top of
          // a project that already has them.
          transient: true,
        })

      const result = streamText({
        model: replay
          ? (await import("@/lib/editor/replay-model")).replayModel(scene)
          : MODEL,
        system: scene
          ? `${SYSTEM}\n\nThe cut as it stands: ${describeScene(scene)}`
          : SYSTEM,
        messages: await convertToModelMessages(messages),
        tools: editorTools(run),
        stopWhen: isStepCount(MAX_STEPS),
        /**
         * Stop closes the browser's side of the stream, and on its own that
         * ends only the reading: the model call upstream would run to its
         * last step and bill for all of them. Tied to the request, the call
         * ends with it. The steps that finished before the abort are already
         * in the meter (`onStepEnd`), and `onFinish` below records them.
         */
        abortSignal: signal,
        /**
         * Without it the SDK takes an approval replayed from the browser at
         * its word, input included: a client could approve its own call.
         * With it, every approval request is signed when it is issued, and a
         * yes that does not carry that signature never runs.
         */
        experimental_toolApprovalSecret: approvalSecret,
        onStepEnd: (step) => meter.add(step.usage),
        /**
         * The gate. A tool that could remove speech is dry-run against the
         * working scene with the same builder its execute uses; if this run's
         * cuts together would remove more than 30% of the take or whole spoken
         * sentences, the call waits for the person instead of landing. The
         * reason, in words, rides beside the request as a data part, because
         * the SDK's approval request carries no text of its own.
         */
        toolApproval: async ({ toolCall }) => {
          if (!GATED_TOOLS.has(toolCall.toolName)) return undefined

          const current = currentScene(run.snapshot().document)
          if (!current || !scene) return undefined

          const gate = (ledger ??= gateLedger({
            start: scene,
            words: await run.words(),
          }))
          const call = {
            toolName: toolCall.toolName,
            scene: current,
            build: (on: Scene) => dryRun(toolCall.toolName, toolCall.input, on),
          }

          /**
           * A call the browser already holds is the person's answer coming
           * back. It runs only if it would still remove the clips the
           * question was about: the timeline is the person's again between
           * the question and the answer, and "delete clip 3" names a
           * position, not a clip.
           */
          if (knownCalls.has(toolCall.toolCallId)) {
            const record = records.get(toolCall.toolCallId)
            if (!record || !sameClips(record.clipIds, gate.peek(call))) {
              return {
                type: "denied",
                reason:
                  "The cut changed after I asked, so I left it as it was. Ask again on the cut as it is now.",
              }
            }
            gate.judge({ ...call, accepted: true })
            return "user-approval"
          }

          const { verdict } = gate.judge(call)
          if (!verdict.ask) return undefined

          writer.write({
            type: "data-gate",
            id: toolCall.toolCallId,
            data: {
              toolCallId: toolCall.toolCallId,
              reason: verdict.reason,
              sentences: verdict.sentences,
              percent: verdict.percent,
              clipIds: verdict.clipIds,
              signature: signGateRecord(toolCall.toolCallId, verdict.clipIds),
            },
          })
          return "user-approval"
        },
      })

      writer.merge(
        toUIMessageStream({
          stream: result.stream,
          originalMessages: messages,
          generateMessageId,
          onEnd: async () => {
            await recordSpend()

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
                userId,
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

              // The self-check (plans/036, phase C): only a run that changed
              // the picture or captions is offered one, and the offer is
              // signed so the check route can hold it to one per run. The
              // lock comes off first: a browser that posts the check the
              // moment the offer lands would otherwise meet this run's lock
              // and be refused.
              if (needsCheck(committedTools)) {
                await unlockProject(id, userId, runId)
                writer.write({
                  type: "data-check",
                  data: { offer: signOffer(id, runId) },
                  transient: true,
                })
              }
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
     * The lock comes off here, on a clean end, an abort and a thrown error
     * alike — and only this run's lock, by its id, so it cannot release one
     * a self-check took after the offer went out. A run the platform kills
     * outright never reaches this; `LOCK_STALE_MS` (projects.ts) frees that
     * one.
     */
    onFinish: async () => {
      await recordSpend()
      try {
        await unlockProject(id, userId, runId)
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

import {
  createIdGenerator,
  createUIMessageStream,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  type LanguageModel,
  type UIMessageStreamWriter,
} from "ai"

import { ceilingCovers } from "../chat-guards"
import { cooldownDecision } from "../cooldown"
import { recordUsage, spendCooldown, summariseUsage } from "../usage"
import { EDITOR_THREE_CUTS_ATTEMPT } from "../usage-attempts"
import { createRun, describeScene, dryRun, editorTools, scopedTo } from "./agent"
import { getAsset } from "./assets"
import { gateLedger, GATED_TOOLS, type GateLedger } from "./gate"
import { currentScene } from "./document"
import { tokenMeter } from "./meter"
import { getProject, lockProject, saveDocument, unlockProject } from "./projects"
import { readTake, strongLineSlot } from "./reading"
import { CHECK_MODEL, needsCheck } from "./self-check"
import { signOffer } from "./self-check-server"
import type { CutsMessage } from "./stream-parts"
import { findMainTrack, sceneDurationUs } from "./timeline"
import { wordsFromTranscript, type Word } from "./transcript"
import {
  briefsFor,
  copyScene,
  cutName,
  cutUsageTag,
  recommend,
  THREE_CUTS_COOLDOWN_MS,
  threeCutsNeedMicros,
  threeCutsTag,
  threeCutsUserTag,
  type CutBrief,
  type CutOutcome,
} from "./three-cuts"
import type { Scene, VideoDocument } from "./types"

/**
 * Three cuts from one recording, as one run (plans/036, phase D).
 *
 * **One lock, three sub-runs.** The request takes the project lock once and
 * makes three scenes, then cuts them in parallel: three model loops, each
 * with the editor's own tools scoped to its scene over one shared working
 * snapshot. Every `data-ops` part names its scene, so the browser hands it
 * to that cut's cursor. At the end it saves three times in a row, one scene
 * per save: one revision per cut, so each can be undone on its own.
 *
 * **Money (AGENTS.md).** Before anything starts: a 60 s cooldown per project
 * and another per person, across projects (the attempt log is two zero-cost
 * `usage_event` rows written once the lock is held), and the day's ceiling
 * must cover three runs at their step cap plus three checks. Each sub-run
 * keeps the per-run step cap and writes its own `usage_event` row, failed or
 * not, counted step by step so Stop does not zero it. Replay (development)
 * calls no model and writes no row; an in-memory map stands in for the
 * cooldown's log.
 */

const newSceneId = createIdGenerator({ prefix: "vs", size: 16 })

/** Development replays: when each cooldown tag was last started. */
const replayStarted = new Map<string, number>()

export type ThreeCutsOptions = {
  request: Request
  projectId: string
  userId: string
  replay: boolean
  model: string
  system: string
  maxSteps: number
  runId: string
  messageId: string
  /**
   * Tests only: the model object each cut runs on, in place of the gateway
   * slug. The route never passes it.
   */
  languageModel?: (scene: Scene | undefined) => LanguageModel
}

export async function threeCutsResponse(o: ThreeCutsOptions): Promise<Response> {
  // The cooldowns, cheapest first: two indexed reads (none in replay). Per
  // project alone, a person with three projects open could start three
  // three-cuts runs in a row; the per-person tag closes that.
  const [perProject, perUser] = o.replay
    ? [replayCooldown(o.userId, threeCutsTag(o.projectId)), replayCooldown(o.userId, threeCutsUserTag())]
    : await Promise.all([
        spendCooldown(o.userId, threeCutsTag(o.projectId), THREE_CUTS_COOLDOWN_MS),
        spendCooldown(o.userId, threeCutsUserTag(), THREE_CUTS_COOLDOWN_MS),
      ])
  const cooldown = !perProject.ready ? perProject : perUser
  if (!cooldown.ready) {
    const s = cooldown.secondsLeft
    return Response.json(
      { error: `Three cuts were made a moment ago. Try again in ${s} ${s === 1 ? "second" : "seconds"}.`, state: "cooldown", secondsLeft: s },
      { status: 429 }
    )
  }

  // The ceiling must cover all of it, before it starts.
  const spent = await summariseUsage(o.userId, new Date(Date.now() - 24 * 60 * 60 * 1000))
  const need = threeCutsNeedMicros({ runModel: o.model, checkModel: CHECK_MODEL, maxSteps: o.maxSteps })
  const ceiling = ceilingCovers(spent.costMicros, need)
  if (!ceiling.ok) {
    return Response.json({ error: ceiling.error, state: "ceiling" }, { status: 429 })
  }

  const project = await getProject(o.projectId, o.userId)
  if (!project) return Response.json({ error: "No such project." }, { status: 404 })

  const base = currentScene(project.document)
  const clip = base && findMainTrack(base)?.elements.find((e) => e.kind === "video")
  if (!base || !clip || clip.kind !== "video") {
    return Response.json({ error: "There is no footage to cut three ways." }, { status: 400 })
  }

  if (!(await lockProject(o.projectId, o.userId, o.runId))) {
    return Response.json({ error: "Something is already cutting this project." }, { status: 409 })
  }

  // From the lock until the stream exists, a throw must give the lock back:
  // the `onFinish` that unlocks belongs to the stream.
  let words: Word[] | null
  let briefs: CutBrief[]
  try {
    // The attempt log the cooldowns read, written the moment the run is ours.
    if (o.replay) {
      replayStarted.set(`${o.userId}|${threeCutsTag(o.projectId)}`, Date.now())
      replayStarted.set(`${o.userId}|${threeCutsUserTag()}`, Date.now())
    } else {
      const attempt = { userId: o.userId, model: EDITOR_THREE_CUTS_ATTEMPT, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 }
      await recordUsage({ ...attempt, conversationId: threeCutsTag(o.projectId) })
      await recordUsage({ ...attempt, conversationId: threeCutsUserTag() })
    }

    const asset = await getAsset(clip.mediaId, o.userId)
    words = asset?.transcript ? wordsFromTranscript(asset.transcript) : null
    const slot = strongLineSlot(asset?.transcript)
    briefs = briefsFor({
      durationUs: sceneDurationUs(base),
      firstLine: words ? readTake(words, sceneDurationUs(base)).firstLine : null,
      strongLine: slot?.state === "done" ? slot.line : null,
    })
  } catch (cause) {
    await unlockProject(o.projectId, o.userId, o.runId).catch(() => {})
    console.error("[three cuts] could not start:", cause)
    return Response.json({ error: "Three cuts could not start." }, { status: 500 })
  }

  const stream = createUIMessageStream<CutsMessage>({
    execute: ({ writer }) => cutThree({ ...o, writer, document: project.document, revision: project.revision, base, briefs, words }),
    onError: (error) => {
      console.error("[three cuts] run failed:", error)
      return "The cuts failed partway through. Anything already applied is still there."
    },
    onFinish: async () => {
      try {
        await unlockProject(o.projectId, o.userId, o.runId)
      } catch (cause) {
        console.error(`[three cuts] could not unlock ${o.projectId}:`, cause)
      }
    },
  })
  return createUIMessageStreamResponse({ stream })
}

async function cutThree(
  o: ThreeCutsOptions & {
    writer: UIMessageStreamWriter<CutsMessage>
    document: VideoDocument
    revision: number
    base: Scene
    briefs: CutBrief[]
    words: Word[] | null
  }
) {
  const { writer } = o
  writer.write({ type: "start", messageId: o.messageId })

  const run = createRun({
    initial: {
      document: o.document,
      revision: o.revision,
      lock: { status: "locked", runId: o.runId, lockedBy: "agent", startedAt: new Date().toISOString() },
    },
    runId: o.runId,
    onCommit: (ops, meta) =>
      writer.write({ type: "data-ops", data: { ops, toolCallId: meta?.toolCallId, toolName: meta?.toolName, sceneId: meta?.sceneId }, transient: true }),
    loadWords: async () => o.words,
  })

  // The three scenes, each a copy of the cut as it stands. A is put on screen.
  const cuts = o.briefs.map((brief) => ({ brief, sceneId: newSceneId() }))
  writer.write({
    type: "data-cuts",
    data: {
      leadId: cuts[0].sceneId,
      cuts: cuts.map(({ brief, sceneId }) => ({ sceneId, letter: brief.letter, name: cutName(brief), where: brief.where, hook: brief.hook, lengthS: brief.lengthS })),
    },
  })
  for (const [index, { brief, sceneId }] of cuts.entries()) {
    run.commit(
      [
        { op: "add_scene", scene: copyScene(o.base, sceneId, cutName(brief)) },
        ...(index === 0 ? [{ op: "select_scene" as const, sceneId }] : []),
      ],
      { toolName: "add_scene", toolCallId: `cut-${brief.letter}`, sceneId }
    )
  }

  const settled = await Promise.allSettled(cuts.map((cut) => cutOne(o, run, cut)))
  const outcomes: (CutOutcome & { sceneId: string; checked: boolean })[] = cuts.map((cut, index) => {
    const result = settled[index]
    const value = result.status === "fulfilled" ? result.value : { landed: false, checked: false }
    return { ...value, brief: cut.brief, sceneId: cut.sceneId, scene: run.snapshot().document.scenes.find((s) => s.id === cut.sceneId) }
  })

  // One revision per cut: A, then B, then C, each save adding one scene.
  let revision = o.revision
  const finalDoc = run.snapshot().document
  for (const [index, outcome] of outcomes.entries()) {
    const kept = new Set(outcomes.slice(0, index + 1).map((x) => x.sceneId))
    const document: VideoDocument = {
      ...finalDoc,
      scenes: finalDoc.scenes.filter((s) => !cuts.some((c) => c.sceneId === s.id) || kept.has(s.id)),
    }
    try {
      revision = (await saveDocument(o.projectId, o.userId, document, revision)).revision
    } catch (cause) {
      console.error(`[three cuts] could not save ${o.projectId}:`, cause)
      writer.write({ type: "data-run-failed", data: { message: "The cuts could not be saved. Reload to see what is stored." }, transient: true })
      return
    }
    writer.write({ type: "data-saved", data: { revision, sceneId: outcome.sceneId }, transient: true })
    if (outcome.checked) {
      writer.write({
        type: "data-check",
        data: { offer: signOffer(o.projectId, `${o.runId}-${outcome.brief.letter}`, Date.now(), outcome.sceneId), sceneId: outcome.sceneId },
        transient: true,
      })
    }
  }

  const pick = recommend(outcomes, o.words)
  if (pick) writer.write({ type: "data-recommend", data: pick })
  writer.write({ type: "finish" })
}

/** One cut: a model loop over the editor's tools, scoped to its scene, metered. */
async function cutOne(
  o: ThreeCutsOptions & { writer: UIMessageStreamWriter<CutsMessage> },
  run: ReturnType<typeof createRun>,
  cut: { brief: CutBrief; sceneId: string }
): Promise<{ landed: boolean; checked: boolean }> {
  const scoped = scopedTo(run, cut.sceneId)
  const committed = new Set<string>()
  const context = { ...scoped, commit: (...args: Parameters<typeof scoped.commit>) => {
    if (args[1]?.toolName) committed.add(args[1].toolName)
    scoped.commit(...args)
  } }
  const scene = () => run.snapshot().document.scenes.find((s) => s.id === cut.sceneId)

  let say = ""
  // Counted as each step ends, so a cut stopped or failed halfway still
  // meters the steps it paid for (meter.ts).
  const meter = tokenMeter()
  let ledger: GateLedger | null = null
  try {
    const result = streamText({
      model: o.languageModel
        ? o.languageModel(scene())
        : o.replay
          ? (await import("./replay-model")).replayModel(scene(), { seed: cut.brief.letter.charCodeAt(0) })
          : o.model,
      system: `${o.system}\n\nThe cut as it stands: ${describeScene(scene()!)}`,
      messages: [{ role: "user", content: cut.brief.prompt }],
      tools: editorTools(context),
      stopWhen: isStepCount(o.maxSteps),
      abortSignal: o.request.signal,
      onStepEnd: (step) => meter.add(step.usage),
      // No one is there to answer a question mid-way through three cuts, so
      // a cut the gate would ask about is not made; the cut says so.
      toolApproval: async ({ toolCall }) => {
        if (!GATED_TOOLS.has(toolCall.toolName)) return undefined
        const current = scene()
        if (!current) return undefined
        // Measured across the cut's whole loop, against its scene as it began
        // (gate.ts): a cut that removes a fifth twice has removed two fifths.
        const gate = (ledger ??= gateLedger({ start: current, words: await run.words() }))
        const { verdict } = gate.judge({
          toolName: toolCall.toolName,
          scene: current,
          build: (on) => dryRun(toolCall.toolName, toolCall.input, on),
        })
        return verdict.ask ? { type: "denied", reason: `${verdict.reason} Ask for it in this cut on its own.` } : undefined
      },
    })
    say = await result.text
  } catch (cause) {
    console.error(`[three cuts] cut ${cut.brief.letter} failed:`, cause)
  } finally {
    // Metered whether or not the loop finished: whatever it called was spent.
    if (!o.replay) {
      await recordUsage({ userId: o.userId, conversationId: cutUsageTag(o.projectId, cut.brief.letter), model: o.model, ...meter.total() }).catch((cause) =>
        console.error("[three cuts] could not record usage:", cause)
      )
    }
  }

  const landed = committed.size > 0
  o.writer.write({ type: "data-cut-done", id: cut.sceneId, data: { sceneId: cut.sceneId, letter: cut.brief.letter, say, landed } })
  return { landed, checked: needsCheck(committed) }
}

function replayCooldown(userId: string, tag: string) {
  const last = replayStarted.get(`${userId}|${tag}`)
  return cooldownDecision(last === undefined ? null : new Date(last), THREE_CUTS_COOLDOWN_MS)
}

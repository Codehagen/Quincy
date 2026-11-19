import { ceilingVerdict } from "@/lib/chat-guards"
import { createRun } from "@/lib/editor/agent"
import {
  getProject,
  lockProject,
  saveDocument,
  unlockProject,
} from "@/lib/editor/projects"
import {
  atLabel,
  CHECK_MODEL,
  checkTag,
  fixSteps,
  MAX_CHECK_FRAMES,
  MAX_FRAME_CHARS,
  type CheckVerdict,
} from "@/lib/editor/self-check"
import {
  alreadyChecked,
  lookAtFrames,
  verifyOffer,
} from "@/lib/editor/self-check-server"
import type { EditOp } from "@/lib/editor/ops"
import {
  isEntitled,
  paywallResponse,
  resolveEntitlementForRequest,
} from "@/lib/entitlement"
import { getSession } from "@/lib/session"
import { recordUsage, summariseUsage } from "@/lib/usage"

/**
 * The self-check (plans/036, phase C): three frames of the cut Quincy just
 * made, one look by a vision model, and the fixes it asks for, built with
 * the same builders a request uses and saved as one revision.
 *
 * **Money (AGENTS.md).** Spends one model call, so every guard is here:
 * the entitlement gate and the day's ceiling, a signed offer that only a
 * run which changed the picture or captions receives, at most one check per
 * run (the metering row is the attempt log, written for failed calls too),
 * at most MAX_CHECK_FRAMES frames of at most MAX_FRAME_CHARS each, and the
 * project lock so two checks cannot overlap.
 *
 * The frames come inline: three small JPEGs are about 150 KB, far under
 * the platform's 4.5 MB body limit, and an upload would be a second request
 * and a stored object for something looked at once.
 */

export const maxDuration = 60

/** Three frames at the cap, plus the JSON around them. */
const MAX_BODY_CHARS = MAX_CHECK_FRAMES * MAX_FRAME_CHARS + 4_000

/** Development replays: the runs already checked, since a replay writes no usage row. */
const replayChecked = new Set<string>()

type Body = { offer?: unknown; frames?: unknown }
type FrameIn = { atUs: number; dataUrl: string }

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return Response.json({ error: "Not signed in." }, { status: 401 })

  // Development only, as on the agent route: a scripted look, no model call.
  const replay =
    process.env.NODE_ENV !== "production" &&
    new URL(request.url).searchParams.get("replay") === "1"

  if (!replay) {
    const entitlement = await resolveEntitlementForRequest(session.user)
    if (!isEntitled(entitlement)) return paywallResponse(entitlement)
    if (!process.env.AI_GATEWAY_API_KEY) {
      return Response.json({ error: "AI_GATEWAY_API_KEY is not set." }, { status: 503 })
    }
  }

  const { id } = await params

  const raw = await request.text()
  if (raw.length > MAX_BODY_CHARS) {
    return Response.json({ error: "Too many or too large frames." }, { status: 413 })
  }

  let body: Body
  try {
    body = JSON.parse(raw) as Body
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 })
  }

  const frames = parseFrames(body.frames)
  if (!frames) {
    return Response.json(
      { error: `Send 1 to ${MAX_CHECK_FRAMES} JPEG frames.` },
      { status: 400 }
    )
  }

  const offer = typeof body.offer === "string" ? verifyOffer(body.offer) : null
  if (!offer || offer.projectId !== id) {
    return Response.json({ error: "No check is due for this run." }, { status: 403 })
  }

  const spent = await summariseUsage(
    session.user.id,
    new Date(Date.now() - 24 * 60 * 60 * 1000)
  )
  const ceiling = ceilingVerdict(spent.costMicros)
  if (!ceiling.ok) {
    return Response.json({ error: ceiling.error, state: "ceiling" }, { status: 429 })
  }

  const checked = replay
    ? replayChecked.has(offer.runId)
    : await alreadyChecked(session.user.id, offer.runId)
  if (checked) {
    return Response.json({ error: "This run has been checked." }, { status: 409 })
  }

  const project = await getProject(id, session.user.id)
  if (!project) return Response.json({ error: "No such project." }, { status: 404 })

  const checkRunId = `check-${offer.runId}`
  if (!(await lockProject(id, session.user.id, checkRunId))) {
    return Response.json({ error: "Something is already cutting this project." }, { status: 409 })
  }

  try {
    const document = project.document
    // A three-cuts sub-run's offer names its cut; any other run's, the scene on screen.
    const scene = offer.sceneId
      ? document.scenes.find((s) => s.id === offer.sceneId)
      : (document.scenes.find((s) => s.id === document.currentSceneId) ?? document.scenes[0])
    if (!scene) return Response.json({ error: "The project has no cut." }, { status: 404 })

    let verdict: CheckVerdict
    if (replay) {
      replayChecked.add(offer.runId)
      verdict = (await import("@/lib/editor/replay-model")).replayCheck(scene, frames.length)
    } else {
      let usage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 }
      try {
        const answer = await lookAtFrames(
          frames.map((f) => ({ dataUrl: f.dataUrl, atLabel: atLabel(f.atUs) })),
          request.signal
        )
        usage = answer.usage
        verdict = answer.verdict
      } finally {
        // Metered whether or not the call answered: the row is also the
        // attempt log that refuses a second check of this run.
        await recordUsage({
          userId: session.user.id,
          conversationId: checkTag(offer.runId, frames.length),
          model: CHECK_MODEL,
          ...usage,
        })
      }
    }

    const canvasHeight = (scene.canvas ?? document.settings.canvas).height
    const steps = fixSteps(scene, verdict, canvasHeight)

    let revision: number | null = null
    const landed: { toolName: string; ops: EditOp[] }[] = []
    if (steps.length > 0) {
      const run = createRun({
        initial: {
          document,
          revision: project.revision,
          lock: {
            status: "locked",
            runId: checkRunId,
            lockedBy: "agent",
            startedAt: new Date().toISOString(),
          },
        },
        runId: checkRunId,
        onCommit: () => {},
        loadWords: async () => null,
      })
      for (const step of steps) {
        run.commit(step.ops, { toolName: step.toolName })
        landed.push(step)
      }
      revision = (
        await saveDocument(id, session.user.id, run.snapshot().document, project.revision)
      ).revision
    }

    return Response.json({
      frames: verdict.frames
        .filter((f) => f.index < frames.length)
        .map((f) => ({ atUs: frames[f.index].atUs, note: f.note })),
      say: verdict.say,
      sceneId: scene.id,
      steps: landed,
      revision,
    })
  } catch (cause) {
    console.error(`[editor check] ${id} failed:`, cause)
    return Response.json({ error: "Quincy could not look at the cut this time." }, { status: 502 })
  } finally {
    try {
      await unlockProject(id, session.user.id)
    } catch (cause) {
      console.error(`[editor check] could not unlock ${id}:`, cause)
    }
  }
}

function parseFrames(value: unknown): FrameIn[] | null {
  if (!Array.isArray(value)) return null
  if (value.length === 0 || value.length > MAX_CHECK_FRAMES) return null
  const frames: FrameIn[] = []
  for (const item of value) {
    if (typeof item !== "object" || item === null) return null
    const { atUs, dataUrl } = item as Record<string, unknown>
    if (typeof atUs !== "number" || !Number.isFinite(atUs) || atUs < 0) return null
    if (typeof dataUrl !== "string" || dataUrl.length > MAX_FRAME_CHARS) return null
    if (!dataUrl.startsWith("data:image/jpeg;base64,")) return null
    frames.push({ atUs, dataUrl })
  }
  return frames
}

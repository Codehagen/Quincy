import { z } from "zod"

import { cropSpine } from "./edits"
import { aimed, type EditOp, type OpTarget } from "./ops"
import { sceneDurationUs } from "./timeline"
import type { CaptionElement, Scene } from "./types"

/**
 * The self-check (plans/036, phase C): after a run that changed the picture
 * or the captions, Quincy looks at three frames of its own cut and fixes what
 * it sees, such as a caption sitting over a face.
 *
 * Pure and client-safe. The model call, the token and the meter live in
 * self-check-server.ts; the frames are grabbed in the browser
 * (components/editor/self-check).
 */

/**
 * The vision model, in one place. Cheap, vision-capable, priced in
 * lib/pricing.ts (read off the gateway).
 */
export const CHECK_MODEL = "openai/gpt-5.6-luna"

/** The ceiling: frames one check may look at. */
export const MAX_CHECK_FRAMES = 3

/** One frame is a JPEG of at most 512px on the long edge, as a data URL. */
export const FRAME_LONG_EDGE = 512
/** A 512px JPEG at 0.7 is 30–60 KB; anything past this is not one of ours. */
export const MAX_FRAME_CHARS = 160_000

/** How long a run's offer to check stays good. */
export const CHECK_OFFER_TTL_MS = 10 * 60 * 1000

/**
 * The tools whose edits change what is on screen: the picture or the
 * captions. A run that only cut pauses or clips leaves every frame as it
 * was, so there is nothing new to look at and the check does not run.
 */
export const CHECKED_TOOLS: ReadonlySet<string> = new Set([
  "add_captions",
  "reframe",
  "crop",
  "punch_in",
  "apply_look",
])

/** Whether a run that committed these tools earns a look at its frames. */
export function needsCheck(toolNames: Iterable<string>): boolean {
  for (const name of toolNames) if (CHECKED_TOOLS.has(name)) return true
  return false
}

/**
 * Where to look, in scene time: the middle of each changed element or
 * stretch, and spread across the cut when the change was the whole lane
 * (captions, a framing, a look). Never more than MAX_CHECK_FRAMES, never
 * two within half a second of each other.
 */
export function checkTimes(scene: Scene, targets: readonly (OpTarget | null)[]): number[] {
  const end = sceneDurationUs(scene)
  if (end <= 0) return []

  const picks: number[] = []
  let whole = false

  for (const target of targets) {
    if (!target) continue
    if (target.kind === "element" || target.kind === "effect") {
      const element = scene.tracks
        .find((t) => t.id === target.trackId)
        ?.elements.find((e) => e.id === target.elementId)
      if (element) picks.push(element.startUs + element.durationUs / 2)
      else whole = true
    } else if (target.kind === "range") {
      for (const span of target.spans) picks.push((span.startUs + span.endUs) / 2)
    } else {
      whole = true
    }
  }

  const spread = [0.2, 0.5, 0.8].map((f) => f * end)
  const candidates = whole || picks.length === 0 ? [...picks, ...spread] : picks

  const chosen: number[] = []
  for (const at of candidates) {
    const clamped = Math.min(Math.max(0, Math.round(at)), end - 1)
    if (chosen.some((c) => Math.abs(c - clamped) < 500_000)) continue
    chosen.push(clamped)
    if (chosen.length === MAX_CHECK_FRAMES) break
  }
  return chosen.sort((a, b) => a - b)
}

/** What the vision model answers: a note per frame, and at most two fixes. */
export const checkVerdictSchema = z.object({
  frames: z
    .array(
      z.object({
        index: z.number().int().min(0).max(MAX_CHECK_FRAMES - 1),
        note: z.string().max(80).describe("What you saw, in a few plain words."),
      })
    )
    .max(MAX_CHECK_FRAMES),
  captions: z
    .enum(["up", "down"])
    .nullable()
    .describe("Move the captions when they cover a face or the subject; null when they read clear."),
  keep: z
    .enum(["center", "left", "right", "top", "bottom"])
    .nullable()
    .describe("Reframe to keep this part when the speaker is cut off or off centre; null when the framing holds."),
  say: z.string().max(140).describe("One sentence: what you saw and what you fixed."),
})

export type CheckVerdict = z.infer<typeof checkVerdictSchema>

/** One step of a caption move, as a share of the frame's height. */
export const CAPTION_STEP = 0.1
/** How far captions may travel from where the style puts them. */
const CAPTION_RANGE = 0.5

/**
 * Lift or lower every caption by one step. One op on the caption lane, so
 * one press of the cursor; `transform.position.y` is canvas pixels, negative
 * is up (the composition draws it as a translate).
 */
export function moveCaptions(
  scene: Scene,
  direction: "up" | "down",
  canvasHeight: number
): EditOp[] {
  const track = scene.tracks.find((t) => t.kind === "caption" && t.elements.length > 0)
  if (!track) return []

  const step = (direction === "up" ? -1 : 1) * CAPTION_STEP * canvasHeight
  const limit = CAPTION_RANGE * canvasHeight
  let moved = false

  const elements = track.elements.map((element) => {
    if (element.kind !== "caption") return element
    const caption = element as CaptionElement
    const y = Math.max(-limit, Math.min(0, caption.transform.position.y + step))
    if (y === caption.transform.position.y) return element
    moved = true
    return {
      ...caption,
      transform: { ...caption.transform, position: { ...caption.transform.position, y: Math.round(y) } },
    }
  })
  if (!moved) return []

  return aimed(
    [{ op: "replace_elements", sceneId: scene.id, trackId: track.id, elements }],
    { action: "press", kind: "track", trackId: track.id }
  )
}

/**
 * The fixes a verdict asks for, as batches, each one press. Built with the
 * same builders a person's request uses, so a fix is an edit like any other.
 */
export function fixSteps(
  scene: Scene,
  verdict: Pick<CheckVerdict, "captions" | "keep">,
  canvasHeight: number
): { toolName: string; ops: EditOp[] }[] {
  const steps: { toolName: string; ops: EditOp[] }[] = []
  if (verdict.captions) {
    const ops = moveCaptions(scene, verdict.captions, canvasHeight)
    if (ops.length > 0) steps.push({ toolName: "move_captions", ops })
  }
  if (verdict.keep) {
    const ops = cropSpine(scene, { at: verdict.keep })
    if (ops.length > 0) steps.push({ toolName: "crop", ops })
  }
  return steps
}

/** "0:04.2": where a frame sits in the cut, for the model and the alt text. */
export function atLabel(us: number): string {
  const tenths = Math.max(0, Math.floor(us / 100_000))
  const seconds = Math.floor(tenths / 10)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}.${tenths % 10}`
}

/**
 * The `usage_event.conversation_id` a check writes: the run it checked and
 * the frames it looked at. `usage_event` has no metadata column, and this
 * tag is the attempt log the one-check-per-run ceiling reads.
 */
export function checkTag(runId: string, frames: number): string {
  return `${checkTagPrefix(runId)}${frames}f`
}

export function checkTagPrefix(runId: string): string {
  return `check:${runId}:`
}

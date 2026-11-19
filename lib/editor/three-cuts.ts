import { SQUARE_CANVAS, VERTICAL_CANVAS } from "./document"
import { estimateCostMicros } from "../pricing"
import { findMainTrack, sceneDurationUs } from "./timeline"
import type { Word } from "./transcript"
import type { Scene } from "./types"

/**
 * Three cuts from one recording (plans/036, phase D): the parts that need no
 * database and no model, so they can be tested on their own.
 *
 * One request makes three new scenes over the same take, each with a brief
 * (where it goes, the hook, the length), and cuts the three in parallel
 * inside one run. Then it recommends one, in words with its reason, never
 * as a score.
 */

export const CUT_LETTERS = ["A", "B", "C"] as const
export type CutLetter = (typeof CUT_LETTERS)[number]

/**
 * Between two three-cuts requests on one project. A person can press the
 * starter again the moment a run ends, and each press buys three runs; the
 * project lock only stops two from overlapping, it does not slow them down.
 */
export const THREE_CUTS_COOLDOWN_MS = 60_000

/** The `usage_event.conversation_id` of the attempt log the cooldown reads. */
export function threeCutsTag(projectId: string): string {
  return `three-cuts:${projectId}`
}

/** The tag a sub-run's model spend is metered under. */
export function cutUsageTag(projectId: string, letter: CutLetter): string {
  return `three-cuts:${projectId}:${letter}`
}

/** Whether a request names three cuts ("make three cuts", "3 versions"). */
export function asksForThreeCuts(text: string): boolean {
  return /\b(three|3)\s+(cuts|versions|edits|variants)\b/i.test(text)
}

/* ── Money: what one three-cuts request may spend, before it starts ────── */

/**
 * The estimate the day's ceiling must cover before the request starts.
 *
 * Built from the per-run cap, not from what a run usually spends: each
 * sub-run may call the model `maxSteps` times. A step re-sends the system
 * prompt (about 1.5k tokens), the twelve tool schemas (about 3k) and the
 * run so far (tool calls and their prose answers, a few hundred tokens a
 * step), so 8k input tokens is an upper average over an eight-step run, and
 * 500 output tokens covers a step's tool calls plus the closing sentences.
 * Nothing is counted as cached, so the estimate errs high.
 *
 * A check is one call with up to three 512px frames (about 800 tokens each)
 * and the prompt, so 3k input; its output is capped at 600 tokens by
 * `lookAtFrames`.
 */
export const RUN_STEP_INPUT_TOKENS = 8_000
export const RUN_STEP_OUTPUT_TOKENS = 500
export const CHECK_INPUT_TOKENS = 3_000
export const CHECK_OUTPUT_TOKENS = 600

export function threeCutsNeedMicros(options: {
  runModel: string
  checkModel: string
  maxSteps: number
}): number {
  const run = estimateCostMicros(options.runModel, {
    inputTokens: RUN_STEP_INPUT_TOKENS * options.maxSteps,
    cachedInputTokens: 0,
    outputTokens: RUN_STEP_OUTPUT_TOKENS * options.maxSteps,
  })
  const check = estimateCostMicros(options.checkModel, {
    inputTokens: CHECK_INPUT_TOKENS,
    cachedInputTokens: 0,
    outputTokens: CHECK_OUTPUT_TOKENS,
  })
  return CUT_LETTERS.length * (run + check)
}

/* ── The briefs ─────────────────────────────────────────────────────────── */

export type CutBrief = {
  letter: CutLetter
  /** Where it goes. */
  where: string
  /** The line it is built around, in the speaker's words. */
  hook: string | null
  /** Whether the hook is the strong line Quincy chose, or only the first line. */
  hookIsStrong: boolean
  /** The longest it should run, in seconds. */
  lengthS: number
  canvas: { width: number; height: number }
  /** What the sub-run is asked, as the person would ask it. */
  prompt: string
}

/** What the briefs are written from: the reading of the take. */
export type TakeFacts = {
  durationUs: number
  firstLine: string | null
  strongLine: string | null
}

/**
 * Three briefs, in the order Quincy would post them. A is built around the
 * strong line (the first line when none has been chosen) and is the cut
 * Quincy recommends unless it fails to land; B and C are the alternatives a
 * person would want to compare it with.
 */
export function briefsFor(take: TakeFacts): CutBrief[] {
  const takeS = Math.max(1, Math.ceil(take.durationUs / 1_000_000))
  const strong = take.strongLine ?? take.firstLine
  const fit = (seconds: number) => Math.min(seconds, takeS)
  const quote = (line: string | null) => (line ? ` "${line}"` : " the first line")

  return [
    {
      letter: "A",
      where: "Reels and TikTok",
      hook: strong,
      hookIsStrong: take.strongLine !== null,
      lengthS: fit(30),
      canvas: VERTICAL_CANVAS,
      prompt: `Cut A, for Reels and TikTok. Make it vertical, tighten the pauses, add captions word by word, and push in on${quote(strong)}. Keep it under ${fit(30)} s.`,
    },
    {
      letter: "B",
      where: "LinkedIn",
      hook: take.firstLine,
      hookIsStrong: false,
      lengthS: fit(60),
      canvas: SQUARE_CANVAS,
      prompt: `Cut B, for LinkedIn. Make it square, tighten the pauses, and add captions a phrase at a time, starting on${quote(take.firstLine)}. Keep it under ${fit(60)} s.`,
    },
    {
      letter: "C",
      where: "a Shorts teaser",
      hook: strong,
      hookIsStrong: take.strongLine !== null,
      lengthS: fit(15),
      canvas: VERTICAL_CANVAS,
      prompt: `Cut C, a Shorts teaser. Make it vertical, add captions word by word, and fade in at the start, built around${quote(strong)}. Keep it under ${fit(15)} s.`,
    },
  ]
}

/** A new scene over the same take: the cut as it stands, under a new id and name. */
export function copyScene(scene: Scene, id: string, name: string): Scene {
  return { ...scene, id, name, isMain: false }
}

/** The scene's name for a brief: "Cut A · Reels and TikTok". */
export function cutName(brief: Pick<CutBrief, "letter" | "where">): string {
  return `Cut ${brief.letter} · ${brief.where}`
}

/* ── The recommendation, in words ───────────────────────────────────────── */

export type CutOutcome = {
  brief: CutBrief
  scene: Scene | undefined
  /** Whether any edit of this sub-run landed. */
  landed: boolean
}

export type Recommendation = { sceneId: string; letter: CutLetter; reason: string }

/**
 * Which cut to post first, and why, from what the cuts are now.
 *
 * A is recommended whenever it landed, because it is the cut built around
 * the strong line and its cursor led the run; otherwise the first that
 * landed. The reason states only what can be read off the cut: its length
 * against its brief, its frame, and where it pushes in on the hook.
 */
export function recommend(
  outcomes: CutOutcome[],
  words: Word[] | null
): Recommendation | null {
  const pick = outcomes.find((o) => o.landed && o.scene)
  if (!pick?.scene) return null

  const { brief, scene } = pick
  const lengthUs = sceneDurationUs(scene)
  const facts: string[] = []

  facts.push(
    lengthUs <= brief.lengthS * 1_000_000
      ? `it runs ${tenths(lengthUs)}, inside the ${brief.lengthS} s ${brief.where} wants`
      : `it runs ${tenths(lengthUs)}`
  )

  const canvas = scene.canvas
  if (canvas && canvas.width === brief.canvas.width && canvas.height === brief.canvas.height) {
    facts.push(`framed ${canvas.width < canvas.height ? "9:16" : canvas.width === canvas.height ? "1:1" : "16:9"}`)
  }

  const push = brief.hook && words ? pushInOnLine(scene, words, brief.hook) : null
  if (push !== null) {
    facts.push(`it pushes in on ${brief.hookIsStrong ? "the strong line" : "the first line"} at ${tenths(push)}`)
  }

  return {
    sceneId: scene.id,
    letter: brief.letter,
    reason: `I would post ${brief.letter} first: ${joinFacts(facts)}.`,
  }
}

/**
 * Where, in scene time, a zoomed clip plays the first word of `line`; null
 * when no zoomed clip does. The line is matched on its first word's source
 * time, so a cut that moved it still finds it.
 */
export function pushInOnLine(scene: Scene, words: Word[], line: string): number | null {
  const first = line.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "")
  if (!first) return null
  const spoken = words.find(
    (w) => w.text.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "") === first
  )
  if (!spoken) return null

  for (const clip of findMainTrack(scene)?.elements ?? []) {
    if (clip.kind !== "video") continue
    const zoomed = clip.effects.some((e) => e.enabled && e.type === "zoom")
    if (!zoomed) continue
    if (spoken.startUs >= clip.trimStartUs && spoken.startUs < clip.trimEndUs) {
      return clip.startUs + (spoken.startUs - clip.trimStartUs)
    }
  }
  return null
}

function joinFacts(facts: string[]): string {
  if (facts.length <= 1) return facts.join("")
  return `${facts.slice(0, -1).join(", ")} and ${facts.at(-1)}`
}

/** 0:00.8, the transport's precision. */
export function tenths(us: number): string {
  const total = Math.max(0, us)
  const s = Math.floor(total / 1_000_000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}.${Math.floor((total % 1_000_000) / 100_000)}`
}

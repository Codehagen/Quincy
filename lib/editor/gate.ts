import { applyToScene, type EditOp } from "./ops"
import { findMainTrack, sceneDurationUs, sourceToTimelineUs } from "./timeline"
import { us } from "./time"
import { isFiller } from "./fillers"
import type { Word } from "./transcript"
import type { Scene } from "./types"

/**
 * When Quincy asks before it cuts.
 *
 * The owner's rule (plans/036, docs/design/decisions.md "Cuts, decided"):
 * edit without asking unless the change is very large. A run asks only when
 * an edit would remove more than 30 % of the take's length, or remove whole
 * spoken sentences — never fillers or pauses. A large edit asks even on the
 * first run of a project: "very large" is about the footage, not about how
 * long the person has been in the editor. It never asks for pauses, fillers,
 * captions, push-ins, looks, fades or reframes: those tools are exempt by
 * what they are, whatever they would do.
 *
 * Decided on the server by dry-running the tool's own builder against the
 * working scene, so the question is about the ops that would land and not
 * about what the model said it would do. The dry run and the real run build
 * from the same function with the same input; there is no second estimate to
 * disagree with.
 */

/** More of the take than this, removed in one edit, asks first. */
export const GATE_SHARE = 0.3

/**
 * The tools that never ask, by what they are.
 *
 * Listed rather than inferred so a new tool has to be placed: agent.test.ts
 * fails when a tool is neither here nor in `GATED_TOOLS`, because a tool that
 * silently skipped the gate is how a large cut would arrive unasked.
 */
export const EXEMPT_TOOLS = new Set([
  "remove_silences",
  "add_captions",
  "reframe",
  "crop",
  "punch_in",
  "clear_punch_in",
  "apply_look",
  "clear_look",
  "fade_clip",
  "describe_timeline",
  // A split removes nothing; it only makes a later delete possible.
  "split_clip",
])

/** The tools whose built ops are measured before they land. */
export const GATED_TOOLS = new Set(["delete_clip"])

export type GateVerdict =
  | { ask: false }
  | {
      ask: true
      /** Said to the person, in words, before anything is removed. */
      reason: string
      sentences: number
      /** Whole percent of the take this edit would remove. */
      percent: number
    }

/**
 * The verdict for one tool call, given the steps its builder would produce.
 *
 * `before` is the scene the call would apply to; `words` the take's
 * transcript in source time (null when there is none, and then only the
 * share can trip the gate).
 */
export function gateVerdict({
  toolName,
  before,
  steps,
  words,
}: {
  toolName: string
  before: Scene
  steps: EditOp[][]
  words: Word[] | null
}): GateVerdict {
  if (EXEMPT_TOOLS.has(toolName)) return { ask: false }

  const ops = steps.flat()
  if (ops.length === 0) return { ask: false }

  const after = applyToScene(before, ops, "agent")

  const wasUs = sceneDurationUs(before)
  const nowUs = sceneDurationUs(after)
  const share = wasUs > 0 ? Math.max(0, wasUs - nowUs) / wasUs : 0
  const sentences = words ? sentencesRemoved(words, before, after) : 0

  const tooLong = share > GATE_SHARE
  if (!tooLong && sentences === 0) return { ask: false }

  const percent = Math.round(share * 100)
  return {
    ask: true,
    reason: gateReason(sentences, tooLong ? percent : null),
    sentences,
    percent,
  }
}

/** "This removes 3 spoken sentences and 40 % of the take, so I ask first." */
export function gateReason(sentences: number, percent: number | null): string {
  const parts: string[] = []
  if (sentences > 0) {
    parts.push(
      `${sentences} spoken ${sentences === 1 ? "sentence" : "sentences"}`
    )
  }
  if (percent !== null) parts.push(`${percent} % of the take`)
  return `This removes ${parts.join(" and ")}, so I ask first.`
}

/**
 * The take's words grouped into the sentences they were spoken in.
 *
 * Deepgram's punctuated words end a sentence with ".", "?", "!" or "…"; a take
 * with no punctuation at all is one sentence per speaker turn, which is the
 * coarsest honest reading of it. Fillers are dropped from every sentence, and a
 * sentence that was only fillers is no sentence: removing an "um" never asks.
 */
export function spokenSentences(words: Word[]): Word[][] {
  const sentences: Word[][] = []
  let current: Word[] = []

  const close = () => {
    if (current.length > 0) sentences.push(current)
    current = []
  }

  let speaker = words[0]?.speaker
  for (const word of words) {
    if (word.speaker !== speaker) {
      close()
      speaker = word.speaker
    }
    if (!isFiller(word.text)) current.push(word)
    if (/[.?!…]["”']?$/.test(word.text.trim())) close()
  }
  close()

  return sentences
}

/**
 * Sentences that play before the edit and play not at all after it.
 *
 * A word plays when its middle instant maps onto the spine (the same lookup
 * captions use to survive a cut). A sentence counts when every one of its
 * words is gone after and at least one played before, so a sentence already
 * half-cut and finished off by this edit is counted, and one cut earlier is not.
 */
export function sentencesRemoved(
  words: Word[],
  before: Scene,
  after: Scene
): number {
  const spineBefore = findMainTrack(before)
  const spineAfter = findMainTrack(after)
  if (!spineBefore || !spineAfter) return 0

  const mediaId = spineBefore.elements.find(
    (element) => element.kind === "video"
  )
  if (!mediaId || mediaId.kind !== "video") return 0

  const plays = (spine: typeof spineBefore, word: Word) =>
    sourceToTimelineUs(
      spine,
      mediaId.mediaId,
      us(Math.round((word.startUs + word.endUs) / 2))
    ) !== null

  return spokenSentences(words).filter(
    (sentence) =>
      sentence.some((word) => plays(spineBefore, word)) &&
      sentence.every((word) => !plays(spineAfter, word))
  ).length
}


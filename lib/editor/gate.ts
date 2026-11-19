import { applyToScene, type EditOp } from "./ops"
import { findMainTrack, sourceToTimelineUs, trackEndUs } from "./timeline"
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
const GATE_SHARE = 0.3

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
      /** Whole percent of the take this run's cuts would have removed. */
      percent: number
      /**
       * The spine clips this call would remove, by id. A clip number means a
       * different clip once the cut moves, so an answer is bound to these:
       * when the person says yes to a cut that no longer removes the same
       * clips, the yes does not carry over.
       */
      clipIds: string[]
    }

/**
 * The length the gate measures: where the spine ends.
 *
 * Not the scene's length. A delete ripples the spine and the captions and
 * nothing else, so a long music bed or title on another lane would hold the
 * scene's length still while the spine shrank, and the share would read as
 * close to nothing however much speech went.
 */
function spineEndUs(scene: Scene): number {
  const spine = findMainTrack(scene)
  return spine ? trackEndUs(spine) : 0
}

/**
 * The verdict for one tool call, given the steps its builder would produce.
 *
 * `before` is the scene the call would apply to; `words` the take's
 * transcript in source time (null when there is none, and then only the
 * share can trip the gate). One call on its own: a run judges its calls
 * through a ledger (`gateLedger`), which measures them together.
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
  return gateLedger({ start: before, words }).judge({
    toolName,
    scene: before,
    build: () => steps,
  }).verdict
}

export type GateLedger = {
  /**
   * Judge one call, in the order the SDK judges a step's calls.
   *
   * `scene` is the working scene as it stands; `build` the call's dry run
   * against a scene. Whatever the verdict, the call's ops are carried into
   * the ledger's picture of the run, so the next call in the same step is
   * measured on top of it: every call in a step is judged before any of them
   * runs, and judged alone, two deletes of 25 % each would both pass.
   *
   * `accepted` is for a call the person has already said yes to, replayed
   * on the next request: it moves the picture on without counting against
   * the share, and the sentences it removes stop counting too.
   */
  judge: (call: {
    toolName: string
    scene: Scene
    build: (scene: Scene) => EditOp[][] | null
    accepted?: boolean
  }) => { verdict: GateVerdict; clipIds: string[] }
  /**
   * The clips a call would remove from the run as the ledger pictures it,
   * without counting it or moving the picture on.
   */
  peek: (call: {
    toolName: string
    scene: Scene
    build: (scene: Scene) => EditOp[][] | null
  }) => string[]
}

/**
 * The gate for one run, measured against the cut as the run found it.
 *
 * A run is up to eight steps of calls, and "more than 30 % of the take" is
 * about the run, not about one call: a model that removes a quarter, then
 * another quarter, has cut half the take without anyone being asked. So the
 * ledger keeps a running total of spine time removed by measured tools,
 * against the spine's length when the run started, and the sentences gone
 * since the start. The exempt tools (pauses, fillers, captions, framing) do
 * not count towards it, whatever they remove; they are exempt by what they
 * are.
 */
export function gateLedger({
  start,
  words,
}: {
  start: Scene
  words: Word[] | null
}): GateLedger {
  const startUs = spineEndUs(start)
  let removedUs = 0
  let acceptedSentences = 0
  // The scene the last judgement saw, and the run as the ledger pictures it
  // after every call judged since. Calls are judged before any of them runs,
  // so while the working scene stays the same object, the picture holds what
  // the step will do; once the scene moves, the calls have run and the
  // working scene is the truth again.
  let seen: Scene | null = null
  let projected: Scene = start

  const follow = (scene: Scene) => {
    if (scene !== seen) {
      seen = scene
      projected = scene
    }
  }

  return {
    peek: ({ toolName, scene, build }) => {
      follow(scene)
      if (EXEMPT_TOOLS.has(toolName)) return []
      const ops = build(projected)?.flat() ?? []
      if (ops.length === 0) return []
      return removedClipIds(projected, applyToScene(projected, ops, "agent"))
    },
    judge: ({ toolName, scene, build, accepted = false }) => {
      const none = { verdict: { ask: false } as const, clipIds: [] }
      follow(scene)
      if (EXEMPT_TOOLS.has(toolName)) return none

      const steps = build(projected)
      if (!steps) return none
      const ops = steps.flat()
      if (ops.length === 0) return none

      const after = applyToScene(projected, ops, "agent")
      const clipIds = removedClipIds(projected, after)
      const cutUs = Math.max(0, spineEndUs(projected) - spineEndUs(after))
      projected = after

      const gone = words ? sentencesRemoved(words, start, after) : 0
      if (accepted) {
        acceptedSentences = gone
        return { verdict: { ask: false }, clipIds }
      }

      removedUs += cutUs
      const share = startUs > 0 ? removedUs / startUs : 0
      const sentences = Math.max(0, gone - acceptedSentences)

      const tooLong = share > GATE_SHARE
      if (!tooLong && sentences === 0) return { verdict: { ask: false }, clipIds }

      const percent = Math.round(share * 100)
      return {
        verdict: {
          ask: true,
          reason: gateReason(sentences, tooLong ? percent : null),
          sentences,
          percent,
          clipIds,
        },
        clipIds,
      }
    },
  }
}

/** Spine clips in `before` that `after` no longer has. */
function removedClipIds(before: Scene, after: Scene): string[] {
  const kept = new Set(findMainTrack(after)?.elements.map((e) => e.id) ?? [])
  return (findMainTrack(before)?.elements ?? [])
    .map((element) => element.id)
    .filter((id) => !kept.has(id))
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
function sentencesRemoved(
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


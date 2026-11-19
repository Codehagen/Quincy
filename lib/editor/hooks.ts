import { lineWindow, pushOnLine, SUBTLE_SCALE } from "./emphasis"
import { applyToScene, type EditOp } from "./ops"
import { findMainTrack, trackEndUs } from "./timeline"
import { us } from "./time"
import { addText } from "./titles"
import { cutSourceRanges } from "./tools"
import type { Word } from "./transcript"
import type { Author, Scene } from "./types"

/**
 * Hooks: how the first seconds of a video earn the rest.
 *
 * A viewer decides in the opening second or two whether to stay, and what
 * holds them is nearly always one of a small number of shapes: a question
 * they want answered, a claim they want to argue with, a result they want
 * the recipe for, a promise of a short list. These templates name those
 * shapes, so a person can pick one (or ask Quincy to pick) instead of facing
 * an empty title box.
 *
 * Whichever template, the opening is cut the same way, because that part is
 * craft, not taste:
 * - **Speech from the first frame.** Lead-in silence over `MAX_LEAD_IN_US`
 *   goes; a video that opens on someone about to talk has already lost the
 *   people who scroll.
 * - **The hook on screen, top third.** Short (a few words), on a box, out of
 *   the face, and up for as long as it takes to read, not the whole video.
 * - **At most one push,** on the spoken hook line, subtle, and only when the
 *   template is one that a push helps (a claim, a reveal), never on a list
 *   or a calm story.
 *
 * The words are the person's. A template gives the shape and an example;
 * the agent writes the line from what was said in the take, in its language.
 */

export type HookKey =
  | "question"
  | "bold_claim"
  | "result_first"
  | "list"
  | "myth"
  | "mistake"
  | "before_after"
  | "curiosity"
  | "if_you"
  | "number"
  | "story"
  | "challenge"
  | "day_in_life"
  | "problem_fix"
  | "nobody_tells_you"
  | "in_seconds"

export type HookTemplate = {
  key: HookKey
  label: string
  /** When it is the right opening, for the picker and the agent. */
  when: string
  /** The shape, with the parts to fill in braces. */
  pattern: string
  /** One worked line, for the picker. */
  example: string
  /** Whether one subtle push on the spoken hook line helps this shape. */
  push: boolean
}

export const HOOK_TEMPLATES: readonly HookTemplate[] = [
  {
    key: "question",
    label: "Question",
    when: "The video answers one clear question",
    pattern: "Why does {thing} {happen}?",
    example: "Why do most morning routines fail?",
    push: false,
  },
  {
    key: "bold_claim",
    label: "Bold claim",
    when: "You hold an opinion people will want to argue with",
    pattern: "{Thing} is overrated",
    example: "Working from home is overrated",
    push: true,
  },
  {
    key: "result_first",
    label: "Result first",
    when: "There is a result, and the video is how you got it",
    pattern: "How I {got result} in {time}",
    example: "How I edited a week of videos in one afternoon",
    push: true,
  },
  {
    key: "list",
    label: "Numbered list",
    when: "The video is a handful of points",
    pattern: "{N} things {about topic}",
    example: "3 things I wish I knew before filming",
    push: false,
  },
  {
    key: "myth",
    label: "Myth",
    when: "You correct something people believe",
    pattern: "Stop {doing the common thing}",
    example: "Stop posting every day",
    push: true,
  },
  {
    key: "mistake",
    label: "The mistake",
    when: "There is one error most people make",
    pattern: "The mistake everyone makes with {topic}",
    example: "The mistake everyone makes with lighting",
    push: false,
  },
  {
    key: "before_after",
    label: "Before and after",
    when: "Something changed, and you can show both sides",
    pattern: "From {before} to {after}",
    example: "From 200 views to 20,000",
    push: false,
  },
  {
    key: "curiosity",
    label: "Curiosity",
    when: "The payoff is a surprise worth waiting for",
    pattern: "I did not expect {this}",
    example: "I did not expect this to work",
    push: true,
  },
  {
    key: "if_you",
    label: "If you…",
    when: "The video is for one kind of viewer",
    pattern: "If you {situation}, watch this",
    example: "If you hate being on camera, watch this",
    push: false,
  },
  {
    key: "number",
    label: "Surprising number",
    when: "One figure carries the point",
    pattern: "{Number} {surprising fact}",
    example: "9 out of 10 viewers leave in 3 seconds",
    push: true,
  },
  {
    key: "story",
    label: "Story opener",
    when: "The video tells something that happened",
    pattern: "{When}, {what happened}",
    example: "Last week a client called me at 2 am",
    push: false,
  },
  {
    key: "challenge",
    label: "Challenge",
    when: "You tried something for a set time",
    pattern: "I tried {thing} for {time}",
    example: "I tried filming every day for 30 days",
    push: false,
  },
  {
    key: "day_in_life",
    label: "Day in the life",
    when: "The video follows a day or a routine",
    pattern: "A day as {role}",
    example: "A day as a solo founder",
    push: false,
  },
  {
    key: "problem_fix",
    label: "Problem and fix",
    when: "There is a pain the viewer knows and a fix you have",
    pattern: "{Problem}? Here is the fix",
    example: "Shaky footage? Here is the fix",
    push: false,
  },
  {
    key: "nobody_tells_you",
    label: "Nobody tells you",
    when: "You know something insiders take for granted",
    pattern: "What nobody tells you about {topic}",
    example: "What nobody tells you about going freelance",
    push: true,
  },
  {
    key: "in_seconds",
    label: "In seconds",
    when: "A quick explainer with a promise of speed",
    pattern: "{Topic} in {N} seconds",
    example: "Colour grading in 60 seconds",
    push: false,
  },
]

export const HOOK_KEYS = HOOK_TEMPLATES.map((hook) => hook.key) as [
  HookKey,
  ...HookKey[],
]

export function hookTemplate(key: HookKey): HookTemplate | undefined {
  return HOOK_TEMPLATES.find((hook) => hook.key === key)
}

/** A hook is read in a glance; past this many characters it is a paragraph. */
export const MAX_HOOK_LENGTH = 70

/** Silence before the first word that may stay. */
export const MAX_LEAD_IN_US = 150_000

/** What stays before the first word once the lead-in is cut. */
const LEAD_IN_KEEP_US = 80_000

/** How long the hook stays up: long enough to read, gone before it nags. */
const HOOK_MIN_US = 1_800_000
const HOOK_MAX_US = 3_500_000
const HOOK_DEFAULT_US = 2_500_000

/** The shortest text `addText` makes; a cut shorter than this gets no hook. */
const MIN_TEXT_US = 500_000

export type HookResult = {
  steps: EditOp[][]
  /** What happened beyond the obvious, for the agent's answer. */
  notes: string[]
}

/**
 * The opening, cut to a template: speech from the first frame, the hook on
 * screen, and (when the template wants one and the cut has room) one subtle
 * push on the spoken hook line.
 */
export function hookSteps(
  scene: Scene,
  words: Word[],
  options: {
    template: HookTemplate
    /** The hook as it appears on screen. */
    text: string
    /** The spoken line it sits on, as said in the take. */
    line?: string
    mediaId: string
    author: Author
    /** False when the person's style allows no zoom. */
    allowPush?: boolean
  }
): HookResult {
  const { template, author, mediaId } = options
  const steps: EditOp[][] = []
  const notes: string[] = []
  let current = scene
  const land = (ops: EditOp[]) => {
    if (ops.length === 0) return false
    steps.push(ops)
    current = applyToScene(current, ops, author)
    return true
  }

  // 1. Speech from the first frame.
  const leadIn = leadInRange(current, words, mediaId)
  if (leadIn && land(cutSourceRanges(current, [leadIn], { mediaId, author }))) {
    notes.push(
      `Cut ${((leadIn.endUs - leadIn.startUs) / 1_000_000).toFixed(1)} s of silence before the first word, so it opens on speech.`
    )
  }

  // 2. One hook per cut: a new template replaces the last one's text.
  land(removeHooks(current))

  // 3. The hook on screen, for as long as the spoken line, within reason,
  // and never past the footage: it is an overlay, not a title card.
  const spoken = options.line
    ? lineWindow(current, words, mediaId, options.line)
    : null
  const footageUs = spineEndUs(current)
  const wanted = spoken
    ? Math.min(HOOK_MAX_US, Math.max(HOOK_MIN_US, spoken.toUs))
    : HOOK_DEFAULT_US
  const shown = Math.min(wanted, footageUs)
  if (shown >= MIN_TEXT_US) {
    land(
      addText(current, {
        role: "hook",
        content: options.text.slice(0, MAX_HOOK_LENGTH),
        atUs: 0,
        durationUs: shown,
        author,
      })
    )
  } else {
    notes.push("The cut is too short to hold a hook on screen.")
  }

  // 4. One push, only where the shape wants it and the cut has room.
  if (template.push && options.allowPush !== false) {
    if (!options.line) {
      notes.push("No spoken line was given, so there is no push-in.")
    } else if (!spoken) {
      notes.push(
        `"${options.line}" is not in the cut as spoken, so there is no push-in.`
      )
    } else {
      const { ops, refusal } = pushOnLine(current, spoken, SUBTLE_SCALE)
      if (refusal) notes.push(`No push-in: ${refusal}`)
      else if (land(ops)) notes.push("One subtle push-in on the spoken hook.")
    }
  }

  return { steps, notes }
}

/**
 * The silence before the first word still in the cut, as a source range on
 * the first clip, or null when the cut already opens on speech.
 *
 * The opening word is the first one still sounding in the clip, which may
 * have started before the clip's in-point: a clip trimmed into a word opens
 * on speech, and there is nothing to cut.
 */
function leadInRange(
  scene: Scene,
  words: Word[],
  mediaId: string
): { startUs: ReturnType<typeof us>; endUs: ReturnType<typeof us> } | null {
  const spine = findMainTrack(scene)
  const first = spine?.elements[0]
  if (!spine || !first || first.kind !== "video" || first.mediaId !== mediaId) {
    return null
  }
  const opening = words.find(
    (word) => word.endUs > first.trimStartUs && word.startUs < first.trimEndUs
  )
  if (!opening || opening.startUs <= first.trimStartUs) return null
  if (opening.startUs - first.trimStartUs <= MAX_LEAD_IN_US) return null

  const end = opening.startUs - LEAD_IN_KEEP_US
  if (end <= first.trimStartUs) return null
  return { startUs: us(first.trimStartUs), endUs: us(end) }
}

/** Every hook text in the scene, removed. Titles and names stay. */
function removeHooks(scene: Scene): EditOp[] {
  return scene.tracks.flatMap((track) =>
    track.elements
      .filter((element) => element.kind === "text" && element.role === "hook")
      .map((element) => ({
        op: "remove_element" as const,
        sceneId: scene.id,
        trackId: track.id,
        elementId: element.id,
      }))
  )
}

/** Where the footage ends: the spine, not the overlays on it. */
function spineEndUs(scene: Scene): number {
  const spine = findMainTrack(scene)
  return spine ? trackEndUs(spine) : 0
}

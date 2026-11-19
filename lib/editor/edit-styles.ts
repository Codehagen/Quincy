import { DEFAULT_CAPTION_STYLE } from "./document"
import { setVoice } from "./edits"
import { frameSteps } from "./emphasis"
import { applyToScene, type EditOp } from "./ops"
import { silenceForPace, type Pace } from "./pacing"
import { CAPTION_PRESETS, restyleCaptions, type CaptionPreset } from "./presets"
import { addCaptions, removeSilenceSteps } from "./tools"
import type { Us } from "./time"
import type { AudioPeaks, Word } from "./transcript"
import type { Author, Scene } from "./types"

/**
 * Edit styles: what a kind of video is cut like, as one press.
 *
 * Each is a set of choices an editor makes together, because they only work
 * together: a snappy pace under quiet, line-at-a-time subtitles reads as two
 * videos, and a fast vlog with no frame steps shows every jump cut. So a
 * style sets the pace, the caption look, the sound and how much zoom is
 * allowed, and never more than that. It adds no text and no music: those
 * are choices about this video, not about the kind of video it is.
 *
 * Zoom is the setting most styles keep low. `emphasis` is what the agent is
 * told it may add on top, and only `fast_vlog` steps the framing between
 * clips (emphasis.ts `frameSteps`), at a scale too small to read as a zoom.
 */

export type EditStyleKey =
  "talking_head" | "fast_vlog" | "story" | "tutorial" | "podcast_clip"

export type EditStyle = {
  key: EditStyleKey
  label: string
  hint: string
  pace: Pace
  captions: CaptionPreset["key"]
  /** A still, slightly closer frame on every other clip, to hide jump cuts. */
  frameSteps: boolean
  /** How many push-ins the agent may add on top, at most. */
  emphasis: "none" | "one" | "few"
  voice?: "clean"
}

export const EDIT_STYLES: readonly EditStyle[] = [
  {
    key: "talking_head",
    label: "Talking head",
    hint: "Natural pace, clean captions, one push on the line that matters",
    pace: "natural",
    captions: "clean",
    frameSteps: false,
    emphasis: "one",
  },
  {
    key: "fast_vlog",
    label: "Fast vlog",
    hint: "Snappy pace, bold word-by-word captions, jump cuts hidden by framing",
    pace: "snappy",
    captions: "bold",
    frameSteps: true,
    emphasis: "few",
  },
  {
    key: "story",
    label: "Story",
    hint: "Relaxed pace that keeps the pauses, quiet subtitles, no zoom",
    pace: "relaxed",
    captions: "quiet",
    frameSteps: false,
    emphasis: "none",
  },
  {
    key: "tutorial",
    label: "Tutorial",
    hint: "Natural pace, captions on a box, the picture left alone",
    pace: "natural",
    captions: "boxed",
    frameSteps: false,
    emphasis: "none",
  },
  {
    key: "podcast_clip",
    label: "Podcast clip",
    hint: "Natural pace, cleaned-up voice, captions on a box",
    pace: "natural",
    captions: "boxed",
    frameSteps: false,
    emphasis: "one",
    voice: "clean",
  },
]

export const EDIT_STYLE_KEYS = EDIT_STYLES.map((style) => style.key) as [
  EditStyleKey,
  ...EditStyleKey[],
]

export function editStyle(key: EditStyleKey): EditStyle | undefined {
  return EDIT_STYLES.find((style) => style.key === key)
}

/**
 * The style's edits, in the order an editor makes them: pauses first (every
 * later edit sits on the clips they leave), then the sound, then the
 * captions (built over the tightened cut), then the framing between clips.
 * One batch per press, each built against the scene the last one left.
 */
export function editStyleSteps(
  scene: Scene,
  words: Word[],
  options: {
    style: EditStyle
    mediaId: string
    sourceDurationUs: Us
    author: Author
    peaks?: AudioPeaks | null
    /** The project's caption rules (document.ts `captionRules`). */
    rules?: number
  }
): EditOp[][] {
  const { style, author } = options
  const steps: EditOp[][] = []
  let current = scene
  const land = (ops: EditOp[]) => {
    if (ops.length === 0) return
    steps.push(ops)
    current = applyToScene(current, ops, author)
  }

  for (const ops of removeSilenceSteps(current, words, {
    mediaId: options.mediaId,
    author,
    sourceDurationUs: options.sourceDurationUs,
    peaks: options.peaks,
    silence: silenceForPace(style.pace),
  })) {
    land(ops)
  }

  if (style.voice) land(setVoice(current, style.voice))

  const hasCaptions = current.tracks.some(
    (track) => track.kind === "caption" && track.elements.length > 0
  )
  if (hasCaptions) {
    land(restyleCaptions(current, style.captions, author))
  } else {
    const preset = CAPTION_PRESETS.find((p) => p.key === style.captions)
    land(
      addCaptions(current, words, {
        mediaId: options.mediaId,
        author,
        style: { ...DEFAULT_CAPTION_STYLE, ...preset?.style },
        rules: options.rules,
      })
    )
  }

  if (style.frameSteps) land(frameSteps(current))

  return steps
}

/** What the style leaves the agent free to add, in words for its answer. */
export function emphasisNote(style: EditStyle): string {
  switch (style.emphasis) {
    case "none":
      return "This style uses no push-ins: do not add any."
    case "one":
      return "This style allows one push-in, on the strong line, only if the person wants it."
    case "few":
      return "This style allows a push-in on a line that matters, at most one in any 8 seconds."
  }
}

import { DEFAULT_CAPTION_STYLE } from "./document"
import { applyEffect, removeEffectsOfType } from "./edits"
import { EFFECTS } from "./effect-catalogue"
import type { EditOp } from "./ops"
import { captionWords, keepCorrections } from "./correct-words"
import { findMainTrack } from "./timeline"
import { addCaptions } from "./tools"
import type { Author, CaptionStyle, EffectType, Scene, VideoElement } from "./types"

/**
 * Named starting points for the two looks people most want to change in one
 * press: how the captions read, and how the picture is graded.
 *
 * Few, on purpose, and each one a whole decision rather than a theme: a
 * preset sets every field it is about, so pressing two in a row gives the
 * second, never a blend of both.
 */

export type CaptionPreset = {
  key: "clean" | "bold" | "boxed" | "quiet"
  label: string
  hint: string
  style: Partial<CaptionStyle>
}

export const CAPTION_PRESETS: CaptionPreset[] = [
  {
    key: "clean",
    label: "Clean",
    hint: "White, a soft shadow, a few words at a time",
    style: {
      fontSize: 64,
      fontWeight: 700,
      textTransform: "none",
      activeColor: "#ffffff",
      inactiveColor: "#ffffff99",
      wordsPerSegment: 3,
      background: { ...DEFAULT_CAPTION_STYLE.background, enabled: false },
      shadow: DEFAULT_CAPTION_STYLE.shadow,
    },
  },
  {
    key: "bold",
    label: "Bold",
    hint: "Large capitals, one word at a time, the word in yellow",
    style: {
      fontSize: 84,
      fontWeight: 900,
      textTransform: "uppercase",
      activeColor: "#ffd60a",
      inactiveColor: "#ffffff",
      wordsPerSegment: 1,
      background: { ...DEFAULT_CAPTION_STYLE.background, enabled: false },
      shadow: { color: "rgba(0,0,0,0.85)", blur: 18, offsetX: 0, offsetY: 4 },
    },
  },
  {
    key: "boxed",
    label: "Boxed",
    hint: "On a dark box, readable over anything",
    style: {
      fontSize: 56,
      fontWeight: 700,
      textTransform: "none",
      activeColor: "#ffffff",
      inactiveColor: "#ffffffb3",
      wordsPerSegment: 4,
      background: {
        enabled: true,
        color: "rgba(0,0,0,0.72)",
        cornerRadius: 12,
        paddingX: 28,
        paddingY: 14,
      },
      shadow: { color: "rgba(0,0,0,0)", blur: 0, offsetX: 0, offsetY: 0 },
    },
  },
  {
    key: "quiet",
    label: "Quiet",
    hint: "Smaller, a line at a time, like subtitles",
    style: {
      fontSize: 44,
      fontWeight: 600,
      textTransform: "none",
      activeColor: "#ffffff",
      inactiveColor: "#ffffff",
      wordsPerSegment: 7,
      background: { ...DEFAULT_CAPTION_STYLE.background, enabled: false },
      shadow: { color: "rgba(0,0,0,0.7)", blur: 10, offsetX: 0, offsetY: 2 },
    },
  },
]

/**
 * Restyle every caption in the scene. Words per segment is stored on the
 * style but regrouping needs the transcript, so the caller rebuilds the lane
 * when it changes (`needsRegroup`).
 */
export function applyCaptionPreset(scene: Scene, key: CaptionPreset["key"]): EditOp[] {
  const preset = CAPTION_PRESETS.find((candidate) => candidate.key === key)
  if (!preset) return []
  const ops: EditOp[] = []
  for (const track of scene.tracks) {
    if (track.kind !== "caption") continue
    for (const element of track.elements) {
      if (element.kind !== "caption") continue
      ops.push({
        op: "update_element",
        sceneId: scene.id,
        trackId: track.id,
        elementId: element.id,
        patch: { style: { ...element.style, ...preset.style } },
        target: { action: "press", kind: "control", control: "captions" },
      })
    }
  }
  return ops
}

/** Whether a preset groups words differently from the captions as they are. */
export function needsRegroup(scene: Scene, key: CaptionPreset["key"]): boolean {
  const preset = CAPTION_PRESETS.find((candidate) => candidate.key === key)
  const first = scene.tracks
    .filter((track) => track.kind === "caption")
    .flatMap((track) => track.elements)
    .find((element) => element.kind === "caption")
  if (!preset || !first || first.kind !== "caption") return false
  return (
    preset.style.wordsPerSegment !== undefined &&
    preset.style.wordsPerSegment !== first.style.wordsPerSegment
  )
}

/**
 * A caption look, from the panel or the agent: the same press gives the same
 * document. A look that groups words differently rebuilds the captions from
 * the words they hold now, not the transcript, so a correction or an imported
 * subtitle file survives; one that does not only restyles.
 */
export function restyleCaptions(
  scene: Scene,
  key: CaptionPreset["key"],
  author: Author
): EditOp[] {
  const preset = CAPTION_PRESETS.find((candidate) => candidate.key === key)
  if (!preset) return []
  if (!needsRegroup(scene, key)) return applyCaptionPreset(scene, key)
  const clip = findMainTrack(scene)?.elements.find(
    (element): element is VideoElement => element.kind === "video"
  )
  const first = scene.tracks
    .filter((track) => track.kind === "caption")
    .flatMap((track) => track.elements)
    .find((element) => element.kind === "caption")
  if (!clip || first?.kind !== "caption") return applyCaptionPreset(scene, key)
  const words = captionWords(scene, clip.mediaId)
  if (words.length === 0) return applyCaptionPreset(scene, key)
  return keepCorrections(
    scene,
    addCaptions(scene, words, {
      mediaId: clip.mediaId,
      author,
      rules: 1,
      style: { ...first.style, ...preset.style },
    })
  )
}

export type LookPreset = {
  key: "natural" | "warm" | "cool" | "punchy" | "mono"
  label: string
  hint: string
  effects: Partial<Record<Exclude<EffectType, "zoom">, number>>
}

export const LOOK_PRESETS: LookPreset[] = [
  { key: "natural", label: "As shot", hint: "No grade", effects: {} },
  {
    key: "warm",
    label: "Warm",
    hint: "A little warmer and richer",
    effects: { saturation: 1.1, sepia: 0.12, brightness: 1.03 },
  },
  {
    key: "cool",
    label: "Cool",
    hint: "Cooler, slightly crisper",
    effects: { hue: 8, contrast: 1.06, saturation: 0.92 },
  },
  {
    key: "punchy",
    label: "Punchy",
    hint: "More contrast and colour",
    effects: { contrast: 1.15, saturation: 1.2 },
  },
  {
    key: "mono",
    label: "Black and white",
    hint: "Grayscale with a touch of contrast",
    effects: { grayscale: 1, contrast: 1.1 },
  },
]

const GRADED: Exclude<EffectType, "zoom">[] = EFFECTS.map((spec) => spec.type).filter(
  (type): type is Exclude<EffectType, "zoom"> =>
    type !== "zoom" && type !== "blur" && type !== "invert"
)

/**
 * Grade every clip on the spine with one look. Zooms, blurs and inverts are
 * left alone: they are edits, not a grade.
 */
export function applyLookPreset(scene: Scene, key: LookPreset["key"]): EditOp[] {
  const preset = LOOK_PRESETS.find((candidate) => candidate.key === key)
  const spine = findMainTrack(scene)
  if (!preset || !spine) return []
  let working = scene
  const ops: EditOp[] = []
  for (const element of spine.elements) {
    if (element.kind !== "video") continue
    for (const type of GRADED) {
      const amount = preset.effects[type]
      const next =
        amount === undefined
          ? removeEffectsOfType(working, element.id, type)
          : applyEffect(working, element.id, type, amount)
      if (next.length === 0) continue
      ops.push(...next)
      working = applyLocally(working, next)
    }
  }
  return ops
}

/** Element patches folded into a copy, so the next builder sees them. */
function applyLocally(scene: Scene, ops: EditOp[]): Scene {
  let tracks = scene.tracks
  for (const op of ops) {
    if (op.op !== "update_element") continue
    tracks = tracks.map((track) =>
      track.id !== op.trackId
        ? track
        : {
            ...track,
            elements: track.elements.map((element) =>
              element.id === op.elementId
                ? ({ ...element, ...op.patch } as typeof element)
                : element
            ),
          }
    )
  }
  return { ...scene, tracks }
}

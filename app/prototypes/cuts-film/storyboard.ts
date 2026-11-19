import type { ComponentType } from "react"
import { DESK_CUES } from "./cues"
import { CaptionScene } from "./scenes/caption"
import { END_CUES, EndScene } from "./scenes/end"
import { DUR, OVERLAP } from "./timeline"

// The whole film, one entry per scene. Reorder, retime or rewrite here; the scenes read their own clock.
// `caption` is the two-tone headline on screen (most people watch muted); `vo` is what the voice says (the same
// words), `take` how it's said (ElevenLabs v3 audio tags in brackets, not spoken). Cues are sounds at a time in
// the scene; the mix places them, scenes never play audio.

export { FPS, STAGE, STEP_COUNT } from "./stage"

export interface SceneProps {
  /** ms since the scene started */
  t: number
  /** ms on the film's clock (for the hero, which crosses scenes) */
  abs: number
  duration: number
  scene: Scene
}

export interface Cue {
  at: number
  sound: string
  /** Where it sits in the stereo image, −1 (left) to 1 (right), when it belongs to one side of the frame. */
  pan?: number
}

export interface Scene {
  id: string
  duration: number
  eyebrow: string
  /** Its place in the story (01, 02, …), shown in the eyebrow and rolled on from the scene before. */
  step?: number
  caption: [lead: string, soft: string]
  vo: string
  /** When `vo` is read, ms into the scene (its earliest start). Default 200, as the caption comes in. */
  voiceAt?: number
  /** How `vo` is read: audio tags in brackets (not spoken), CAPS for stress, "..." for a pause. */
  take?: string
  /** Several lines at their own times, instead of `vo` once. `until`: when what the line talks about leaves. */
  voice?: { at: number; text: string; take?: string; until?: number }[]
  /** ms the next scene starts before this one ends (they overlap while one hands over to the next). */
  overlap?: number
  /** Full-bleed: no brand mark or frame lines while it plays. */
  bare?: boolean
  /** Draws the hero (hero.tsx) while it's the latest scene on screen that does. */
  hero?: boolean
  Component: ComponentType<SceneProps>
  cues?: Cue[]
}

export const SCENES: Scene[] = [
  {
    id: "drop",
    duration: DUR.drop,
    overlap: OVERLAP,
    eyebrow: "Cuts",
    caption: ["Drop a take.", "Quincy cuts it in front of you."],
    vo: "Drop a take. Quincy cuts it in front of you.",
    Component: CaptionScene,
  },
  {
    id: "ask",
    duration: DUR.ask,
    overlap: OVERLAP,
    eyebrow: "You ask",
    caption: ["Say what you want.", "In plain words."],
    vo: "Say what you want. In plain words.",
    Component: CaptionScene,
  },
  {
    id: "cut",
    duration: DUR.cut,
    overlap: OVERLAP,
    eyebrow: "The pauses",
    caption: ["It finds every pause.", "Selects it. ⌫. Gone."],
    vo: "It finds every pause. Selects it. ⌫. Gone.",
    Component: CaptionScene,
  },
  {
    id: "check",
    duration: DUR.check,
    overlap: OVERLAP,
    eyebrow: "The check",
    caption: ["Captions land.", "Then it checks its own frames."],
    vo: "Captions land. Then it checks its own frames.",
    Component: CaptionScene,
  },
  {
    id: "three",
    duration: DUR.three,
    overlap: OVERLAP,
    eyebrow: "Three cuts",
    caption: ["Three cuts at once.", "Each one cut differently."],
    vo: "Three cuts at once. Each one cut differently.",
    Component: CaptionScene,
  },
  {
    id: "pick",
    duration: DUR.pick,
    overlap: OVERLAP,
    eyebrow: "The pick",
    caption: ["It recommends one.", "In words, not a score."],
    vo: "It recommends one. In words, not a score.",
    Component: CaptionScene,
  },
  {
    id: "end",
    duration: DUR.end,
    bare: true,
    eyebrow: "hirequincy.com",
    caption: ["Quincy drafts.", "You send."],
    vo: "Quincy drafts. You send.",
    Component: EndScene,
    cues: END_CUES,
  },
]

/** Each scene's start on the film's clock. */
export const STARTS = SCENES.reduce<number[]>((acc, _, i) => {
  const prev = SCENES[i - 1]
  return [...acc, prev ? acc[i - 1]! + prev.duration - (prev.overlap ?? 0) : 0]
}, [])
export const DURATION = STARTS.at(-1)! + SCENES.at(-1)!.duration

/** Every sound on the film's clock, for the mix. */
export const CUES: Cue[] = [...DESK_CUES, ...SCENES.flatMap((s, i) => (s.cues ?? []).map((c) => ({ ...c, at: c.at + STARTS[i]! })))].sort((a, b) => a.at - b.at)

/** Every voice-over line on the film's clock, with when its picture leaves (a line must be read by then). */
export const VOICE = SCENES.flatMap((s, i) =>
  (s.voice ?? [{ at: s.voiceAt ?? 200, text: s.vo, take: s.take }]).map((v) => ({
    text: v.text,
    take: v.take ?? v.text,
    at: v.at + STARTS[i]!,
    until: STARTS[i]! + ("until" in v && v.until !== undefined ? v.until : s.duration - 420),
  }))
)

/** The scene that has the frame (the latest one started). */
export function sceneAt(t: number) {
  const i = Math.max(0, STARTS.filter((start) => start <= t).length - 1)
  return { index: i, scene: SCENES[i]!, local: t - STARTS[i]! }
}

/** Every scene on screen at `t`: two while one hands over to the next. */
export function scenesAt(t: number) {
  return SCENES.map((scene, i) => ({ scene, index: i, local: t - STARTS[i]! })).filter(({ scene, local }) => local >= 0 && local <= scene.duration)
}

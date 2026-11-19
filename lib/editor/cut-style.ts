import { DEFAULT_CAPTION_STYLE } from "./document"
import { EFFECTS } from "./effect-catalogue"
import { isPace, PACE_SPECS, type Pace } from "./pacing"
import { findMainTrack } from "./timeline"
import type { CaptionStyle, EffectType, Scene } from "./types"

/**
 * How this person likes a cut: the caption look, the look on the picture, how
 * hard the pauses are tightened, and which sound plays. Saved once ("make
 * this my style"), it is what Quincy reaches for on every cut after, so the
 * tenth video looks like the first without being asked ten times.
 *
 * Stored in the Brain as structured data (`cut_style`, slug `cuts/style`):
 * code reads it, so it lives in `data` and the prose is rendered from it
 * (docs/brain.md, "the one invariant"). Nothing here touches a database; the
 * store is cut-style-store.ts.
 */
export type CutStyle = {
  captions?: {
    wordsPerSegment: number
    textTransform: CaptionStyle["textTransform"]
    background: boolean
    showFillers?: boolean
  }
  /** Looks on the whole spine, by type and amount. Zoom is a moment, not a style. */
  looks?: { type: Exclude<EffectType, "zoom">; amount: number }[]
  /** Exact pause numbers, when the person named them. Wins over `pace`. */
  pauses?: { minSilenceMs: number; paddingMs: number }
  /** How hard pauses are tightened, by name (pacing.ts). */
  pace?: Pace
  voice?: "original" | "clean"
}

export const CUT_STYLE_SLUG = "cuts/style"

/** What a cut looks like now, as a style worth keeping. */
export function cutStyleOf(
  scene: Scene,
  extra: Pick<CutStyle, "pauses" | "pace"> = {}
): CutStyle {
  const style: CutStyle = { ...extra }
  const caption = scene.tracks
    .filter((track) => track.kind === "caption")
    .flatMap((track) => track.elements)
    .find((element) => element.kind === "caption")
  if (caption && caption.kind === "caption") {
    style.captions = {
      wordsPerSegment: caption.style.wordsPerSegment,
      textTransform: caption.style.textTransform,
      background: caption.style.background.enabled,
      ...(caption.style.showFillers ? { showFillers: true } : {}),
    }
  }

  const clip = findMainTrack(scene)?.elements.find(
    (element) => element.kind === "video"
  )
  if (clip && clip.kind === "video") {
    const looks = clip.effects
      .filter((effect) => effect.enabled && effect.type !== "zoom")
      .flatMap((effect) => {
        const spec = EFFECTS.find((candidate) => candidate.type === effect.type)
        const amount = spec ? effect.params[spec.param] : undefined
        return spec && typeof amount === "number"
          ? [{ type: effect.type as Exclude<EffectType, "zoom">, amount }]
          : []
      })
    if (looks.length > 0) style.looks = looks
    if (clip.voice === "clean") style.voice = "clean"
  }
  return style
}

/** The caption style a saved style asks for, over the default. */
export function captionStyleFor(
  style: CutStyle | null | undefined
): CaptionStyle {
  if (!style?.captions) return DEFAULT_CAPTION_STYLE
  return {
    ...DEFAULT_CAPTION_STYLE,
    wordsPerSegment: style.captions.wordsPerSegment,
    textTransform: style.captions.textTransform,
    background: {
      ...DEFAULT_CAPTION_STYLE.background,
      enabled: style.captions.background,
    },
  }
}

/** Refuses a style that would make a cut no one asked for. */
export function validCutStyle(value: unknown): CutStyle | null {
  if (!value || typeof value !== "object") return null
  const style = value as CutStyle
  const out: CutStyle = {}
  const c = style.captions
  if (c) {
    if (
      !Number.isInteger(c.wordsPerSegment) ||
      c.wordsPerSegment < 1 ||
      c.wordsPerSegment > 12
    ) {
      return null
    }
    if (!["none", "uppercase", "lowercase"].includes(c.textTransform))
      return null
    out.captions = {
      wordsPerSegment: c.wordsPerSegment,
      textTransform: c.textTransform,
      background: Boolean(c.background),
      ...(c.showFillers ? { showFillers: true } : {}),
    }
  }
  if (style.looks) {
    if (!Array.isArray(style.looks) || style.looks.length > 4) return null
    const looks = []
    for (const look of style.looks) {
      const spec = EFFECTS.find((candidate) => candidate.type === look?.type)
      if (!spec || spec.type === "zoom" || typeof look.amount !== "number")
        return null
      if (look.amount < spec.min || look.amount > spec.max) return null
      looks.push({ type: look.type, amount: look.amount })
    }
    out.looks = looks
  }
  if (style.pauses) {
    const { minSilenceMs, paddingMs } = style.pauses
    if (!(minSilenceMs >= 250 && minSilenceMs <= 3000)) return null
    if (!(paddingMs >= 0 && paddingMs <= 500)) return null
    out.pauses = { minSilenceMs, paddingMs }
  }
  if (style.pace !== undefined) {
    if (!isPace(style.pace)) return null
    out.pace = style.pace
  }
  if (style.voice) {
    if (style.voice !== "clean" && style.voice !== "original") return null
    out.voice = style.voice
  }
  return out
}

/** The style in sentences, for the Brain page and the agent's prompt. */
export function describeCutStyle(style: CutStyle): string[] {
  const lines: string[] = []
  if (style.captions) {
    const { wordsPerSegment, textTransform, background } = style.captions
    lines.push(
      `Captions ${wordsPerSegment === 1 ? "one word at a time" : `about ${wordsPerSegment} words at a time`}` +
        `${textTransform === "uppercase" ? ", in capitals" : ""}` +
        `${background ? ", on a box" : ""}.`
    )
  }
  for (const look of style.looks ?? []) {
    const spec = EFFECTS.find((candidate) => candidate.type === look.type)
    if (spec)
      lines.push(
        `${spec.label} at ${spec.format(look.amount)} on the whole cut.`
      )
  }
  if (style.pauses) {
    lines.push(
      `Pauses longer than ${style.pauses.minSilenceMs} ms are tightened, leaving ${style.pauses.paddingMs} ms either side.`
    )
  }
  if (style.pace && !style.pauses) {
    lines.push(
      `Pauses tightened at a ${PACE_SPECS[style.pace].label.toLowerCase()} pace.`
    )
  }
  if (style.voice === "clean")
    lines.push("The cleaned-up sound, not the raw recording.")
  return lines
}

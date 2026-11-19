import { DEFAULT_CAPTION_STYLE } from "./document"
import { newElement, type EditOp } from "./ops"
import { placeElement } from "./placement"
import { sceneDurationUs } from "./timeline"
import { us } from "./time"
import type { Author, CaptionStyle, Scene, TextElement } from "./types"

/**
 * Text over the picture: a title card, a lower third, an end card.
 *
 * Three, each with one look, because what a title is for decides where it
 * sits and how big it is far more than taste does. A title fills the middle,
 * a lower third names the person low on the left and stays out of the face,
 * an end card closes the cut. Each enters and leaves with a short fade
 * (`textOpacity`), never a fly-in.
 */

export type TextRole = NonNullable<TextElement["role"]>

export type TextPreset = {
  role: TextRole
  label: string
  /** How long it stays up when nobody says. */
  durationUs: number
  style: CaptionStyle
}

const BASE: CaptionStyle = {
  ...DEFAULT_CAPTION_STYLE,
  inactiveColor: "#ffffff",
  shadow: { color: "rgba(0,0,0,0.55)", blur: 18, offsetX: 0, offsetY: 3 },
}

export const TEXT_PRESETS: Record<TextRole, TextPreset> = {
  title: {
    role: "title",
    label: "Title",
    durationUs: 3_000_000,
    style: { ...BASE, fontSize: 96, fontWeight: 800, lineHeight: 1.05 },
  },
  lower_third: {
    role: "lower_third",
    label: "Name and role",
    durationUs: 4_000_000,
    style: {
      ...BASE,
      fontSize: 52,
      fontWeight: 700,
      textAlign: "left",
      background: {
        enabled: true,
        color: "rgba(0,0,0,0.72)",
        cornerRadius: 10,
        paddingX: 28,
        paddingY: 16,
      },
      shadow: { color: "rgba(0,0,0,0)", blur: 0, offsetX: 0, offsetY: 0 },
    },
  },
  end_card: {
    role: "end_card",
    label: "End card",
    durationUs: 3_000_000,
    style: { ...BASE, fontSize: 80, fontWeight: 800 },
  },
  /**
   * The opening line on screen (hooks.ts). Across the top third, so it sits
   * over the background and not the face, and on a box so it reads over
   * anything in the first frames, where nobody has chosen what is behind it.
   */
  hook: {
    role: "hook",
    label: "Hook",
    durationUs: 2_500_000,
    style: {
      ...BASE,
      fontSize: 72,
      fontWeight: 800,
      lineHeight: 1.1,
      background: {
        enabled: true,
        color: "rgba(0,0,0,0.78)",
        cornerRadius: 14,
        paddingX: 32,
        paddingY: 18,
      },
      shadow: { color: "rgba(0,0,0,0)", blur: 0, offsetX: 0, offsetY: 0 },
    },
  },
}

/** The fade in and out on every text, in microseconds. */
export const TEXT_FADE_US = 250_000

/** Opacity of a text at a point inside it: a short fade at each end. */
export function textOpacity(elementUs: number, durationUs: number): number {
  const fade = Math.min(TEXT_FADE_US, durationUs / 3)
  if (fade <= 0) return 1
  if (elementUs < fade) return Math.max(0, elementUs / fade)
  if (elementUs > durationUs - fade)
    return Math.max(0, (durationUs - elementUs) / fade)
  return 1
}

export const MAX_TEXT_LENGTH = 120

export function addText(
  scene: Scene,
  options: {
    role: TextRole
    content: string
    subtitle?: string
    /** Absent: a title opens the cut, an end card closes it, a name sits at the playhead. */
    atUs?: number
    durationUs?: number
    author: Author
  }
): EditOp[] {
  const content = options.content.trim().slice(0, MAX_TEXT_LENGTH)
  if (!content) return []
  const preset = TEXT_PRESETS[options.role]
  const cutUs = sceneDurationUs(scene)
  const length = Math.max(
    500_000,
    Math.round(options.durationUs ?? preset.durationUs)
  )
  const at =
    options.atUs ??
    (options.role === "end_card" ? Math.max(0, cutUs - length) : 0)
  const element = newElement<TextElement>(
    {
      kind: "text",
      name: content,
      role: options.role,
      content,
      ...(options.subtitle?.trim()
        ? { subtitle: options.subtitle.trim().slice(0, MAX_TEXT_LENGTH) }
        : {}),
      startUs: us(Math.max(0, Math.round(at))),
      durationUs: us(length),
      style: preset.style,
      transform: { position: { x: 0, y: 0 }, scaleX: 1, scaleY: 1, rotate: 0 },
      animations: { channels: {} },
    },
    options.author
  )
  return placeElement(scene, element, { trackName: "Text" })
}

/** Change what a text says; the name on the lane follows the first line. */
export function editText(
  scene: Scene,
  elementId: string,
  patch: { content?: string; subtitle?: string }
): EditOp[] {
  for (const track of scene.tracks) {
    const element = track.elements.find((candidate) => candidate.id === elementId)
    if (!element || element.kind !== "text") continue
    const next: Record<string, unknown> = {}
    if (patch.content !== undefined) {
      const content = patch.content.trim().slice(0, MAX_TEXT_LENGTH)
      if (!content || content === element.content) {
        if (!content) return []
      } else {
        next.content = content
        next.name = content
      }
    }
    if (patch.subtitle !== undefined) {
      const subtitle = patch.subtitle.trim().slice(0, MAX_TEXT_LENGTH)
      if (subtitle !== (element.subtitle ?? "")) next.subtitle = subtitle || null
    }
    if (Object.keys(next).length === 0) return []
    return [
      {
        op: "update_element",
        sceneId: scene.id,
        trackId: track.id,
        elementId,
        patch: next,
        target: { action: "press", kind: "element", trackId: track.id, elementId },
      },
    ]
  }
  return []
}

/** Move a text on the frame, in canvas pixels from where its role puts it. */
export function positionText(
  scene: Scene,
  elementId: string,
  position: { x: number; y: number }
): EditOp[] {
  for (const track of scene.tracks) {
    const element = track.elements.find((candidate) => candidate.id === elementId)
    if (!element || element.kind !== "text") continue
    return [
      {
        op: "update_element",
        sceneId: scene.id,
        trackId: track.id,
        elementId,
        patch: {
          transform: {
            ...element.transform,
            position: { x: Math.round(position.x), y: Math.round(position.y) },
          },
        },
        target: { action: "press", kind: "element", trackId: track.id, elementId },
      },
    ]
  }
  return []
}

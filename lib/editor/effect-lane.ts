import { EFFECTS, effectSpec } from "./effect-catalogue"
import { EFFECT_DEFAULTS } from "./effects"
import type { AnimationChannel, Effect, Track, TimelineElement } from "./types"

/**
 * The effects on a track, as things you can see and grab.
 *
 * Effects are stored on the element that carries them, because an effect with
 * no clip underneath has nothing to apply to — `types.ts` says so, and says the
 * rest of it too: "showing them as their own lanes is a view concern and
 * belongs to the timeline component". This is that view, computed rather than
 * stored, so the lane cannot disagree with what renders.
 *
 * A punch-in was invisible before this. It existed on the clip, it drew on the
 * frame, and the only way to make one was to ask for it in a sentence — which
 * makes it a thing that happens to your cut rather than a thing you edit.
 */

export type EffectChipKind = Effect["type"] | "fade-in" | "fade-out"

export type EffectChip = {
  /** Stable across renders, and unique within the scene. */
  id: string
  elementId: string
  /** Absent on a fade, which is a bare opacity channel with no Effect behind it. */
  effectId: string | null
  kind: EffectChipKind
  /** Scene time, so the chip sits under the clip it belongs to. */
  startUs: number
  durationUs: number
  /**
   * The headline number: how far the zoom pushes, how heavy the blur is.
   * The peak of the curve when there is one, since that is what the effect is
   * *for* — a punch-in that starts and ends at 1 is not a zoom of 1.
   */
  amount: number | null
  /**
   * Whether the effect has a curve, and therefore a window to move or resize.
   *
   * A look has neither. Brightness on a clip is a decision about the whole
   * shot, so there is no start to drag and nothing between two ends — and a
   * chip that offered grab handles for it drew a gesture the document answers
   * with nothing at all, which reads as the drag snapping back.
   */
  windowed: boolean
  /**
   * The clip's own span, in scene time.
   *
   * Carried on the chip so the lane can clamp a drag to the same walls the ops
   * clamp to. Without it the preview followed the cursor anywhere and the op
   * clamped on commit, so a drag past the end of a clip showed you a position
   * and then took it away.
   */
  elementStartUs: number
  elementDurationUs: number
  /** Which row it was packed onto. Rows only appear when chips would collide. */
  row: number
}

/**
 * The shortest an effect can be dragged to. Three frames at 30fps.
 *
 * Here rather than in edits.ts because both the op and the lane's preview need
 * it, and they have to agree: a preview that stops somewhere the op does not is
 * the same lie as no clamp at all.
 */
export const MIN_EFFECT_US = 100_000

/** A clip an effect could land on: an id and a span in scene time. */
export type EffectHost = {
  id: string
  startUs: number
  durationUs: number
}

/**
 * Where an effect ends up if it is dragged by this much.
 *
 * The one place the rule lives, read by the lane while a drag is in flight and
 * by `moveEffect` when it lands, so the preview cannot promise a position the
 * commit will not honour. That gap is exactly what made the last round of drags
 * spring back.
 *
 * The rule: an effect travels the whole track and sits on whichever clip holds
 * its new start. It stays inside that one clip, because an effect is one entry
 * on one element and there is nowhere to store half of it — so one longer than
 * the clip it lands on is truncated to fit, visibly, while you are still
 * holding it.
 */
export function effectLanding(
  hosts: EffectHost[],
  span: { startUs: number; durationUs: number },
  deltaUs: number
): { elementId: string; startUs: number; durationUs: number } | null {
  if (hosts.length === 0) return null

  const ordered = [...hosts].sort((a, b) => a.startUs - b.startUs)
  const desired = span.startUs + deltaUs

  const host =
    ordered.find(
      (candidate) =>
        desired >= candidate.startUs &&
        desired < candidate.startUs + candidate.durationUs
    ) ??
    // Past either end of the track, or in a gap. The nearest clip is the one
    // the cursor is heading for, and refusing to place it at all would make the
    // chip stick at the boundary for the rest of the drag.
    (desired < ordered[0].startUs ? ordered[0] : ordered[ordered.length - 1])

  const durationUs = Math.min(span.durationUs, host.durationUs)
  const latest = host.startUs + host.durationUs - durationUs

  return {
    elementId: host.id,
    startUs: Math.round(clamp(desired, host.startUs, latest)),
    durationUs,
  }
}

/** Where a chip would sit if a move of this size landed now. */
export function previewMove(
  chip: EffectChip,
  deltaUs: number,
  hosts: EffectHost[]
): { startUs: number; durationUs: number } {
  const landing = effectLanding(
    hosts,
    { startUs: chip.startUs, durationUs: chip.durationUs },
    deltaUs
  )

  return landing
    ? { startUs: landing.startUs, durationUs: landing.durationUs }
    : { startUs: chip.startUs, durationUs: chip.durationUs }
}

/** Where a chip would sit if a drag of this edge landed now. */
export function previewResize(
  chip: EffectChip,
  edge: "start" | "end",
  deltaUs: number
): { startUs: number; durationUs: number } {
  const endUs = chip.startUs + chip.durationUs
  const elementEndUs = chip.elementStartUs + chip.elementDurationUs

  if (edge === "start") {
    const startUs = clamp(
      chip.startUs + deltaUs,
      chip.elementStartUs,
      endUs - MIN_EFFECT_US
    )
    return { startUs, durationUs: endUs - startUs }
  }

  const next = clamp(
    endUs + deltaUs,
    chip.startUs + MIN_EFFECT_US,
    elementEndUs
  )

  return { startUs: chip.startUs, durationUs: next - chip.startUs }
}

function clamp(value: number, low: number, high: number): number {
  // `high` can sit below `low` for an effect that already fills its clip, and
  // an unguarded clamp would then return the *upper* bound and move a chip that
  // has nowhere to go.
  if (high < low) return low
  return value < low ? low : value > high ? high : value
}

/**
 * The parameter a chip reads and a control writes.
 *
 * One per type, because an effect has a headline number and then details. A UI
 * that made you pick which of a zoom's three parameters you meant before you
 * could change how far it pushes would be technically complete and unusable.
 *
 * Derived from the catalogue rather than written out again. It was written out
 * again for one version, and the two were only in agreement because both were
 * short enough to hold in your head.
 */
export const PRIMARY_PARAM = Object.fromEntries(
  EFFECTS.map((spec) => [spec.type, spec.param])
) as Record<Effect["type"], string>

export function channelPath(effectId: string, param: string): string {
  return `effects.${effectId}.params.${param}`
}

/** Every effect on a track, positioned in scene time and packed into rows. */
export function effectChips(track: Track): EffectChip[] {
  const chips = track.elements.flatMap(chipsForElement)

  return packRows(
    // Sorted before packing so the greedy pack is deterministic: the same
    // document must produce the same rows on every render, or a chip would
    // hop lanes when something unrelated re-rendered.
    [...chips].sort((a, b) => a.startUs - b.startUs || a.id.localeCompare(b.id))
  )
}

/** How many rows the lane needs. Zero when the track carries no effects. */
export function effectRowCount(chips: EffectChip[]): number {
  return chips.reduce((rows, chip) => Math.max(rows, chip.row + 1), 0)
}

function chipsForElement(element: TimelineElement): EffectChip[] {
  const chips: EffectChip[] = []

  if ("effects" in element) {
    for (const effect of element.effects) {
      const param = PRIMARY_PARAM[effect.type]
      const channel =
        "animations" in element
          ? element.animations.channels[channelPath(effect.id, param)]
          : undefined

      const window = channelWindow(channel)

      chips.push({
        id: `${element.id}:${effect.id}`,
        elementId: element.id,
        effectId: effect.id,
        kind: effect.type,
        // A static effect has no curve, so it applies for as long as the clip
        // is on screen. Drawing it as a zero-width chip would hide the ones
        // somebody set once and never animated.
        startUs: element.startUs + (window?.startUs ?? 0),
        durationUs: window ? window.durationUs : element.durationUs,
        windowed: window !== null,
        elementStartUs: element.startUs,
        elementDurationUs: element.durationUs,
        amount:
          peakOf(channel) ??
          effect.params[param] ??
          defaultParam(effect.type, param),
        row: 0,
      })
    }
  }

  if ("animations" in element) {
    const opacity = element.animations.channels.opacity
    for (const fade of fadeWindows(opacity)) {
      chips.push({
        id: `${element.id}:${fade.kind}`,
        elementId: element.id,
        effectId: null,
        kind: fade.kind,
        startUs: element.startUs + fade.startUs,
        durationUs: fade.durationUs,
        amount: null,
        // A fade is pinned to the ends of its clip — one that starts a second
        // late is a flash, not a fade — so it is shown and never dragged.
        windowed: false,
        elementStartUs: element.startUs,
        elementDurationUs: element.durationUs,
        row: 0,
      })
    }
  }

  return chips
}

function channelWindow(
  channel: AnimationChannel | undefined
): { startUs: number; durationUs: number } | null {
  const keys = channel?.keys
  if (!keys || keys.length < 2) return null

  const startUs = keys[0].timeUs
  return {
    startUs,
    durationUs: Math.max(0, keys[keys.length - 1].timeUs - startUs),
  }
}

function peakOf(channel: AnimationChannel | undefined): number | null {
  const keys = channel?.keys
  if (!keys || keys.length === 0) return null

  return keys.reduce(
    (peak, key) => (key.value > peak ? key.value : peak),
    keys[0].value
  )
}

function defaultParam(type: Effect["type"], param: string): number | null {
  const defaults = EFFECT_DEFAULTS[type] as Record<string, number>
  return defaults[param] ?? null
}

/**
 * A fade in and a fade out, read off one opacity channel.
 *
 * `fade()` writes both into a single channel, so drawing that channel as one
 * chip would put a bar across the entire clip and call it a fade — when what is
 * actually there is a second at each end and nothing in between. The ends are
 * where the information is: a channel that starts below full is a fade in, and
 * one that ends below full is a fade out.
 */
function fadeWindows(
  channel: AnimationChannel | undefined
): { kind: "fade-in" | "fade-out"; startUs: number; durationUs: number }[] {
  const keys = channel?.keys
  if (!keys || keys.length < 2) return []

  const windows: {
    kind: "fade-in" | "fade-out"
    startUs: number
    durationUs: number
  }[] = []

  if (keys[0].value < 1) {
    const settles = keys.find((key) => key.value >= 1)
    if (settles) {
      windows.push({
        kind: "fade-in",
        startUs: keys[0].timeUs,
        durationUs: Math.max(0, settles.timeUs - keys[0].timeUs),
      })
    }
  }

  const last = keys[keys.length - 1]
  if (last.value < 1) {
    const leaves = [...keys].reverse().find((key) => key.value >= 1)
    if (leaves) {
      windows.push({
        kind: "fade-out",
        startUs: leaves.timeUs,
        durationUs: Math.max(0, last.timeUs - leaves.timeUs),
      })
    }
  }

  return windows
}

/**
 * Put each chip on the first row it fits, adding a row only when one collides.
 *
 * Greedy, and that is the point. A cut with four punch-ins that do not overlap
 * gets one row; a clip carrying a zoom and a blur at the same moment gets two.
 * A row per effect type would mean three permanently empty rows in a timeline
 * that has to fit a spine, captions and a ruler on a laptop, for effects most
 * cuts never use — so the type lives on the chip, where it is legible whichever
 * row it landed on.
 */
function packRows(chips: EffectChip[]): EffectChip[] {
  const rowEnds: number[] = []

  return chips.map((chip) => {
    const end = chip.startUs + chip.durationUs
    // Touching is not overlapping: a release that ends exactly where the next
    // push begins is a normal cut, and pushing it to a second row would read as
    // a conflict that is not there.
    let row = rowEnds.findIndex((rowEnd) => rowEnd <= chip.startUs)
    if (row === -1) row = rowEnds.length

    rowEnds[row] = end
    return { ...chip, row }
  })
}

/**
 * What the chip says. Short, because a chip is often 40px wide.
 *
 * Shortened names rather than the catalogue's full ones: "Black and white" is
 * nineteen characters and a chip that wide is a chip that covers its neighbour.
 * The panel says the long name, the chip says the short one, and both come from
 * the same row of the same table.
 */
const CHIP_NAME: Partial<Record<EffectChip["kind"], string>> = {
  brightness: "Bright",
  saturation: "Sat",
  contrast: "Contrast",
  hue: "Hue",
  grayscale: "B&W",
  sepia: "Sepia",
  invert: "Invert",
}

export function effectLabel(chip: EffectChip): string {
  if (chip.kind === "fade-in") return "Fade in"
  if (chip.kind === "fade-out") return "Fade out"

  const spec = effectSpec(chip.kind)
  const name = CHIP_NAME[chip.kind] ?? spec.label

  return chip.amount === null ? name : `${name} ${spec.format(chip.amount)}`
}

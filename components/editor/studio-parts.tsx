"use client"

import * as React from "react"
import {
  CaptionsIcon,
  MusicNote01Icon,
  PauseIcon,
  PlayIcon,
  Video01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"

import type { TrackKind } from "@/lib/editor/types"

import type { Filmstrip as FilmstripSheet } from "./studio"
import { cn } from "@/lib/utils"

import { rulerMarks } from "./ruler"

/**
 * Shared timeline pieces, ported from app/prototypes/editor/parts.tsx.
 *
 * Two decisions here are the whole "make it ours" answer:
 *
 * **No rainbow tracks.** Giving every lane its own saturated hue — purple
 * captions, blue b-roll, green audio, orange zoom — works in a
 * neutral grey product and would fight this one, where the kit gives one hue
 * per job (docs/design/colour.md). Lane identity comes from the icon, the
 * label and the row height instead. Restraint reads as intent; eight hues read
 * as a toolbar.
 *
 * **Live is not the agent colour.** It would be the obvious pick and it is
 * wrong: the kit's live green is a dot that means "this is running", and
 * spending it on provenance would leave nothing to mean live. Agent work is
 * marked structurally — a hatched top edge — and live is kept for the
 * playhead's head while it is actually moving.
 *
 * What the prototype's version carried and this one does not: `usePlayhead`
 * (a rAF fake, replaced by the real element in use-player), the mocked
 * `Preview`, `Scrubber`, and the `MUSIC_PEAKS` waveform. Those were stand-ins
 * for data that now exists.
 */

export const TRACK_ICON: Record<TrackKind, IconSvgElement> = {
  video: Video01Icon,
  broll: Video01Icon,
  audio: MusicNote01Icon,
  caption: CaptionsIcon,
  text: CaptionsIcon,
  graphic: CaptionsIcon,
}

export function formatClock(us: number): string {
  const total = Math.max(0, Math.floor(us / 1_000_000))
  const minutes = String(Math.floor(total / 60)).padStart(2, "0")
  const seconds = String(total % 60).padStart(2, "0")
  return `${minutes}:${seconds}`
}

/**
 * Minutes, seconds and tenths: the transport's precision, and the margin's.
 *
 * One place for time (plans/036, the round 5 audit): the run's summary line
 * says "00:37.0 → 00:32.5" and the transport beside the lanes reads in the
 * same tenths, so the two numbers can be compared by eye. Truncated, not
 * rounded, like `formatClock`, so the playhead never reads ahead of the frame.
 */
export function formatClockTenths(us: number): string {
  const clamped = Math.max(0, us)
  const tenths = Math.floor((clamped % 1_000_000) / 100_000)
  return `${formatClock(clamped)}.${tenths}`
}

/**
 * The transport's position readout, ticking without React.
 *
 * The clock is per-frame content in a tree that must not re-render per frame,
 * so it subscribes to the player and writes its own text node. Seconds
 * resolution means most frames write the same string; the guard keeps those
 * writes off the DOM entirely.
 */
export function PlayheadClock({
  player,
}: {
  player: {
    readPlayhead: () => number
    subscribePlayhead: (listener: (atUs: number) => void) => () => void
  }
}) {
  const ref = React.useRef<HTMLSpanElement>(null)

  React.useLayoutEffect(() => {
    let shown = ""
    const write = (atUs: number) => {
      const next = formatClockTenths(atUs)
      if (next === shown || !ref.current) return
      shown = next
      ref.current.textContent = next
    }

    write(player.readPlayhead())
    return player.subscribePlayhead(write)
  }, [player])

  return <span ref={ref} />
}

/**
 * Minutes, seconds and frames, for anything that has to distinguish two
 * instants inside the same second.
 *
 * `formatClock` truncates to whole seconds, which is right for a duration and
 * useless as a label on a two-second effect: on a fifteen-second cut every
 * punch-in reads "00:00". Frames are what an edit is actually placed in.
 */
export function formatTimecode(us: number, fps = 30): string {
  const clamped = Math.max(0, us)
  const frames = Math.floor(((clamped % 1_000_000) / 1_000_000) * fps)
  // Colon between seconds and frames, the way every NLE and the SMPTE spec
  // write it. A full stop reads as a decimal fraction of a second, which this
  // is not — frame 15 of 30 is halfway, and ".15" says fifteen hundredths.
  return `${formatClock(clamped)}:${String(frames).padStart(2, "0")}`
}

export function PlayButton({
  playing,
  onToggle,
  size = "md",
}: {
  playing: boolean
  onToggle: () => void
  size?: "sm" | "md"
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={playing ? "Pause" : "Play"}
      className={cn(
        "relative grid shrink-0 place-items-center rounded-full bg-kit-control text-kit-ink shadow-kit-control",
        // A 44px target around the 28px or 36px circle, without moving it.
        "before:absolute before:top-1/2 before:left-1/2 before:size-11 before:-translate-1/2 before:rounded-full before:content-['']",
        "transition-[background-color,transform] duration-150 ease-out",
        "hover:bg-kit-row-hover active:scale-[0.96]",
        "outline-hidden focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kit-focus",
        size === "md" ? "size-9" : "size-7"
      )}
    >
      <HugeiconsIcon
        aria-hidden="true"
        icon={playing ? PauseIcon : PlayIcon}
        size={size === "md" ? 16 : 13}
        // The triangle's weight sits left of its box; 1px right reads centred.
        className={playing ? undefined : "translate-x-px"}
      />
    </button>
  )
}

/**
 * The playhead.
 *
 * Ink while playing, with the kit's live green on its head: live is a dot
 * only (docs/design/colour.md), and the head is the one dot here. A playhead
 * that is live at rest spends the whole session claiming something is
 * happening, so parked it is a muted rule with a muted head.
 */
export function Playhead({
  positionUs,
  spanUs,
  live,
}: {
  positionUs: number
  /** What the lane is scaled to. During a run that is the take rather than the
      cut, and a playhead measured against the wrong one sits in the wrong
      place — the ruler and the clips would disagree about the same instant. */
  spanUs: number
  live: boolean
}) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 z-20 w-px"
      style={{
        left: `${Math.min(1, Math.max(0, positionUs / spanUs)) * 100}%`,
      }}
    >
      <div
        className={cn("h-full w-px", live ? "bg-kit-ink" : "bg-kit-ink-muted")}
      />
      <div
        className={cn(
          "absolute -top-0.5 -left-[3px] size-[7px] rounded-full",
          live ? "bg-kit-ink" : "bg-kit-ink-muted"
        )}
      />
    </div>
  )
}

export function TimeRuler({
  marks = 7,
  spanUs,
  fps = 30,
}: {
  /** The most labels the lane has room for; the step is rounded from it. */
  marks?: number
  spanUs: number
  fps?: number
}) {
  // Round steps with the precision the step needs (components/editor/ruler.ts):
  // a 1.3 s clip reads 00:00.0, 00:00.5, 00:01.0, never "00:00" five times.
  const ticks = rulerMarks(spanUs, marks, fps)
  return (
    <div className="relative h-5 text-kit-ink-muted select-none">
      {ticks.map((tick) => {
        const left = spanUs > 0 ? (tick.atUs / spanUs) * 100 : 0
        // A label near the end reads to the left of its tick, so it never
        // runs past the lane (and never gives the lane a scrollbar at fit).
        const last = left > 88
        return (
          <span
            key={tick.atUs}
            className="absolute top-0 flex h-full items-start gap-1 text-kit-mono whitespace-nowrap tabular-nums"
            style={{
              left: `${left}%`,
              transform: last ? "translateX(-100%)" : undefined,
            }}
          >
            {/* A short tick at the mark itself; the label reads to its right. */}
            <span aria-hidden="true" className={cn("h-2 w-px bg-kit-hairline", last && "order-last")} />
            {tick.label}
          </span>
        )
      })}
    </div>
  )
}

/**
 * The clip's own frames, tiled across it.
 *
 * Sliced against the **source**, not the timeline, which is the same argument
 * `ClipWaveform` makes below and for the same reason. A clip is a window onto
 * an asset: the tile belonging to a given x is the one sampled nearest
 * `trimStart + (x/width) * (trimEnd - trimStart)`. Drawn as a plain repeat, a
 * trim would slide the pictures out from under the footage they are of, and by
 * the second cut every clip would be showing somebody else's frames.
 *
 * One sheet, many `background-position`s. Each tile is a div pointing at the
 * same image with a different offset, so a forty-thumbnail clip is one request
 * and forty composited crops of a decoded bitmap the browser already holds.
 *
 * Falls back to the hairlines it used to be when the strip is missing — an
 * asset ingested before this existed, or one whose strip step failed. A spine
 * with no pictures is what the spine has always been; a blank one would be a
 * regression for every file already in the library.
 */
/**
 * A ceiling on tiles per clip, for the pathological case only.
 *
 * A clip can be as wide as the lane, and at 32x that is thousands of pixels —
 * four hundred tiles is twelve thousand of them at portrait width, past any
 * real timeline. Reached, the strip stops short of the clip's right edge rather
 * than stretching to meet it: an honest gap beats a distorted picture, which is
 * the whole point of this component's shape.
 */
const MAX_TILES_PER_CLIP = 400

/**
 * The clip on the spine: 60px tall (the lane's 76px, less its own `py-1` and
 * the clip's `inset-y-1`), split into a 44px row of frames over a 16px strip
 * of its own waveform (the desk, plans/036 phase E). Both are fixed pixel heights, so a tile's width follows
 * from the sheet's proportions alone and server and client draw the same.
 */
export const CLIP_FILM_HEIGHT = 44
export const CLIP_WAVE_HEIGHT = 16

/**
 * What a clip shows: its frames over its own waveform, the two strips
 * square and stacked, clipped by whatever rounded box holds them. The main
 * lane and the three-cuts spines both draw a clip from here, so a spine is
 * the same clip at a smaller size, not a second drawing of it.
 *
 * `heightPx` is the clip's inner height; the wave takes the main lane's
 * share of it (16 of 60) and the frames the rest, so tiles keep their aspect
 * and a smaller clip just shows fewer, thinner ones. `widthPx` of 0 (not
 * measured yet, on server and client alike) draws the empty frame row and
 * no wave.
 */
export function ClipFace({
  strip,
  wave,
  trimStartUs,
  trimEndUs,
  widthPx,
  heightPx = CLIP_FILM_HEIGHT + CLIP_WAVE_HEIGHT,
}: {
  strip: FilmstripSheet | null
  /** The asset's seek index; null draws an empty strip. */
  wave: { values: number[]; intervalUs: number } | null
  trimStartUs: number
  trimEndUs: number
  widthPx: number
  heightPx?: number
}) {
  const waveHeight = Math.round(
    (heightPx * CLIP_WAVE_HEIGHT) / (CLIP_FILM_HEIGHT + CLIP_WAVE_HEIGHT)
  )
  return (
    <>
      <Filmstrip
        strip={strip}
        trimStartUs={trimStartUs}
        trimEndUs={trimEndUs}
        widthPx={widthPx}
        heightPx={heightPx - waveHeight}
      />
      {/* The frames say where you are, the strip says where the talking is. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 bg-kit-object"
        style={{ height: waveHeight }}
      >
        {wave && widthPx > 0 ? (
          <ClipWaveform
            peaks={wave.values}
            intervalUs={wave.intervalUs}
            trimStartUs={trimStartUs}
            trimEndUs={trimEndUs}
            widthPx={widthPx}
            heightPx={waveHeight}
          />
        ) : null}
      </div>
    </>
  )
}

export function Filmstrip({
  strip,
  trimStartUs,
  trimEndUs,
  widthPx,
  heightPx = CLIP_FILM_HEIGHT,
}: {
  strip?: FilmstripSheet | null
  trimStartUs: number
  trimEndUs: number
  /** The clip's rendered width, which decides how many tiles fit. */
  widthPx: number
  /** The row's height; a tile's width is this times the sheet's aspect. */
  heightPx?: number
}) {
  if (!strip || widthPx <= 0) {
    return (
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 opacity-70"
        style={{
          height: heightPx,
          backgroundImage:
            "repeating-linear-gradient(90deg, color-mix(in oklch, var(--color-kit-hairline) 40%, transparent) 0 1px, transparent 1px 22px)",
        }}
      />
    )
  }

  /**
   * Every tile is drawn at its true shape, at a fixed width, and the clip's
   * edge cuts the last one off rather than squashing it. A narrow clip shows
   * fewer tiles; a three-second clip on a long take shows one.
   *
   * The width is computed from a fixed pixel height and the sheet's own
   * proportions, so it is the same number on the server and the client and
   * no padding change above can distort a face again (it happened twice when
   * the width was divided evenly between tiles, and when the height was
   * guessed from the lane).
   */
  const tileWidth = Math.max(
    8,
    Math.round((heightPx * strip.tileWidth) / strip.tileHeight)
  )
  const count = Math.min(
    MAX_TILES_PER_CLIP,
    Math.max(1, Math.ceil(widthPx / tileWidth))
  )
  const sourceSpan = Math.max(1, trimEndUs - trimStartUs)

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 flex overflow-hidden"
      style={{ height: heightPx }}
    >
      {Array.from({ length: count }, (_, i) => {
        // The source under the middle of this tile's own x, so a cut-off last
        // tile shows the frame from the part of it you can see, and a tile
        // stays over the footage it is of.
        const fraction = Math.min(1, ((i + 0.5) * tileWidth) / widthPx)
        const atUs = trimStartUs + fraction * sourceSpan
        const index = Math.min(
          strip.tiles - 1,
          Math.max(0, Math.round(atUs / strip.intervalUs))
        )

        return (
          <div
            key={i}
            className="h-full shrink-0"
            style={{
              width: tileWidth,
              backgroundImage: `url(${strip.url})`,
              // Percentages, not pixels. The sheet is N tiles wide, so at
              // `N * 100%` one tile fills the element exactly whatever the
              // element turns out to be — and the offset that lands on tile i
              // is i/(N-1) of the overflow, which is the sprite-sheet identity.
              backgroundSize: `${strip.tiles * 100}% 100%`,
              backgroundPosition:
                strip.tiles > 1
                  ? `${(index / (strip.tiles - 1)) * 100}% 0`
                  : "0 0",
            }}
          />
        )
      })}
    </div>
  )
}

/**
 * The clip's own audio, drawn inside the clip.
 *
 * This is the piece the improvised timeline got wrong and it is worth saying
 * why. Peaks are indexed against the **source**, and a clip is a window onto
 * the source — so drawing one waveform across the whole lane is only correct
 * until the first cut, after which every peak is displaced by the length of
 * everything removed before it. Slicing per clip is correct by construction: a
 * clip renders exactly the peaks between its own trim points, at its own width,
 * wherever it has been moved to.
 *
 * Drawn as the lab drew it (app/prototypes/lab/cuts/round-1/parts.tsx,
 * `Waveform`): evenly spaced rounded bars on a fixed 3px pitch, 1.6px wide,
 * centred on the strip's middle line, in the muted ink. A fixed pitch is
 * what makes it read as a waveform at a glance: bars stretched to fill the
 * clip turn into a grey smear at fit and into slabs when zoomed. One SVG,
 * one node per bar, no layout per bar.
 */
const WAVE_PITCH = 3
const WAVE_BAR = 1.6

const r2 = (n: number) => Math.round(n * 100) / 100

export function ClipWaveform({
  peaks,
  intervalUs,
  trimStartUs,
  trimEndUs,
  widthPx,
  heightPx,
  /** Cap on bars drawn, for a clip zoomed across thousands of pixels. */
  maxBars = 600,
  className,
}: {
  peaks: number[]
  intervalUs: number
  trimStartUs: number
  trimEndUs: number
  /** The clip's rendered width; the bar count follows from it. */
  widthPx: number
  heightPx: number
  maxBars?: number
  className?: string
}) {
  /**
   * The loudest moment in the whole asset, which is what the bars are drawn
   * against. Per asset, not per clip: normalising each clip to its own
   * maximum would make a quiet half of a split look as loud as the shout it
   * was cut from. A loop, not `Math.max(...peaks)`: fifteen minutes is
   * 45,000 values and spreading that many arguments overflows the stack.
   */
  const ceiling = React.useMemo(() => {
    let loudest = 0
    for (const peak of peaks) if (peak > loudest) loudest = peak
    return loudest > 0 ? loudest : 1
  }, [peaks])

  const count = Math.min(maxBars, Math.max(0, Math.floor((widthPx - 2) / WAVE_PITCH)))

  const bars = React.useMemo(() => {
    if (peaks.length === 0 || intervalUs <= 0 || count === 0) return []

    const from = Math.max(0, Math.floor(trimStartUs / intervalUs))
    const to = Math.min(peaks.length, Math.max(from + 1, Math.ceil(trimEndUs / intervalUs)))
    const span = to - from

    // Each bar takes the loudest peak in its stretch of source, not the
    // average: the waveform exists to show where sound is, and averaging
    // flattens the transients that say a word starts here.
    return Array.from({ length: count }, (_, index) => {
      const start = from + Math.floor((index * span) / count)
      const end = Math.max(start + 1, from + Math.floor(((index + 1) * span) / count))
      let peak = 0
      for (let i = start; i < end && i < to; i++) if (peaks[i] > peak) peak = peaks[i]
      return peak
    })
  }, [peaks, intervalUs, trimStartUs, trimEndUs, count])

  if (bars.length === 0) return null

  const usable = heightPx - 2
  return (
    <svg
      aria-hidden="true"
      width={count * WAVE_PITCH}
      height={heightPx}
      className={cn("absolute top-0 left-px fill-kit-ink-muted", className)}
    >
      {bars.map((peak, index) => {
        // Square-root, so ordinary speech is not drawn on the floor: a phone
        // at arm's length peaks near 0.1 and a syllable near 0.003. Sound
        // starts at a quarter of the strip, as the lab's bars do, so the
        // strip reads at a glance; silence keeps a 1.5px dot.
        const level = Math.sqrt(peak / ceiling)
        const h = r2(level < 0.04 ? 1.5 : (0.25 + 0.75 * level) * usable)
        return (
          <rect
            key={index}
            x={r2(index * WAVE_PITCH)}
            y={r2((heightPx - h) / 2)}
            width={WAVE_BAR}
            height={h}
            rx={WAVE_BAR / 2}
          />
        )
      })}
    </svg>
  )
}

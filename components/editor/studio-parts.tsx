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

import type { Provenance, TrackKind } from "@/lib/editor/types"

import type { Filmstrip as FilmstripSheet } from "./studio"
import { cn } from "@/lib/utils"

/**
 * Shared timeline pieces, ported from app/prototypes/editor/parts.tsx.
 *
 * Two decisions here are the whole "make it ours" answer, and both are
 * departures from the reference:
 *
 * **No rainbow tracks.** Stanley gives every lane its own saturated hue —
 * purple captions, blue b-roll, green audio, orange zoom. That works in a
 * neutral grey product and would fight this one, where brass and sand share a
 * single hue on purpose. Lane identity comes from the icon, the label and the
 * row height instead. Restraint reads as intent; eight hues read as a toolbar.
 *
 * **Brass is not the agent colour.** It would be the obvious pick and it is
 * wrong: AGENTS.md reserves brass for "this ritual is running", and spending it
 * on provenance would leave nothing to mean live. Agent work is marked
 * structurally — a hatched top edge — and brass is kept for the playhead while
 * it is actually moving.
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
      const next = formatClock(atUs)
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
        "grid shrink-0 place-items-center rounded-full border border-border/60 bg-card text-foreground",
        "transition-[background-color,transform] duration-150 ease-out",
        "hover:bg-secondary active:scale-[0.96]",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
        size === "md" ? "size-9" : "size-7"
      )}
    >
      <HugeiconsIcon
        aria-hidden="true"
        icon={playing ? PauseIcon : PlayIcon}
        size={size === "md" ? 16 : 13}
      />
    </button>
  )
}

/**
 * The playhead.
 *
 * Brass only while playing. The prototype's comment said so and its code drew
 * brass unconditionally, which is the kind of drift that turns a reserved token
 * into a decoration — AGENTS.md keeps brass for "this ritual is running", and a
 * playhead that is brass at rest spends the whole session claiming something is
 * happening. Parked, it is a plain foreground rule.
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
        className={cn("h-full w-px", live ? "bg-signal" : "bg-foreground/70")}
      />
      <div
        className={cn(
          "absolute -top-0.5 -left-[3px] size-[7px] rounded-full",
          live ? "bg-signal" : "bg-foreground/70"
        )}
      />
    </div>
  )
}

export function TimeRuler({
  marks = 7,
  spanUs,
}: {
  marks?: number
  spanUs: number
}) {
  return (
    <div className="relative h-5 text-muted-foreground select-none">
      {Array.from({ length: marks }, (_, i) => {
        const at = (i / (marks - 1)) * spanUs
        return (
          <span
            key={i}
            className="absolute top-0 text-[10px] tabular-nums"
            style={{
              left: `${(i / (marks - 1)) * 100}%`,
              transform:
                i === 0
                  ? "none"
                  : i === marks - 1
                    ? "translateX(-100%)"
                    : "translateX(-50%)",
            }}
          >
            {formatClock(at)}
          </span>
        )
      })}
    </div>
  )
}

/**
 * Agent authorship, as texture rather than colour.
 *
 * A 2px hatched rule along the top edge of the clip. It survives at every zoom
 * level, it does not compete with selection, and it leaves the palette alone.
 */
export function AgentMark({ provenance }: { provenance: Provenance }) {
  const byAgent = provenance.createdBy === "agent"
  const touchedByUser = provenance.lastEditedBy === "user"
  if (!byAgent) return null

  return (
    <span
      aria-hidden="true"
      className="absolute inset-x-0 top-0 h-[2px]"
      style={{
        backgroundImage: touchedByUser
          ? // Half-erased: the agent made it, you changed it since.
            "repeating-linear-gradient(90deg, color-mix(in oklch, var(--color-sand-500) 60%, transparent) 0 2px, transparent 2px 8px)"
          : "repeating-linear-gradient(90deg, color-mix(in oklch, var(--color-sand-500) 85%, transparent) 0 3px, transparent 3px 6px)",
      }}
    />
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
 * What a clip on the spine actually renders at: the lane's 60px, less its own
 * `py-1` and the clip's `inset-y-1`.
 *
 * Only used to decide how many tiles to lay down. The tiles' proportions come
 * from CSS, so this being wrong costs a tile at the edge and never a distorted
 * frame.
 */
const SPINE_CLIP_HEIGHT = 44

export function Filmstrip({
  strip,
  trimStartUs,
  trimEndUs,
  widthPx,
}: {
  strip?: FilmstripSheet | null
  trimStartUs: number
  trimEndUs: number
  /** The clip's rendered width, which decides how many tiles fit. */
  widthPx: number
}) {
  if (!strip || widthPx <= 0) {
    return (
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, color-mix(in oklch, var(--color-sand-400) 40%, transparent) 0 1px, transparent 1px 22px)",
        }}
      />
    )
  }

  /**
   * Every tile is drawn at its true shape, and the last one is cut off.
   *
   * The proportions come from `aspect-ratio` against the rendered height rather
   * than from a width computed here, and that is the whole point. Twice now the
   * arithmetic went wrong in a way nothing looked broken by: first the clip's
   * width was divided evenly between tiles, drawing every face 15% narrow, and
   * then the tile was sized against the lane's 88px when a clip actually renders
   * at 80 — the lane's padding and the clip's inset both come out of it —
   * stretching each frame 11%. Both were invisible as bugs and obvious as
   * "something is off about the footage".
   *
   * CSS knows the rendered height. Letting it derive the width from the sheet's
   * own tile proportions means no padding change anywhere above can distort the
   * picture again; at worst a tile count is off by one and the strip clips a
   * pixel early, which is what a filmstrip against a mark looks like anyway.
   */
  const tileAspect = strip.tileWidth / strip.tileHeight
  const count = Math.min(
    MAX_TILES_PER_CLIP,
    Math.max(1, Math.ceil(widthPx / (SPINE_CLIP_HEIGHT * tileAspect)))
  )
  const sourceSpan = Math.max(1, trimEndUs - trimStartUs)

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 flex overflow-hidden"
    >
      {Array.from({ length: count }, (_, i) => {
        // The middle of this tile's slot, so a half-visible tile at the end of a
        // clip still shows the frame from the part of it you can see.
        const atUs = trimStartUs + ((i + 0.5) / count) * sourceSpan
        const index = Math.min(
          strip.tiles - 1,
          Math.max(0, Math.round(atUs / strip.intervalUs))
        )

        return (
          <div
            key={i}
            className="h-full shrink-0"
            style={{
              aspectRatio: `${strip.tileWidth} / ${strip.tileHeight}`,
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
 * Bars rather than an SVG path because the lane is 44px and a path at that
 * height is a smear.
 */
export function ClipWaveform({
  peaks,
  intervalUs,
  trimStartUs,
  trimEndUs,
  /** Cap on bars drawn. A 15 minute clip is 45,000 peaks and 45,000 spans is
      a layout pass nobody can afford while the playhead is moving. */
  maxBars = 240,
  /**
   * Whether the clip has pictures underneath.
   *
   * Sand at 60% is legible on the flat surface the clip used to be and
   * disappears over footage — it is mid-grey, and video contains every value
   * there is. Over frames the bars go white with a dark shadow, which is what
   * survives a shot cutting from a window to a jacket.
   */
  overFrames = false,
}: {
  peaks: number[]
  intervalUs: number
  trimStartUs: number
  trimEndUs: number
  maxBars?: number
  overFrames?: boolean
}) {
  /**
   * The loudest moment in the whole asset, which is what the bars are drawn
   * against.
   *
   * Not full scale. Peaks are absolute sample amplitude, and a phone held at
   * arm's length recording someone talking normally tops out around 0.1 — so
   * against 1.0 the loudest bar was a tenth of the lane and every ordinary
   * syllable, around 0.003, fell under the 4% floor. The result was a flat grey
   * line on a clip with perfectly good audio in it, which reads as "this
   * recording has no sound" rather than "this recording is quiet".
   *
   * Per asset rather than per clip, deliberately. Normalising each clip to its
   * own maximum would make two halves of one split scale differently, so a
   * quiet passage would look as loud as the shout it was cut from — the one
   * thing a waveform must not do. One scale per source keeps loud and quiet
   * comparable everywhere the source appears.
   *
   * Computed with a loop and not `Math.max(...peaks)`: fifteen minutes is
   * 45,000 values and spreading that many arguments overflows the stack.
   */
  const ceiling = React.useMemo(() => {
    let loudest = 0
    for (const peak of peaks) if (peak > loudest) loudest = peak
    // A silent track has nothing to normalise against; 1 leaves every bar on
    // the floor, which is the honest picture of silence.
    return loudest > 0 ? loudest : 1
  }, [peaks])

  const bars = React.useMemo(() => {
    if (peaks.length === 0 || intervalUs <= 0) return []

    const from = Math.max(0, Math.floor(trimStartUs / intervalUs))
    const to = Math.min(peaks.length, Math.ceil(trimEndUs / intervalUs))
    const window = peaks.slice(from, to)

    if (window.length <= maxBars) return window

    // Downsampled by peak, not by average: the waveform exists to show where
    // sound is, and averaging flattens transients until a percussive talk
    // looks like a flat bar.
    const step = window.length / maxBars
    return Array.from({ length: maxBars }, (_, index) => {
      const start = Math.floor(index * step)
      const end = Math.max(start + 1, Math.floor((index + 1) * step))
      let peak = 0
      for (let i = start; i < end && i < window.length; i++) {
        if (window[i] > peak) peak = window[i]
      }
      return peak
    })
  }, [peaks, intervalUs, trimStartUs, trimEndUs, maxBars])

  if (bars.length === 0) return null

  return (
    <div
      aria-hidden="true"
      className={cn(
        "absolute inset-x-0 bottom-0 flex h-1/2 items-end gap-px px-0.5",
        overFrames ? "opacity-90" : "opacity-60"
      )}
      style={
        overFrames
          ? { filter: "drop-shadow(0 0 1px rgba(0,0,0,0.85))" }
          : undefined
      }
    >
      {bars.map((peak, index) => (
        <span
          key={index}
          // Square ends, not rounded: at fit a bar is a pixel, and `rounded-full`
          // zoomed to 8x fills the lane with circles.
          className={cn(
            "min-w-px flex-1 rounded-[1px]",
            overFrames ? "bg-white" : "bg-sand-500 dark:bg-sand-400"
          )}
          style={{
            height: `${Math.max(4, Math.round((peak / ceiling) * 100))}%`,
          }}
        />
      ))}
    </div>
  )
}

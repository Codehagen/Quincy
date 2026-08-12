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
import { cn } from "@/lib/utils"

import { CUT_DURATION, MUSIC_PEAKS, SPINE } from "./data"

/**
 * Shared timeline pieces.
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
 * it is actually moving, which is the one genuinely live thing on the surface.
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

/** Fraction of the cut, 0..1, for positioning anything on the timeline. */
export function fraction(us: number): number {
  return Math.min(1, Math.max(0, us / CUT_DURATION))
}

/**
 * A playhead that actually moves.
 *
 * Driven by rAF against a start timestamp rather than by a state tick per
 * frame: a 30-times-a-second setState would re-render every clip in the lane
 * and the prototype would stutter for reasons the real editor would not.
 */
export function usePlayhead(playing: boolean) {
  const [positionUs, setPositionUs] = React.useState(0)
  const frame = React.useRef<number | null>(null)

  React.useEffect(() => {
    if (!playing) return

    let start: number | null = null
    const from = positionUs

    const step = (now: number) => {
      start ??= now
      const next = from + (now - start) * 1000
      setPositionUs(next >= CUT_DURATION ? 0 : next)
      frame.current = requestAnimationFrame(step)
    }

    frame.current = requestAnimationFrame(step)
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current)
    }
    // positionUs is read once to resume from where it stopped; depending on it
    // would restart the loop on every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing])

  return [positionUs, setPositionUs] as const
}

/** The caption word under the playhead, which is what the preview shows. */
export function useActiveWord(
  positionUs: number,
  words: { text: string; startUs: number; endUs: number }[]
) {
  return React.useMemo(
    () =>
      words.find(
        (word) => positionUs >= word.startUs && positionUs < word.endUs
      ),
    [positionUs, words]
  )
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
 * The playhead. Brass only while playing — the one place the live token earns
 * its meaning on this surface.
 */
export function Playhead({
  positionUs,
  spanUs = CUT_DURATION,
}: {
  positionUs: number
  /** What the lane is scaled to. During a run that is the take rather than the
      cut, and a playhead measured against the wrong one sits in the wrong
      place — the ruler and the clips would disagree about the same instant. */
  spanUs?: number
}) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 z-20 w-px"
      style={{
        left: `${Math.min(1, Math.max(0, positionUs / spanUs)) * 100}%`,
      }}
    >
      <div className="h-full w-px bg-signal" />
      <div className="absolute -top-0.5 -left-[3px] size-[7px] rounded-full bg-signal" />
    </div>
  )
}

export function TimeRuler({
  marks = 7,
  spanUs = CUT_DURATION,
}: {
  marks?: number
  spanUs?: number
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

export function ClipBlock({
  name,
  provenance,
  selected,
  onSelect,
  style,
}: {
  name: string
  provenance: Provenance
  selected?: boolean
  onSelect?: () => void
  style?: React.CSSProperties
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      style={style}
      className={cn(
        "group absolute inset-y-0 overflow-hidden rounded-[4px] px-1.5 text-left",
        "border border-border/70 bg-secondary",
        "transition-[background-color,box-shadow] duration-150 ease-out",
        "hover:bg-sand-200 dark:hover:bg-sand-800",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        selected && "ring-2 ring-foreground/70"
      )}
    >
      <AgentMark provenance={provenance} />
      <span className="block truncate pt-1 text-[10px] leading-4 text-foreground/80">
        {name}
      </span>
    </button>
  )
}

/**
 * Music lane. Peaks are drawn as bars rather than an SVG path because the lane
 * is 28px tall and a path at that height is a smear.
 */
export function Waveform({ ducked = true }: { ducked?: boolean }) {
  return (
    <div className="flex h-full items-center gap-px px-1">
      {MUSIC_PEAKS.map((peak, i) => (
        <span
          key={i}
          className={cn(
            // Square ends, not rounded. `rounded-full` is fine at fit, where a
            // bar is one pixel wide — zoomed to 8x the same bar is 30px and the
            // lane fills with circles.
            //
            // The real fix upstream is resolution: 220 peaks stretched over a
            // 32x lane is one sample per 1.5 seconds. Production reads the peak
            // count the zoom level needs out of the seek index, so a bar is
            // always about a pixel and the roundness never comes up.
            "min-w-px flex-1 rounded-[1px] bg-sand-400 dark:bg-sand-600",
            // Ducking is visible in the waveform itself, which is the honest
            // place for it: the envelope is data, not decoration.
            ducked && i % 17 > 11 && "opacity-40"
          )}
          style={{ height: `${Math.round(peak * 100)}%` }}
        />
      ))}
    </div>
  )
}

/** Filmstrip stand-in. Real thumbnails would come from the seek index. */
export function Filmstrip() {
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
 * The preview. A real player would paint proxy frames to a canvas; the shape,
 * the caption position and the aspect are what a layout decision needs.
 *
 * Vertical by default, because the document's canvas default is 1080×1920 and
 * every surface the atomiser targets is 9:16 except long-form YouTube. A
 * landscape preview would be the editor quietly disagreeing with the project it
 * is showing, and it flatters the layout by taking width the timeline needs.
 */
export function Preview({
  word,
  className,
  aspect = "portrait",
}: {
  word?: string
  className?: string
  aspect?: "portrait" | "landscape"
}) {
  return (
    <div
      className={cn(
        "relative isolate overflow-hidden rounded-md bg-black",
        aspect === "portrait" ? "aspect-[9/16] h-full" : "aspect-video w-full",
        className
      )}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 25%, oklch(0.42 0.012 70) 0%, oklch(0.235 0.008 70) 55%, oklch(0.16 0.006 70) 100%)",
        }}
      />
      {/* Captions sit at 62% of frame height: clear of the face in a talking
          head, above the bar TikTok and Reels overlay along the bottom. */}
      <span
        className="absolute inset-x-0 text-center text-2xl font-bold text-white"
        style={{ top: "62%", textShadow: "0 3px 14px rgba(0,0,0,0.6)" }}
      >
        {word ?? ""}
      </span>
    </div>
  )
}

export function Scrubber({
  positionUs,
  onSeek,
  className,
}: {
  positionUs: number
  onSeek: (us: number) => void
  className?: string
}) {
  return (
    <label className={cn("group relative flex-1", className)}>
      <span className="sr-only">Seek</span>
      <input
        type="range"
        min={0}
        max={CUT_DURATION}
        step={1000}
        value={positionUs}
        onChange={(event) => onSeek(Number(event.target.value))}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="block h-1 w-full overflow-hidden rounded-full bg-border peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--color-ring)]"
      >
        <span
          className="block h-full rounded-full bg-foreground/70"
          style={{ width: `${fraction(positionUs) * 100}%` }}
        />
      </span>
    </label>
  )
}

export const CLIP_COUNT = SPINE.length

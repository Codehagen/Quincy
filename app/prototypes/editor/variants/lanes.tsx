"use client"

import * as React from "react"
import {
  CaptionsIcon,
  MusicNote01Icon,
  Video01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { remapCaptions } from "@/lib/editor/timeline"
import type { Track } from "@/lib/editor/types"
import { cn } from "@/lib/utils"

import { StudioChatMock, type ChatTurn } from "../chat"
import {
  CAPTIONS,
  CUT_DURATION,
  MUSIC,
  SPINE,
  SPINE_BEFORE,
  TRANSCRIPT,
} from "../data"
import {
  Filmstrip,
  Playhead,
  TimeRuler,
  Waveform,
  formatClock,
  useActiveWord,
  usePlayhead,
} from "../parts"
import { REVEAL_TRAVEL_MS, revealDelayMs, useAgentRun } from "../run"
import { ZoomControls, useZoom } from "../zoom"
import { EditorFrame } from "./frame"

/** Pixel width of the lane, so a percentage layout can move by transform. */
function useLaneWidth() {
  const ref = React.useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = React.useState(0)

  React.useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width)
    )
    observer.observe(element)
    setWidth(element.getBoundingClientRect().width)
    return () => observer.disconnect()
  }, [])

  return [ref, width] as const
}

/**
 * Lanes — locked in. Round 2 chose this; everything from here is iteration.
 *
 * Full-height tracks with a header column, filmstrips and hover trim handles.
 * Video on top, captions in the middle, music underneath: the spine is what you
 * look at first, and captions read better sitting directly under the frame they
 * belong to than stacked above it.
 */
export function Lanes() {
  const [playing, setPlaying] = React.useState(false)
  const [positionUs, setPositionUs] = usePlayhead(playing)
  const [selected, setSelected] = React.useState<string | null>(null)
  const run = useAgentRun()
  const zoom = useZoom()
  const [laneRef, laneWidth] = useLaneWidth()

  /**
   * Where the pointer is over the lane, or null.
   *
   * Kept separate from the playhead on purpose. Hover previews an instant;
   * clicking commits to it. The agent never touches either.
   */
  const [hoverUs, setHoverUs] = React.useState<number | null>(null)

  const [draft, setDraft] = React.useState("")
  const [turns, setTurns] = React.useState<ChatTurn[]>([])

  const cut = run.done.has("silences")

  /**
   * The scale never changes.
   *
   * Everything is laid out against the finished cut, so at rest the row is
   * exactly full and there is no empty tail. During a reveal the clips that
   * have not moved yet sit at the take's spacing, which overflows to the right
   * and is clipped — the row is briefly overfull, which is a fair description
   * of a take that has not been tightened.
   *
   * Holding the scale still is what lets the motion be a transform. An animated
   * scale would mean every clip changes width as well as position, and FLIP
   * cannot resize a label without stretching the text inside it.
   */
  const span = CUT_DURATION

  const spineTrack: Track = React.useMemo(
    () => ({
      id: "t-video",
      kind: "video",
      name: "Main",
      isMain: true,
      elements: cut ? SPINE : SPINE_BEFORE,
    }),
    [cut]
  )

  /**
   * Captions re-derived against the spine as it currently stands, using
   * `remapCaptions` from lib/editor rather than a prototype reimplementation.
   * Cutting the spine cuts the captions with it: each word is repositioned by
   * however much the silences before *it* removed, a different amount for every
   * word.
   */
  const captions = React.useMemo(
    () => remapCaptions(CAPTIONS, spineTrack),
    [spineTrack]
  )

  const shownUs = hoverUs ?? positionUs
  const word = useActiveWord(shownUs, TRANSCRIPT)

  const send = React.useCallback(
    (text: string) => {
      const id = String(Date.now())
      setDraft("")
      setTurns((previous) => [
        ...previous,
        { kind: "user", id: `u-${id}`, text },
        { kind: "run", id: `s-${id}` },
      ])
      run.start()
    },
    [run]
  )

  const pointerToUs = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = (event.clientX - rect.left) / rect.width
    return Math.min(span, Math.max(0, ratio * span))
  }

  /** Cmd/Ctrl+wheel zooms, which is the reflex from every other editor. */
  const onWheel = (event: React.WheelEvent) => {
    if (!event.metaKey && !event.ctrlKey) return
    event.preventDefault()
    zoom.scaleBy(event.deltaY < 0 ? 1.12 : 1 / 1.12)
  }

  return (
    <EditorFrame
      playing={playing}
      onTogglePlaying={() => setPlaying((value) => !value)}
      positionUs={positionUs}
      hoverUs={hoverUs}
      word={word?.text}
      running={run.running}
      durationUs={span}
      toolbarEnd={
        <ZoomControls
          zoom={zoom.zoom}
          onFit={zoom.fit}
          onZoomIn={zoom.zoomIn}
          onZoomOut={zoom.zoomOut}
          canZoomIn={zoom.canZoomIn}
          canZoomOut={zoom.canZoomOut}
        />
      }
      chat={
        <StudioChatMock
          turns={turns}
          done={run.done}
          active={run.active}
          value={draft}
          onValueChange={setDraft}
          onSend={send}
          onChip={(chip) =>
            setDraft((value) =>
              value ? `${value}, ${chip.toLowerCase()}` : chip
            )
          }
        />
      }
    >
      <div className="flex">
        {/* Outside the scroll container, so the headers stay put while the
            lanes scroll under them. */}
        <div className="w-[88px] shrink-0 pt-5">
          {[
            { icon: Video01Icon, name: "Main" },
            { icon: CaptionsIcon, name: "Captions" },
            { icon: MusicNote01Icon, name: MUSIC.name },
          ].map((track) => (
            <div
              key={track.name}
              className="flex h-11 items-center gap-1.5 truncate text-[11px] text-muted-foreground"
            >
              <HugeiconsIcon aria-hidden="true" icon={track.icon} size={13} />
              <span className="truncate">{track.name}</span>
            </div>
          ))}
        </div>

        <div className="min-w-0 flex-1 overflow-x-auto" onWheel={onWheel}>
          <div
            ref={laneRef}
            className="relative"
            style={{ width: `${zoom.zoom * 100}%` }}
            onPointerMove={(event) => setHoverUs(pointerToUs(event))}
            onPointerLeave={() => setHoverUs(null)}
            onPointerDown={(event) => setPositionUs(pointerToUs(event))}
          >
            {/* More marks as it widens: seven labels across a 16x lane leaves
                twelve seconds between them, which is not a ruler. */}
            <TimeRuler
              spanUs={span}
              marks={Math.min(25, 7 + Math.round(Math.log2(zoom.zoom) * 3))}
            />
            <Playhead positionUs={positionUs} spanUs={span} />

            {/* The hover head. Quieter than the playhead — it is a question,
                not a position — and it carries the timecode so the preview does
                not have to be read for "where am I". */}
            {hoverUs !== null ? (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 z-10 w-px"
                style={{ left: `${(hoverUs / span) * 100}%` }}
              >
                <div className="h-full w-px bg-foreground/30" />
                <span className="absolute -top-5 left-1 rounded border border-border bg-card px-1 text-[10px] text-muted-foreground tabular-nums">
                  {formatClock(hoverUs)}
                </span>
              </div>
            ) : null}

            {/* overflow-hidden because an untightened take is wider than the
                cut it becomes, and the overhang should not grow the scroll
                area for the 400ms it exists. */}
            <div className="relative h-11 overflow-hidden py-1">
              {SPINE.map((clip, index) => {
                const offsetPx = cut
                  ? 0
                  : ((SPINE_BEFORE[index].startUs - clip.startUs) / span) *
                    laneWidth
                const isSelected = selected === clip.id

                return (
                  <div
                    key={clip.id}
                    className={cn(
                      "group absolute inset-y-1",
                      // The stagger lives here, on one state change, rather
                      // than in a timer that feeds clips in one at a time.
                      run.animating &&
                        "transition-transform ease-out motion-reduce:transition-none"
                    )}
                    style={{
                      left: `${(clip.startUs / span) * 100}%`,
                      width: `${(clip.durationUs / span) * 100}%`,
                      transform: `translateX(${offsetPx}px)`,
                      transitionDuration: `${REVEAL_TRAVEL_MS}ms`,
                      transitionDelay: run.animating
                        ? `${revealDelayMs(index, SPINE.length)}ms`
                        : "0ms",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setSelected(clip.id)}
                      title={clip.name}
                      className={cn(
                        "absolute inset-0 overflow-hidden rounded-[4px] border border-border/70 bg-secondary text-left",
                        // No reduced-motion gate: globals.css flattens every
                        // transition-duration under `reduce`, so CSS motion is
                        // covered project-wide.
                        "transition-[background-color] duration-150 ease-out",
                        "hover:bg-sand-200 dark:hover:bg-sand-800",
                        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                        isSelected && "ring-2 ring-foreground/70"
                      )}
                    >
                      <Filmstrip />
                      <span
                        aria-hidden="true"
                        className="absolute inset-x-0 top-0 h-[2px]"
                        style={{
                          backgroundImage:
                            clip.provenance.lastEditedBy === "user"
                              ? "repeating-linear-gradient(90deg, color-mix(in oklch, var(--color-sand-500) 60%, transparent) 0 2px, transparent 2px 8px)"
                              : "repeating-linear-gradient(90deg, color-mix(in oklch, var(--color-sand-500) 85%, transparent) 0 3px, transparent 3px 6px)",
                        }}
                      />
                      <span className="relative block truncate px-1.5 pt-2 text-[10px] leading-none text-foreground/80">
                        {clip.name}
                      </span>
                    </button>

                    {/* Trim handles. Hidden until hover so 22 clips are not 44
                        permanent grab targets. */}
                    {["left", "right"].map((side) => (
                      <span
                        key={side}
                        aria-hidden="true"
                        className={cn(
                          "absolute inset-y-1 w-[3px] rounded-full bg-foreground/50 opacity-0",
                          "transition-opacity duration-150 ease-out",
                          "group-hover:opacity-100",
                          side === "left" ? "left-0.5" : "right-0.5"
                        )}
                      />
                    ))}
                  </div>
                )
              })}
            </div>

            {/* Lanes appear when their tool returns, not before. The captions
                tool runs after the cut, so the lane arrives already tightened —
                which is the truth about the order the work happened in. */}
            <Lane visible={run.done.has("captions")}>
              {captions.map((caption) => (
                <span
                  key={caption.id}
                  className="absolute inset-y-1.5 overflow-hidden rounded-[2px] bg-sand-300 dark:bg-sand-700"
                  style={{
                    left: `${(caption.startUs / span) * 100}%`,
                    width: `${Math.max(0.2, (caption.durationUs / span) * 100)}%`,
                  }}
                >
                  {/* The word itself, once there is room. Below about 6x every
                      chip is narrower than a character and the lane is better
                      read as density. */}
                  {zoom.zoom >= 6 ? (
                    <span className="block truncate px-1 text-[9px] leading-[1.6] text-foreground/70">
                      {caption.name}
                    </span>
                  ) : null}
                </span>
              ))}
            </Lane>

            <Lane visible={run.done.has("music")}>
              <div className="absolute inset-0 overflow-hidden rounded-[3px]">
                <Waveform />
              </div>
            </Lane>
          </div>
        </div>
      </div>
    </EditorFrame>
  )
}

/**
 * A track row that fades in with its tool.
 *
 * The row is always there, even empty: the timeline must not change height
 * mid-run, or every lane below it jumps as each tool returns.
 */
function Lane({
  visible,
  children,
}: {
  visible: boolean
  children: React.ReactNode
}) {
  return (
    <div className="relative h-11 py-1">
      <div
        className={cn(
          "relative h-full rounded-[3px] border border-border/50 bg-secondary/30",
          "transition-opacity duration-200 ease-out",
          visible ? "opacity-100" : "opacity-0"
        )}
      >
        {children}
      </div>
    </div>
  )
}

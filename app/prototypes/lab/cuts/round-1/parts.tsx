"use client"

/*
 * Round 1's shared parts. Every piece is designed at 960×720 on the kit's
 * tokens and scaled into the lab's 4:3 frame, so the pieces agree on one
 * recording, one timeline and one transcript, and differ only in the idea
 * each one pushes. Pieces build their surface from these and from
 * @/components/kit; nothing here is the real editor.
 */

import * as React from "react"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"

import { KitRoot, useReducedMotion } from "@/components/kit"
import { Friend, type MascotState } from "@/components/mascot"

import {
  CAPTIONS,
  CUT_CLIPS,
  CUT_SECONDS,
  HOOK,
  RAW_CLIPS,
  SEGMENTS,
  TAKE,
  toCut,
  fmt,
  fmtWhole,
} from "./fixture"

export const W = 960
export const H = 720

/* ------------------------------------------------------------------ frame */

/**
 * Designed at 960×720, scaled to the frame's width. Hidden until measured,
 * so it never paints at full size for one frame and then jumps.
 */
export function Frame({
  children,
  ground = "ground",
}: {
  children: React.ReactNode
  /** `stage` paints the grey recess edge to edge. */
  ground?: "ground" | "stage"
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [scale, setScale] = React.useState(0)

  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / W))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={ref} className="absolute inset-0 overflow-hidden">
      <KitRoot>
        <div
          className={`relative overflow-hidden text-kit-ink ${ground === "stage" ? "bg-kit-stage" : "bg-kit-ground"}`}
          style={{
            width: W,
            height: H,
            transform: `scale(${scale})`,
            transformOrigin: "0 0",
            visibility: scale ? undefined : "hidden",
          }}
        >
          {children}
        </div>
      </KitRoot>
    </div>
  )
}

/* ----------------------------------------------------------------- script */

/**
 * A step counter the person drives. `play()` walks 0 → steps−1 once, `ms`
 * apart, and stops on the last step. Under reduced motion it jumps straight
 * to the last step: the end state is the content, the walk is decoration.
 */
export function useRun(steps: number, ms = 900, start = steps - 1) {
  const reduced = useReducedMotion()
  const [step, setStep] = React.useState(start)
  const [playing, setPlaying] = React.useState(false)

  React.useEffect(() => {
    if (!playing) return
    const t = window.setTimeout(() => {
      const next = Math.min(step + 1, steps - 1)
      setStep(next)
      if (next === steps - 1) setPlaying(false)
    }, ms)
    return () => window.clearTimeout(t)
  }, [playing, step, steps, ms])

  const play = React.useCallback(() => {
    if (reduced) {
      setStep(steps - 1)
      return
    }
    setStep(0)
    setPlaying(true)
  }, [reduced, steps])

  return { step, playing, play, setStep }
}

/* ---------------------------------------------------------------- picture */

const SHAPES = { "16:9": [16, 9], "9:16": [9, 16], "1:1": [1, 1] } as const
export type Shape = keyof typeof SHAPES

/**
 * The talking head, drawn in the kit's greys: a window on the back wall, a
 * shelf, the founder. `punch` pushes in (a transition on `scale`, so a
 * second press retargets). A caption sits burned in on the ink fill.
 */
export function Picture({
  shape = "16:9",
  width,
  caption,
  punch = false,
  time,
  rounded = "rounded-kit-control",
  captionClass = "text-kit-small",
}: {
  shape?: Shape
  width: number
  caption?: React.ReactNode
  punch?: boolean
  time?: string
  rounded?: string
  captionClass?: string
}) {
  const [w, h] = SHAPES[shape]
  const height = Math.round((width * h) / w)
  return (
    <div
      role="img"
      aria-label={`Preview, ${shape}${caption && typeof caption === "string" ? `, caption: ${caption}` : ""}`}
      className={`relative shrink-0 overflow-hidden bg-kit-stage ${rounded}`}
      style={{ width, height }}
    >
      <div
        className="absolute inset-0 transition-[scale] duration-(--kit-duration-travel) ease-kit-move motion-reduce:transition-none"
        style={{ scale: punch ? 1.28 : 1, transformOrigin: "50% 38%" }}
      >
        <svg
          aria-hidden
          viewBox="0 0 160 160"
          preserveAspectRatio="xMidYMax slice"
          className="absolute inset-0 size-full"
        >
          <rect x="-200" y="18" width="150" height="70" rx="3" className="fill-kit-well" />
          <rect x="104" y="22" width="44" height="54" rx="3" className="fill-kit-object" />
          <rect x="104" y="98" width="70" height="3" className="fill-kit-chrome" />
          <rect x="112" y="84" width="10" height="14" rx="1.5" className="fill-kit-chrome" />
          <path
            d="M34 160c2-26 18-40 46-40s44 14 46 40Z"
            className="fill-kit-ink-muted"
          />
          <rect x="72" y="104" width="16" height="18" rx="6" className="fill-kit-chrome" />
          <ellipse cx="80" cy="84" rx="19" ry="23" className="fill-kit-chrome" />
          <path d="M61 80c0-16 8-25 19-25s20 8 20 22c-6-7-14-9-22-9s-12 4-17 12Z" className="fill-kit-ink-muted" />
        </svg>
      </div>
      {caption ? (
        <div className="absolute inset-x-0 bottom-[12%] flex justify-center px-3">
          <span
            className={`rounded-kit-chip bg-kit-primary px-2 py-0.5 text-center font-kit-strong text-kit-primary-on text-balance ${captionClass}`}
          >
            {caption}
          </span>
        </div>
      ) : null}
      {time ? (
        <span className="absolute top-2 left-2 rounded-kit-chip bg-kit-object/90 px-1.5 font-kit-mono text-kit-mono-sm text-kit-ink-muted tabular-nums">
          {time}
        </span>
      ) : null}
    </div>
  )
}

/** A phone around a 9:16 picture. The bezel is ink; the glass is the picture. */
export function PhoneFrame({ width, children }: { width: number; children: React.ReactNode }) {
  return (
    <div className="rounded-[34px] bg-kit-primary p-2 shadow-kit-lifted" style={{ width: width + 16 }}>
      <div className="relative overflow-hidden rounded-[26px]">
        {children}
        <span className="absolute top-2 left-1/2 h-4 w-16 -translate-x-1/2 rounded-full bg-kit-primary" />
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- waveform */

/**
 * Deterministic bars: the same take draws the same wave in every piece, and
 * on the server and the client alike. An integer hash, not Math.sin: sin can
 * differ in the last decimals between engines, which is a hydration error.
 */
function level(i: number) {
  const h = (Math.imul(i + 1, 2654435761) >>> 0) % 1000
  return 0.25 + (h / 1000) * 0.75
}

const r2 = (n: number) => Math.round(n * 100) / 100

export function Waveform({
  from,
  to,
  width,
  height = 18,
  className = "fill-kit-ink-muted",
}: {
  /** Source seconds this stretch of wave covers. */
  from: number
  to: number
  width: number
  height?: number
  className?: string
}) {
  const bars = Math.max(2, Math.floor(width / 3))
  return (
    <svg aria-hidden width={width} height={height} className={className}>
      {Array.from({ length: bars }, (_, i) => {
        const t = from + ((to - from) * i) / bars
        const quiet = SEGMENTS.some((s) => s.kind === "pause" && t >= s.at && t < s.end)
        const h = r2(quiet ? 1.5 : Math.max(2, level(Math.floor(t * 9)) * height))
        return <rect key={i} x={i * 3} y={r2((height - h) / 2)} width={1.6} height={h} rx={0.8} />
      })}
    </svg>
  )
}

/* -------------------------------------------------------------- timeline */

export type TimelineProps = {
  width: number
  /** `raw` one clip; `marked` raw with the pauses shown; `cut` the tightened spine. */
  state?: "raw" | "marked" | "cut"
  captions?: boolean
  zoom?: boolean
  look?: boolean
  /** Playhead, on the shown clock, in seconds. */
  playhead?: number
  /** Hides the lane names, for a narrow strip. */
  bare?: boolean
  /** Read-only while a run holds it; the reason is shown over the lanes. */
  held?: React.ReactNode
  /** Lane names to show; default all three. */
  lanes?: ReadonlyArray<"clips" | "captions" | "effects">
}

const LANE_NAME = 64

/**
 * Spine of clips with the wave inside, a caption lane, an effect lane, a
 * ruler and a playhead. Positions come from the fixture, so a cut here is the
 * same cut the receipt describes.
 */
export function Timeline({
  width,
  state = "cut",
  captions = false,
  zoom = false,
  look = false,
  playhead,
  bare = false,
  held,
  lanes = ["clips", "captions", "effects"],
}: TimelineProps) {
  const total = state === "cut" ? CUT_SECONDS : TAKE.seconds
  const inner = width - (bare ? 0 : LANE_NAME)
  const px = inner / total
  const clips = state === "cut" ? CUT_CLIPS : RAW_CLIPS
  const ticks = Array.from({ length: Math.floor(total / 5) + 1 }, (_, i) => i * 5)

  const lane = (name: string, h: number, body: React.ReactNode) => (
    <div className="flex items-center" style={{ height: h }}>
      {bare ? null : (
        <span className="shrink-0 text-kit-meta text-kit-ink-muted" style={{ width: LANE_NAME }}>
          {name}
        </span>
      )}
      <div className="relative h-full" style={{ width: inner }}>
        {body}
      </div>
    </div>
  )

  const starts = clips.map((_, i) => clips.slice(0, i).reduce((sum, c) => sum + c.to - c.from, 0))
  return (
    <div className="relative select-none" style={{ width }}>
      {lane(
        "",
        18,
        ticks.map((t) => (
          <span
            key={t}
            className="absolute top-0 font-kit-mono text-kit-mono-sm text-kit-ink-muted tabular-nums"
            style={{ left: t * px }}
          >
            {fmtWhole(t)}
          </span>
        )),
      )}
      <div className="flex flex-col gap-1.5">
        {lanes.includes("clips")
          ? lane(
              "Clips",
              46,
              <>
                {clips.map((c, i) => {
                  const left = starts[i] * px
                  const w = (c.to - c.from) * px - (state === "cut" ? 2 : 0)
                  return (
                    <div
                      key={c.id}
                      className="absolute inset-y-0 flex flex-col justify-between overflow-hidden rounded-kit-chip bg-kit-object px-1.5 py-1 shadow-kit-control"
                      style={{ left, width: w }}
                    >
                      <span className="truncate text-kit-meta font-kit-strong">{c.name}</span>
                      <Waveform from={c.from} to={c.to} width={Math.max(4, w - 12)} height={16} />
                    </div>
                  )
                })}
                {state === "marked"
                  ? SEGMENTS.filter((s) => s.kind !== "speech").map((s) => (
                      <span
                        key={s.id}
                        className="absolute inset-y-0 rounded-kit-chip bg-kit-well/80 ring-1 ring-kit-ink-muted ring-inset"
                        style={{ left: s.at * px, width: Math.max(4, (s.end - s.at) * px) }}
                      >
                        <span className="absolute -top-4 left-1/2 -translate-x-1/2 font-kit-mono text-kit-mono-sm whitespace-nowrap text-kit-ink">
                          {s.kind === "pause" ? s.text : "um"}
                        </span>
                      </span>
                    ))
                  : null}
              </>,
            )
          : null}
        {lanes.includes("captions")
          ? lane(
              "Captions",
              22,
              captions
                ? CAPTIONS.map((c) => (
                    <span
                      key={c.id}
                      className="absolute inset-y-0 truncate rounded-kit-chip bg-kit-well px-1 text-kit-meta leading-[22px] text-kit-ink-muted"
                      style={{ left: c.from * px + 1, width: (c.to - c.from) * px - 2 }}
                    >
                      {c.text}
                    </span>
                  ))
                : <span className="absolute inset-0 rounded-kit-chip border border-dashed border-kit-hairline" />,
            )
          : null}
        {lanes.includes("effects")
          ? lane(
              "Effects",
              22,
              <>
                {look ? (
                  <span className="absolute inset-y-0 left-0 w-full rounded-kit-chip bg-kit-well px-1.5 text-kit-meta leading-[22px] text-kit-ink-muted">
                    Look · warm
                  </span>
                ) : null}
                {zoom ? (
                  <span
                    className="absolute inset-y-0 rounded-kit-chip bg-kit-primary px-1.5 text-kit-meta leading-[22px] font-kit-strong whitespace-nowrap text-kit-primary-on"
                    style={{
                      left: (state === "cut" ? toCut(HOOK.at) : HOOK.at) * px,
                      width: (HOOK.end - HOOK.at) * px,
                    }}
                  >
                    Zoom 1.3×
                  </span>
                ) : null}
                {!look && !zoom ? (
                  <span className="absolute inset-0 rounded-kit-chip border border-dashed border-kit-hairline" />
                ) : null}
              </>,
            )
          : null}
      </div>
      {playhead != null ? (
        <span
          aria-hidden
          className="pointer-events-none absolute top-0 bottom-0 w-px bg-kit-ink"
          style={{ left: (bare ? 0 : LANE_NAME) + playhead * px }}
        >
          <span className="absolute -top-0.5 -left-[3px] size-[7px] rounded-full bg-kit-ink" />
        </span>
      ) : null}
      {held ? (
        <div className="absolute inset-0 top-5 flex items-center justify-center rounded-kit-control bg-kit-ground/70">
          <span className="flex items-center gap-2 rounded-kit-control bg-kit-object px-3 py-1.5 shadow-kit-lifted">
            <Friend size={20} state="writing" />
            <span className="text-kit-small">{held}</span>
          </span>
        </div>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------ transcript */

/**
 * The take as words. `marks` decides how Quincy's reading shows:
 * `none` the plain transcript; `marked` the pauses and the "um" picked out;
 * `cut` them folded away to a grey chip. Never struck through: Quincy marks
 * a page up, it does not grade it (decisions.md, "Strikethrough diffs").
 */
export function Transcript({
  marks = "none",
  hook,
  live,
  className = "",
}: {
  marks?: "none" | "marked" | "cut"
  /** How the strong line shows. */
  hook?: React.ReactNode
  /** Segment id under the playhead, in ink-strong. */
  live?: string
  className?: string
}) {
  return (
    <p className={`leading-[26px] ${className}`}>
      {SEGMENTS.map((s) => {
        if (s.kind === "pause") {
          if (marks === "none") return <React.Fragment key={s.id}> </React.Fragment>
          return (
            <span
              key={s.id}
              className={`mx-1 inline-flex h-5 items-center gap-1 rounded-kit-chip px-1.5 align-[1px] font-kit-mono text-kit-mono-sm tabular-nums ${
                marks === "cut" ? "bg-kit-well text-kit-ink-disabled" : "bg-kit-well text-kit-ink shadow-kit-inset"
              }`}
            >
              {marks === "cut" ? `${s.text} gone` : `pause ${s.text}`}
            </span>
          )
        }
        if (s.kind === "filler") {
          if (marks === "none") return <span key={s.id}>{s.text} </span>
          return (
            <span
              key={s.id}
              className={
                marks === "cut"
                  ? "text-kit-ink-disabled"
                  : "rounded-kit-chip bg-kit-well px-0.5 shadow-kit-inset"
              }
            >
              {s.text}{" "}
            </span>
          )
        }
        if (s.id === "hook" && hook) return <React.Fragment key={s.id}>{hook} </React.Fragment>
        return (
          <span key={s.id} className={live === s.id ? "font-kit-strong" : undefined}>
            {s.text}{" "}
          </span>
        )
      })}
    </p>
  )
}

/* ------------------------------------------------------------------ chat */

export function You({ children, time }: { children: React.ReactNode; time?: string }) {
  return (
    <div className="flex flex-col items-end gap-1">
      {time ? <span className="text-kit-meta text-kit-ink-muted">You · {time}</span> : null}
      <div className="max-w-[86%] rounded-kit-object bg-kit-well px-3.5 py-2">{children}</div>
    </div>
  )
}

export function Quincy({
  children,
  mood = "idle",
  label = "Quincy",
}: {
  children: React.ReactNode
  mood?: MascotState
  label?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5 text-kit-meta text-kit-ink-muted">
        <Friend size={20} state={mood} />
        {label}
      </span>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  )
}

/** One tool call, reported in prose. `done` paints the kit's green check. */
export function Op({
  icon,
  say,
  detail,
  state = "done",
}: {
  icon: IconSvgElement
  say: React.ReactNode
  detail?: React.ReactNode
  state?: "done" | "now" | "next"
}) {
  return (
    <div
      data-state={state}
      className="flex items-start gap-2.5 transition-[opacity] duration-(--kit-duration-state) ease-kit-out data-[state=next]:opacity-40 motion-reduce:transition-none"
    >
      <span className="mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-full bg-kit-well text-kit-ink-muted">
        <HugeiconsIcon icon={icon} size={12} strokeWidth={2} aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="font-kit-strong">{say}</span>
        {detail ? <span className="text-kit-ink-muted"> · {detail}</span> : null}
      </span>
    </div>
  )
}

/** The composer at rest: a field, never a fake cursor. */
export function ComposerStill({
  placeholder = "Tighten this, add captions, make it vertical",
  value,
}: {
  placeholder?: string
  value?: string
}) {
  return (
    <div className="flex min-h-11 items-center gap-2 rounded-kit-control bg-kit-object px-3.5 py-2 shadow-kit-control">
      <span className={`min-w-0 flex-1 truncate ${value ? "text-kit-ink" : "text-kit-ink-muted"}`}>
        {value ?? placeholder}
      </span>
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-kit-control text-kit-ink-muted shadow-kit-control">
        <svg aria-hidden width="12" height="12" viewBox="0 0 12 12">
          <path d="M6 10V2M2.5 5.5 6 2l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </div>
  )
}

/* ------------------------------------------------------------------ marks */

/** A thin hand-drawn bracket spanning `height`. */
export function HandBracket({
  height,
  tone,
  side = "right",
}: {
  height: number
  tone: "graphite" | "pen"
  side?: "left" | "right"
}) {
  const d =
    side === "right"
      ? `M1 1.5 C 5 1.5, 6 3, 6 8 L 6 ${height / 2 - 6} C 6 ${height / 2 - 2}, 7.5 ${height / 2}, 10 ${height / 2} C 7.5 ${height / 2}, 6 ${height / 2 + 2}, 6 ${height / 2 + 6} L 6 ${height - 8} C 6 ${height - 3}, 5 ${height - 1.5}, 1 ${height - 1.5}`
      : `M9 1.5 C 5 1.5, 4 3, 4 8 L 4 ${height / 2 - 6} C 4 ${height / 2 - 2}, 2.5 ${height / 2}, 0 ${height / 2} C 2.5 ${height / 2}, 4 ${height / 2 + 2}, 4 ${height / 2 + 6} L 4 ${height - 8} C 4 ${height - 3}, 5 ${height - 1.5}, 9 ${height - 1.5}`
  return (
    <svg aria-hidden width="10" height={height} className="shrink-0 overflow-visible">
      <path
        d={d}
        fill="none"
        stroke={tone === "pen" ? "var(--kit-pen)" : "var(--kit-ink-muted)"}
        strokeWidth={1.3}
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Quincy's handwriting: Caveat, tilted 2°. Graphite on working surfaces, pen on beats. */
export function Hand({
  children,
  tone = "graphite",
  className = "",
}: {
  children: React.ReactNode
  tone?: "graphite" | "pen"
  className?: string
}) {
  return (
    <span
      className={`inline-block -rotate-2 font-kit-hand text-kit-hand whitespace-nowrap ${tone === "pen" ? "text-kit-pen" : "text-kit-ink-muted"} ${className}`}
    >
      {children}
    </span>
  )
}

/** A bracket and a few words beside a block, placed by the piece. */
export function Note({
  children,
  height,
  tone = "graphite",
  className = "",
  style,
}: {
  children: React.ReactNode
  height: number
  tone?: "graphite" | "pen"
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <span className={`absolute flex items-center gap-2 ${className}`} style={{ height, ...style }}>
      <HandBracket height={height} tone={tone} />
      <Hand tone={tone}>{children}</Hand>
    </span>
  )
}

/** A system pointer, drawn. It rests where the person would press. */
export function Pointer({ style, className = "" }: { style?: React.CSSProperties; className?: string }) {
  return (
    <svg
      aria-hidden
      width="20"
      height="26"
      viewBox="0 0 22 28"
      className={`pointer-events-none absolute drop-shadow-sm ${className}`}
      style={style}
    >
      <path
        d="M2 1.5v21.2l5.3-5.1 3.4 8 3.7-1.6-3.4-7.8H18L2 1.5Z"
        className="fill-kit-ink stroke-kit-object"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/* ------------------------------------------------------------------- bar */

/** The editor's top line: the project, its length, and whatever the piece puts right. */
export function EditorBar({
  right,
  seconds = TAKE.seconds,
  precise = false,
  className = "",
}: {
  right?: React.ReactNode
  seconds?: number
  /** Tenths, as the transport shows them (0:32.5), so the time reads the same everywhere. */
  precise?: boolean
  className?: string
}) {
  return (
    <div className={`flex h-14 items-center justify-between gap-4 border-b border-kit-hairline px-5 ${className}`}>
      <div className="flex min-w-0 items-baseline gap-2.5">
        <span className="text-kit-meta text-kit-ink-muted">Cuts</span>
        <span className="text-kit-ink-muted">/</span>
        <span className="truncate font-kit-strong">{TAKE.project}</span>
        <span className="font-kit-mono text-kit-mono text-kit-ink-muted tabular-nums">{precise ? fmt(seconds) : fmtWhole(seconds)}</span>
      </div>
      <div className="flex items-center gap-2">{right}</div>
    </div>
  )
}

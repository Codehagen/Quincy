"use client"

import * as React from "react"

import { Button, Mono, Segmented, Stage, Text } from "@/components/kit"
import { useReducedMotion } from "@/components/kit/use-reduced-motion"
import {
  type MascotState,
  GRID,
  HEX,
  STATES,
  STATE_NAMES,
  duration,
  locate,
  sample,
  toIndices,
  toSvg,
} from "@/components/mascot/engine"
import { encodeGif } from "@/components/mascot/gif"
import { PixelFriend } from "@/components/mascot/pixel-friend"
import { SmoothFriend } from "@/components/mascot/smooth-friend"
import { QuincyMark } from "@/components/mascot/lockup"

/** What each state means, in the product's words (docs/design/mascot.md). */
const MEANING: Record<MascotState, { lead: string; rest: string }> = {
  idle: { lead: "Idle.", rest: "Nothing is running. A blink every few seconds, a small drift of gaze." },
  listening: { lead: "Listening.", rest: "A recording is on. Eyes up, on the person talking." },
  reading: { lead: "Reading.", rest: "Quincy is working through the material. Eyes scan three lines, left to right." },
  found: { lead: "Found.", rest: "An idea came out of it. Eyes widen and the sash flashes twice. Plays once, then idle." },
  writing: { lead: "Writing.", rest: "A draft is being written. A pen travels along the sash and leaves words behind." },
  waiting: { lead: "Waiting.", rest: "A draft waits for Approve. A glance toward the button, and back." },
  sent: { lead: "Sent.", rest: "You approved it. A happy closed-eye squeeze, once, then idle." },
  resting: { lead: "Resting.", rest: "Quiet hours. Eyes shut; the sash's tails draw in and out, slowly." },
  stuck: { lead: "Stuck.", rest: "Something failed. Eyes low and to one side. No motion at all." },
}

const SPEEDS = [
  { value: "0.25", label: "¼×" },
  { value: "0.5", label: "½×" },
  { value: "1", label: "1×" },
  { value: "2", label: "2×" },
] as const

type Speed = (typeof SPEEDS)[number]["value"]

const ZERO = Object.fromEntries(STATE_NAMES.map((s) => [s, 0])) as Record<MascotState, number>

/** Start time of each frame inside its state, so a strip can freeze on it. */
const OFFSETS = Object.fromEntries(
  STATE_NAMES.map((s) => {
    let at = 0
    return [s, STATES[s].frames.map((fr) => ((at += fr.hold), at - fr.hold))]
  }),
) as Record<MascotState, number[]>

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function exportSvg(state: MascotState, t: number) {
  const c = locate(state, t)
  download(
    `quincy-${c.state}-${c.index}.svg`,
    new Blob([toSvg(sample(state, t))], { type: "image/svg+xml" }),
  )
}

function exportPng(state: MascotState, t: number) {
  const c = locate(state, t)
  const scale = 16
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = GRID * scale
  const ctx = canvas.getContext("2d")
  if (!ctx) return
  const fill: Record<string, string> = { "#": HEX.ink, y: HEX.sash, k: HEX.ink }
  sample(state, t).forEach((row, y) => {
    for (let x = 0; x < GRID; x++) {
      const colour = fill[row[x]]
      if (!colour) continue
      ctx.fillStyle = colour
      ctx.fillRect(x * scale, y * scale, scale, scale)
    }
  })
  canvas.toBlob((blob) => blob && download(`quincy-${c.state}-${c.index}.png`, blob), "image/png")
}

function exportGif(state: MascotState) {
  const def = STATES[state]
  const scale = 8
  const bytes = encodeGif(
    def.frames.map((fr) => ({ indices: toIndices(fr.bitmap, scale), delay: fr.hold })),
    {
      width: GRID * scale,
      height: GRID * scale,
      palette: [HEX.paper, HEX.ink, HEX.sash, HEX.ink],
      loop: def.play === "loop",
    },
  )
  download(`quincy-${state}.gif`, new Blob([bytes.slice().buffer], { type: "image/gif" }))
}

/** One ground: light is the kit's own, dark re-points the same tokens. */
function Ground({ dark, children }: { dark?: boolean; children: React.ReactNode }) {
  return (
    <div className={dark ? "dark" : undefined}>
      <div className="flex items-end gap-kit-stack rounded-kit-object bg-kit-ground p-kit-pad text-kit-ink shadow-kit-object">
        {children}
      </div>
    </div>
  )
}

/** Memoised: the board clock ticks every frame, a strip changes only on a cut. */
const Strip = React.memo(function Strip({
  state,
  current,
  dark,
}: {
  state: MascotState
  current: number | null
  dark?: boolean
}) {
  return (
    <div className={dark ? "dark" : undefined}>
      <ol
        aria-label={`${state} frames on ${dark ? "dark" : "light"}`}
        className="flex gap-kit-related overflow-x-auto rounded-kit-object bg-kit-ground p-kit-pad text-kit-ink shadow-kit-object"
      >
        {STATES[state].frames.map((fr, i) => (
          <li
            key={i}
            aria-current={current === i ? "step" : undefined}
            className="flex shrink-0 flex-col items-center gap-kit-tight"
          >
            <PixelFriend state={state} size={32} frozenAt={OFFSETS[state][i]} />
            <Mono tone={current === i ? "ink" : "muted"}>{fr.hold}</Mono>
          </li>
        ))}
      </ol>
    </div>
  )
})

export function MascotBoard() {
  const reduced = useReducedMotion()
  const [speed, setSpeed] = React.useState<Speed>("1")
  const [paused, setPaused] = React.useState(false)
  const [starts, setStarts] = React.useState(ZERO)
  // Board time: advanced by the rAF loop, committed to state only when a
  // frame somewhere on the board changes.
  const [now, setNow] = React.useState(0)
  const clock = React.useRef(0)
  const speedRef = React.useRef(Number(speed))

  React.useEffect(() => {
    speedRef.current = Number(speed)
  }, [speed])

  // Board time, committed every animation frame: the smooth friend moves
  // between the pixel friend's cuts, and both read this one clock.
  React.useEffect(() => {
    if (paused || reduced) return
    let raf = 0
    let prev: number | null = null
    const tick = (ts: number) => {
      clock.current += prev === null ? 0 : Math.min(ts - prev, 250) * speedRef.current
      prev = ts
      setNow(clock.current)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [paused, reduced])

  const replay = (s: MascotState) => {
    setStarts((prev) => ({ ...prev, [s]: clock.current }))
    setNow(clock.current)
  }

  const timeIn = (s: MascotState) => (reduced ? 0 : Math.max(0, now - starts[s]))

  return (
    <div className="flex flex-col gap-kit-page-gap">
      <div className="flex flex-wrap items-center gap-kit-related">
        <Segmented
          aria-label="Speed"
          options={SPEEDS}
          value={speed}
          onValueChange={setSpeed}
        />
        <Button onClick={() => setPaused((p) => !p)}>{paused ? "Play" : "Pause"}</Button>
        <Text variant="small" tone="muted">
          {reduced
            ? "Reduced motion is on: every state holds its pose (pixel: first frame; smooth: its still)."
            : "One clock for the whole board, so every size and ground agrees."}
        </Text>
      </div>

      <Stage lead="The lockup." rest="Pixel friend beside the name in Inter 560, at sm and md, with its own clock.">
        <div className="flex flex-wrap gap-kit-stack">
          {[false, true].map((dark) => (
            <Ground key={String(dark)} dark={dark}>
              <div className="flex flex-col gap-kit-stack">
                <QuincyMark size="md" />
                <QuincyMark size="sm" />
              </div>
            </Ground>
          ))}
        </div>
      </Stage>

      {STATE_NAMES.map((s) => {
        const def = STATES[s]
        const t = timeIn(s)
        const c = locate(s, t)
        const current = c.state === s ? c.index : null
        const shape =
          def.play === "loop" ? "loop" : def.then ? `once, then ${def.then}` : "held"
        return (
          <Stage key={s} id={s} lead={MEANING[s].lead} rest={MEANING[s].rest}>
            <div className="flex w-full flex-col gap-kit-stack">
              <div className="flex flex-wrap gap-kit-stack">
                {[false, true].map((dark) => (
                  <Ground key={String(dark)} dark={dark}>
                    <figure className="flex flex-col items-center gap-kit-tight">
                      <SmoothFriend state={s} size={128} frozenAt={t} label={`Quincy, ${s}, smooth`} />
                      <Mono tone="muted">smooth 128</Mono>
                    </figure>
                    <figure className="flex flex-col items-center gap-kit-tight">
                      <PixelFriend state={s} size={128} frozenAt={t} label={`Quincy, ${s}, pixel`} />
                      <Mono tone="muted">pixel 128</Mono>
                    </figure>
                    <figure className="flex flex-col items-center gap-kit-tight">
                      <SmoothFriend state={s} size={32} frozenAt={t} />
                      <Mono tone="muted">32</Mono>
                    </figure>
                    <figure className="flex flex-col items-center gap-kit-tight">
                      <PixelFriend state={s} size={16} frozenAt={t} />
                      <Mono tone="muted">16</Mono>
                    </figure>
                  </Ground>
                ))}
              </div>
              <Strip state={s} current={current} />
              <Strip state={s} current={current} dark />
              <div className="flex flex-wrap items-center gap-kit-related">
                <Mono>
                  {def.frames.length} frames · {duration(s)} ms · {shape}
                </Mono>
                {def.then ? <Button onClick={() => replay(s)}>Replay</Button> : null}
                <Button onClick={() => exportSvg(s, t)}>SVG</Button>
                <Button onClick={() => exportPng(s, t)}>PNG</Button>
                <Button onClick={() => exportGif(s)}>GIF</Button>
              </div>
            </div>
          </Stage>
        )
      })}
    </div>
  )
}

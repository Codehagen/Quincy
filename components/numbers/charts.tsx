"use client"

import * as React from "react"

import { TextButton } from "@/components/kit"
import { fmt, formatMultiple, roundUsual } from "@/lib/numbers-read"

/**
 * The charts on /numbers, in plain SVG and HTML on kit tokens. No library:
 * every chart here is one series, so the whole palette is emphasis, one job
 * each (the generic Sparkline in components/kit says the same):
 *
 * - ink (`kit-ink`): the period you picked, the post you opened.
 * - the faint mark (`kit-mark`): context, the weeks before the period. 2.4:1,
 *   under the 3:1 a mark wants alone, so every chart that uses it has its
 *   values in words beside it, a readout, or a table twin.
 * - muted ink (`kit-ink-muted`): your usual, labelled.
 *
 * No hue: blue is the pen, and "did well" is not a colour job. Above or
 * below your usual is position and words, never green and red. Lines are
 * 2px with round caps; columns are at most 24 wide with a rounded data end.
 */

type Week = { label: string; value: number | null; inWindow: boolean }

/* ── Week columns: the trend panel. Arrow keys, a readout, a table twin ── */

export function WeekColumns({
  weeks,
  usual,
  say,
  label,
  height = 132,
}: {
  weeks: Week[]
  /** Per week. */
  usual: number | null
  say: (n: number) => string
  /** What the chart is, for its accessible name: "Replies per week". */
  label: string
  height?: number
}) {
  const [view, setView] = React.useState<"chart" | "table">("chart")
  const [active, setActive] = React.useState<number | null>(null)
  const [roving, setRoving] = React.useState(weeks.length - 1)
  const refs = React.useRef<(HTMLButtonElement | null)[]>([])
  const max = Math.max(1, ...weeks.map((w) => w.value ?? 0), usual ?? 0)
  const top = niceCeil(max)
  const usualText = usual === null ? "No usual yet." : `Your usual is ${roundUsual(usual)} a week.`
  const sentence = (w: Week) => (w.value === null ? `${w.label}: not measured.` : `${w.label}: ${say(w.value)}.`)

  function move(i: number) {
    const c = Math.max(0, Math.min(weeks.length - 1, i))
    setRoving(c)
    refs.current[c]?.focus()
  }

  const readout = active !== null ? sentence(weeks[active]!) : `${usualText} The weeks in ink are the period you picked.`

  return (
    <div className="flex flex-col gap-kit-related">
      <div className="flex items-baseline justify-between gap-kit-related">
        <p className="min-h-4 truncate text-kit-meta text-kit-ink-muted tabular-nums" aria-live="polite">
          {view === "chart" ? readout : usualText}
        </p>
        <span className="shrink-0 whitespace-nowrap">
          <TextButton onClick={() => setView(view === "chart" ? "table" : "chart")}>{view === "chart" ? "As a table" : "As a chart"}</TextButton>
        </span>
      </div>
      {view === "table" ? (
        <table className="w-full text-kit-meta tabular-nums">
          <caption className="sr-only">{label}</caption>
          <thead>
            <tr className="text-kit-ink-muted">
              <th scope="col" className="py-1 text-start font-kit-strong">
                Week
              </th>
              <th scope="col" className="py-1 text-end font-kit-strong">
                Value
              </th>
            </tr>
          </thead>
          <tbody>
            {[...weeks].reverse().map((w) => (
              <tr key={w.label} className="border-t border-kit-hairline">
                <td className={`py-1 ${w.inWindow ? "text-kit-ink" : "text-kit-ink-muted"}`}>{w.label}</td>
                <td className="py-1 text-end text-kit-ink">{w.value === null ? "—" : fmt(w.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1" style={{ height }}>
            {/* The axis: a hairline at 0 and at the top tick, labelled at the end. */}
            <div className="absolute inset-x-0 bottom-5 border-t border-kit-hairline" aria-hidden />
            <div className="absolute inset-x-0 top-0 border-t border-kit-hairline" aria-hidden />
            {usual !== null ? (
              <div
                className="pointer-events-none absolute inset-x-0 z-[1] border-t border-kit-ink-muted"
                style={{ bottom: `calc(1.25rem + ${((height - 20) * usual) / top}px)` }}
                aria-hidden
              >
                <span className="absolute -top-4 right-0 bg-kit-object ps-1 font-kit-mono text-kit-mono-sm text-kit-ink-muted">usual {roundUsual(usual)}</span>
              </div>
            ) : null}
            <div role="group" aria-label={`${label}. ${usualText} Arrow keys move between weeks.`} className="absolute inset-0 flex items-end">
              {weeks.map((w, i) => {
                const h = w.value === null ? 0 : ((height - 20) * w.value) / top
                return (
                  <button
                    key={w.label}
                    ref={(el) => {
                      refs.current[i] = el
                    }}
                    type="button"
                    tabIndex={i === roving ? 0 : -1}
                    aria-label={sentence(w)}
                    onPointerEnter={() => setActive(i)}
                    onPointerLeave={() => setActive(null)}
                    onFocus={() => {
                      setActive(i)
                      setRoving(i)
                    }}
                    onBlur={() => setActive(null)}
                    onKeyDown={(e) => {
                      const k = e.key
                      if (k === "ArrowRight") move(i + 1)
                      else if (k === "ArrowLeft") move(i - 1)
                      else if (k === "Home") move(0)
                      else if (k === "End") move(weeks.length - 1)
                      else return
                      e.preventDefault()
                    }}
                    className="group/col relative flex h-full min-w-0 flex-1 cursor-default flex-col items-center justify-end rounded-kit-chip outline-hidden focus-visible:outline-2 focus-visible:outline-kit-focus"
                  >
                    <span
                      className={`block w-[64%] max-w-6 rounded-t-kit-chip transition-[background-color] duration-(--kit-duration-state) ease-kit-out motion-reduce:transition-none ${
                        w.inWindow ? "bg-kit-ink" : "bg-kit-mark group-hover/col:bg-kit-ink-muted group-focus-visible/col:bg-kit-ink-muted"
                      }`}
                      style={{ height: Math.max(w.value ? 2 : 0, h) }}
                    />
                    <span className="h-5 shrink-0" />
                  </button>
                )
              })}
            </div>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-between font-kit-mono text-kit-mono-sm text-kit-ink-muted" aria-hidden>
              <span>{weeks[0]?.label.split(" – ")[0]}</span>
              <span>{weeks.at(-1)?.label.split(" – ")[0]}</span>
            </div>
          </div>
          <div className="relative w-6 shrink-0 text-end font-kit-mono text-kit-mono-sm text-kit-ink-muted" style={{ height }} aria-hidden>
            <span className="absolute -top-2 right-0">{fmtTick(top)}</span>
            <span className="absolute right-0 bottom-3">0</span>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── One post against your median: a bar from the median line, log2 ──── */

/** 0.25× to 32×: log2 is the honest encoding for a ratio; ticks are said in multiples. */
const LOG_LO = -2
const LOG_HI = 5
const pos = (m: number) => (Math.max(LOG_LO, Math.min(LOG_HI, Math.log2(Math.max(m, 1e-6)))) - LOG_LO) / (LOG_HI - LOG_LO)

export function MultipleBar({ multiple, emphasis = true }: { multiple: number | null; emphasis?: boolean }) {
  if (multiple === null) return <span className="block h-2 w-full rounded-full bg-kit-well" aria-hidden />
  const at1 = pos(1)
  const at = pos(multiple)
  const left = Math.min(at1, at)
  const width = Math.abs(at - at1)
  const above = multiple >= 1
  return (
    <span className="relative block h-3 w-full" aria-hidden>
      <span className="absolute inset-x-0 inset-y-1 rounded-full bg-kit-well" />
      <span
        className={`absolute inset-y-0.5 ${above ? "rounded-e-full" : "rounded-s-full"} ${above && emphasis ? "bg-kit-ink" : above ? "bg-kit-ink-muted" : "bg-kit-mark"}`}
        style={{ left: `${left * 100}%`, width: `max(2px, ${width * 100}%)` }}
      />
      <span className="absolute -inset-y-0.5 w-px bg-kit-ink-muted" style={{ left: `${at1 * 100}%` }} />
    </span>
  )
}

/** The scale's own legend, once above a list of MultipleBars. */
export function MultipleScale() {
  return (
    <span className="relative block h-4 w-full font-kit-mono text-kit-mono-sm text-kit-ink-muted" aria-hidden>
      {[0.25, 1, 4, 32].map((t) => (
        <span key={t} className="absolute -translate-x-1/2" style={{ left: `${pos(t) * 100}%` }}>
          {t === 1 ? "median" : formatMultiple(t)}
        </span>
      ))}
    </span>
  )
}

/* ── How a post's views climbed, morning by morning ──────────────────── */

export function Climb({ climb, label }: { climb: number[]; label: string }) {
  const [at, setAt] = React.useState<number | null>(null)
  const ref = React.useRef<HTMLDivElement>(null)
  const n = climb.length
  const final = climb[n - 1] ?? 0
  const W = 100
  const H = 48
  const x = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * W)
  const y = (v: number) => H - 1 - (final ? (v / final) * (H - 6) : 0)
  const line = climb.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join("")
  const dayOne = final ? Math.round(((climb[0] ?? 0) / final) * 100) : 0
  const say = (i: number) => `Day ${i + 1}: ${fmt(climb[i]!)} views, ${final ? Math.round((climb[i]! / final) * 100) : 0}% of today's.`

  if (n < 2) {
    return <p className="text-kit-meta text-kit-ink-muted">Measured once so far. The climb shows from the second morning.</p>
  }

  function fromPointer(e: React.PointerEvent) {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    setAt(Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1)))))
  }

  return (
    <div className="flex flex-col gap-kit-tight">
      <div
        ref={ref}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={1}
        aria-valuemax={n}
        aria-valuenow={(at ?? n - 1) + 1}
        aria-valuetext={say(at ?? n - 1)}
        onPointerMove={fromPointer}
        onPointerDown={fromPointer}
        onPointerLeave={() => setAt(null)}
        onBlur={() => setAt(null)}
        onKeyDown={(e) => {
          const cur = at ?? n - 1
          if (e.key === "ArrowRight") setAt(Math.min(n - 1, cur + 1))
          else if (e.key === "ArrowLeft") setAt(Math.max(0, cur - 1))
          else if (e.key === "Home") setAt(0)
          else if (e.key === "End") setAt(n - 1)
          else return
          e.preventDefault()
        }}
        className="relative h-12 w-full touch-pan-y rounded-kit-chip outline-hidden focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-kit-focus"
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
          <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} className="stroke-kit-hairline" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <path d={line} fill="none" className="stroke-kit-ink" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {at !== null ? <line x1={x(at)} x2={x(at)} y1={0} y2={H} className="stroke-kit-ink-muted" strokeWidth={1} vectorEffect="non-scaling-stroke" /> : null}
        </svg>
        {at !== null ? (
          <span
            className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-kit-ink ring-2 ring-kit-object"
            style={{ left: `${x(at)}%`, top: `${(y(climb[at]!) / H) * 100}%` }}
          />
        ) : null}
      </div>
      <p className="text-kit-meta text-kit-ink-muted tabular-nums" aria-hidden>
        {at !== null ? say(at) : `${dayOne}% of it came on day one. Measured ${n} mornings.`}
      </p>
    </div>
  )
}

/* ── Eight weeks of one person: a dot per week they replied ───────────── */

export function WeekDots({ weeks }: { weeks: boolean[] }) {
  return (
    <span className="flex items-center gap-1" aria-hidden>
      {weeks.map((on, i) => (
        <span key={i} className={`size-1.5 rounded-full ${on ? "bg-kit-ink" : "bg-kit-mark opacity-50"}`} />
      ))}
    </span>
  )
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

function niceCeil(v: number) {
  if (v <= 5) return Math.max(1, Math.ceil(v))
  const p = 10 ** Math.floor(Math.log10(v))
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p
  return 10 * p
}

function fmtTick(v: number) {
  return v >= 10_000 ? `${Math.round(v / 1000)}K` : fmt(v)
}

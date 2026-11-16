"use client"

import * as React from "react"

import { DEFAULT_OPTIONS, type LabOptions } from "./lab-options"
import type { Phase } from "./parts/chrome"

/**
 * Every choice the owner has not made, live. Harness, not design
 * (harness.css): dark glass, system font, never kit tokens.
 */

type Seg<T extends string | number> = { label: string; value: T; options: readonly T[]; set: (v: T) => void; why: string; disabled?: (v: T) => boolean }

function SegRow<T extends string | number>({ label, value, options, set, why, disabled }: Seg<T>) {
  return (
    <div className="row">
      <div className="head">
        <span>{label}</span>
        <output>{String(value)}</output>
      </div>
      <div className="seg" role="group" aria-label={label}>
        {options.map((o) => (
          <button key={String(o)} type="button" aria-pressed={value === o} disabled={disabled?.(o)} onClick={() => set(o)}>
            {String(o)}
          </button>
        ))}
      </div>
      <span className="why">{why}</span>
    </div>
  )
}

function Slider({ label, value, min, max, step, unit, set, why }: { label: string; value: number; min: number; max: number; step: number; unit: string; set: (n: number) => void; why: string }) {
  const id = React.useId()
  return (
    <div className="row">
      <div className="head">
        <label htmlFor={id}>{label}</label>
        <output>
          {value}
          {unit}
        </output>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(Number(e.target.value))} />
      <span className="why">{why}</span>
    </div>
  )
}

export function ControlPanel({
  variant,
  bet,
  givesUp,
  opts,
  setOpts,
  phase,
  setPhase,
  phases,
  source,
  setSource,
  hasReal,
  realNotes,
}: {
  variant: string
  bet: string
  givesUp: string
  opts: LabOptions
  setOpts: (o: LabOptions) => void
  phase: Phase
  setPhase: (p: Phase) => void
  phases: readonly Phase[]
  source: "fixtures" | "yours"
  setSource: (s: "fixtures" | "yours") => void
  hasReal: boolean
  realNotes: string[]
}) {
  const [closed, setClosed] = React.useState(false)
  const [copied, setCopied] = React.useState(false)
  const set = <K extends keyof LabOptions>(k: K, v: LabOptions[K]) => {
    setOpts({ ...opts, [k]: v })
    setCopied(false)
  }
  const config = [
    `layout: ${variant}`,
    `data: ${source}`,
    `baseline after: ${opts.minWeeks} weeks`,
    `spark: ${opts.spark}`,
    `order: ${opts.order} first`,
    `best: ${opts.best}`,
    `scale: ${opts.scale}`,
    `pane: clamp(${opts.paneMin}px, ${opts.paneShare}cqi, ${opts.paneMax}px)`,
    `margin: ${opts.margin}`,
  ].join(" · ")

  if (closed) {
    return (
      <div className="nl-panel" data-closed="">
        <button type="button" className="plain" onClick={() => setClosed(false)}>
          Controls
        </button>
      </div>
    )
  }

  return (
    <section className="nl-panel" aria-label="Controls">
      <div className="head" style={{ alignItems: "center", paddingBottom: 8 }}>
        <h2>{variant}</h2>
        <button type="button" className="plain" onClick={() => setClosed(true)}>
          Hide
        </button>
      </div>
      <div className="row">
        <span>
          <b>Bets on</b> {bet}
        </span>
        <span className="why">
          <b>Gives up</b> {givesUp}
        </span>
      </div>

      <SegRow
        label="Data"
        value={source}
        options={["fixtures", "yours"] as const}
        set={setSource}
        disabled={(v) => v === "yours" && !hasReal}
        why={hasReal ? `yours: this account's own rows, read-only. ${realNotes.join(" ")}` : "yours: sign in to read your own rows"}
      />
      <SegRow label="State" value={phase} options={phases} set={setPhase} why="fixtures only; the real view shows its own state" />
      <Slider label="Baseline after" value={opts.minWeeks} min={2} max={6} step={1} unit=" wk" set={(v) => set("minWeeks", v)} why="weeks behind the period before a usual is stated; fewer says 'needs N weeks'" />
      <SegRow label="Tile order" value={opts.order} options={["depth", "volume"] as const} set={(v) => set("order", v)} why="A. The vision: Depth above Volume, even though Volume demos better" />
      <SegRow label="Tile trend" value={opts.spark} options={["line", "columns"] as const} set={(v) => set("spark", v)} why="A. The period in ink, the weeks before it in the faint mark" />
      <Slider label="What worked, rows" value={opts.best} min={3} max={8} step={1} unit="" set={(v) => set("best", v)} why="A" />
      <SegRow label="Median bars" value={opts.scale} options={["log", "linear"] as const} set={(v) => set("scale", v)} why="A–C. Log2 is the honest scale for a ratio (0.25× to 32×); linear lets one outlier flatten the rest" />
      <Slider label="Pane, min" value={opts.paneMin} min={340} max={520} step={20} unit="px" set={(v) => set("paneMin", v)} why="B" />
      <Slider label="Pane, share" value={opts.paneShare} min={30} max={50} step={1} unit="cqi" set={(v) => set("paneShare", v)} why="B. Drafts uses 46; a post's numbers read in less" />
      <Slider label="Pane, max" value={opts.paneMax} min={440} max={720} step={20} unit="px" set={(v) => set("paneMax", v)} why="B" />
      <Slider label="Margin" value={opts.margin} min={160} max={260} step={10} unit="px" set={(v) => set("margin", v)} why="C. The column the small charts stand in" />

      <div className="row">
        <div className="seg" style={{ background: "transparent", gap: 6 }}>
          <button
            type="button"
            className="plain"
            onClick={() => {
              void navigator.clipboard?.writeText(config).then(
                () => setCopied(true),
                () => window.prompt("Copy the config", config),
              )
            }}
          >
            {copied ? "Copied" : "Copy config"}
          </button>
          <button type="button" className="plain" onClick={() => setOpts(DEFAULT_OPTIONS)}>
            Reset
          </button>
        </div>
        <span className="config">{config}</span>
      </div>
    </section>
  )
}

"use client"

import * as React from "react"

import type { Scenario } from "./data"
import { DEFAULT_OPTIONS, type LabOptions } from "./lab-options"
import type { Phase } from "./use-lineup"

/**
 * The control panel: every choice the owner has not made, live. Harness,
 * not design (harness.css): dark glass, system font, never kit tokens.
 */

type Seg<T extends string | number> = { label: string; value: T; options: readonly T[]; set: (v: T) => void; why: string }

function SegRow<T extends string | number>({ label, value, options, set, why }: Seg<T>) {
  return (
    <div className="row">
      <div className="head">
        <span>{label}</span>
        <output>{String(value)}</output>
      </div>
      <div className="seg" role="group" aria-label={label}>
        {options.map((o) => (
          <button key={String(o)} type="button" aria-pressed={value === o} onClick={() => set(o)}>
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
  scenario,
  setScenario,
  onReset,
}: {
  variant: string
  bet: string
  givesUp: string
  opts: LabOptions
  setOpts: (o: LabOptions) => void
  phase: Phase
  setPhase: (p: Phase) => void
  scenario: Scenario
  setScenario: (s: Scenario) => void
  onReset: () => void
}) {
  const [closed, setClosed] = React.useState(false)
  const [copied, setCopied] = React.useState(false)
  const set = <K extends keyof LabOptions>(k: K, v: LabOptions[K]) => {
    setOpts({ ...opts, [k]: v })
    setCopied(false)
  }
  const config = [
    `layout: ${variant}`,
    `week: ${scenario}`,
    `feed column: ${opts.postX}`,
    `calendar hour: ${opts.hourPx}`,
    `rail: ${opts.rail}`,
    `margin: ${opts.margin}`,
    `order: ${opts.order}`,
    `notes: ${opts.notes}`,
  ].join(" · ")

  if (closed) {
    return (
      <div className="ll-panel" data-closed="">
        <button type="button" className="plain" onClick={() => setClosed(false)}>
          Controls
        </button>
      </div>
    )
  }

  return (
    <section className="ll-panel" aria-label="Controls">
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

      <SegRow label="Week" value={scenario} options={["fixtures", "real", "full", "first-run"] as const} set={setScenario} why="real: the live account's shape today (two X slots, nothing scheduled, one approved with no time); full: every slot taken for two weeks; first-run: no slots" />
      <SegRow label="State" value={phase} options={["live", "loading"] as const} set={setPhase} why="the filters can empty the list: Channel LinkedIn + Show still to go on the real week" />
      <SegRow label="Quincy's notes" value={opts.notes} options={["on", "off"] as const} set={(v) => set("notes", v)} why="proposed: facts about the week in the margin (two posts three hours apart, passed empty, quiet day)" />
      <Slider label="Feed column" value={opts.postX} min={520} max={640} step={2} unit="px" set={(v) => set("postX", v)} why="1 and 3. X's column is 598; 1 · Table's pane is this + 40" />
      <Slider label="Calendar hour" value={opts.hourPx} min={40} max={80} step={4} unit="px" set={(v) => set("hourPx", v)} why="2. The height of an hour; a post is drawn 45 minutes tall, the snap is 15" />
      <Slider label="Feed rail" value={opts.rail} min={88} max={160} step={4} unit="px" set={(v) => set("rail", v)} why="3. The day, the time and the state, left of the column" />
      <Slider label="Feed margin" value={opts.margin} min={200} max={320} step={8} unit="px" set={(v) => set("margin", v)} why="3. Quincy's notes, and the open post's verbs" />
      <SegRow label="Feed order" value={opts.order} options={["forward", "profile"] as const} set={(v) => set("order", v)} why="3. forward: today on top, the week read down; profile: newest on top, as your profile will show it" />

      <div className="row">
        <div className="seg" style={{ background: "transparent", gap: 6 }}>
          <button
            type="button"
            className="plain"
            onClick={() => {
              void navigator.clipboard?.writeText(config).then(
                () => setCopied(true),
                () => window.prompt("Copy the config", config)
              )
            }}
          >
            {copied ? "Copied" : "Copy config"}
          </button>
          <button type="button" className="plain" onClick={() => setOpts(DEFAULT_OPTIONS)}>
            Reset
          </button>
          <button type="button" className="plain" onClick={onReset}>
            Reset week
          </button>
        </div>
        <span className="config">{config}</span>
      </div>
    </section>
  )
}

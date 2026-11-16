"use client"

import * as React from "react"

import type { LabOptions } from "./lab-options"
import { DEFAULT_OPTIONS } from "./lab-options"
import type { Phase } from "./use-drafts"

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
  depth,
  setDepth,
  onReset,
}: {
  variant: string
  bet: string
  givesUp: string
  opts: LabOptions
  setOpts: (o: LabOptions) => void
  phase: Phase
  setPhase: (p: Phase) => void
  depth: "fixtures" | "real"
  setDepth: (d: "fixtures" | "real") => void
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
    `queue: ${depth}`,
    `row title: ${opts.title}`,
    `marks: ${opts.marks}`,
    `pane: clamp(${opts.detailMin}px, ${opts.detailShare}cqi, ${opts.detailMax}px)`,
    `desk type: ${opts.deskType}`,
    `list keeps: ${opts.listKeep}`,
    `post: x ${opts.postX} / linkedin ${opts.postLinkedIn}`,
    `avatar: ${opts.avatar}`,
    `marks: ${opts.markCol}`,
    `stage pad: ${opts.stagePad}`,
  ].join(" · ")

  if (closed) {
    return (
      <div className="dl-panel" data-closed="">
        <button type="button" className="plain" onClick={() => setClosed(false)}>
          Controls
        </button>
      </div>
    )
  }

  return (
    <section className="dl-panel" aria-label="Controls">
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

      <SegRow label="State" value={phase} options={["live", "loading", "empty"] as const} set={setPhase} why="search for nothing to see the filtered empty state" />
      <SegRow label="Queue" value={depth} options={["fixtures", "real"] as const} set={setDepth} why="real: 110 drafts, the live account's depth (older fixtures repeated)" />
      <SegRow label="Row title" value={opts.title} options={["opening", "idea"] as const} set={(v) => set("title", v)} why="the post's first line (what the feed shows) or the idea it is about (today's /drafts row)" />
      <SegRow label="Unbracketed drafts" value={opts.marks} options={["note", "plain"] as const} set={(v) => set("marks", v)} why="0 of 110 live drafts bracket; note names the missing beat (proposed)" />
      <Slider label="Pane, min" value={opts.detailMin} min={440} max={640} step={20} unit="px" set={(v) => set("detailMin", v)} why="Table. 440 keeps 1280 a table (title column 282); 552 would put the brackets in the margin there, and fold it" />
      <Slider label="Pane, share" value={opts.detailShare} min={36} max={56} step={1} unit="cqi" set={(v) => set("detailShare", v)} why="Table. Ideas uses 36; a draft is read, not scanned" />
      <Slider label="Pane, max" value={opts.detailMax} min={560} max={800} step={20} unit="px" set={(v) => set("detailMax", v)} why="Table. Raising min or share folds 1280 into Lineup sooner" />
      <Slider label="Round 2 · list keeps" value={opts.listKeep} min={480} max={720} step={20} unit="px" set={(v) => set("listKeep", v)} why="A–C. The post pane takes the rest (440–860). 580 keeps a 283 title column, so 1280 stays a table" />
      <Slider label="Post width, X" value={opts.postX} min={440} max={640} step={2} unit="px" set={(v) => set("postX", v)} why="A–C. The feed column; the pane narrows it when it has to" />
      <Slider label="Post width, LinkedIn" value={opts.postLinkedIn} min={440} max={640} step={5} unit="px" set={(v) => set("postLinkedIn", v)} why="A–C" />
      <Slider label="Avatar" value={opts.avatar} min={24} max={48} step={2} unit="px" set={(v) => set("avatar", v)} why="A–C. The account circle; the thread connector follows its centre" />
      <Slider label="Mark column" value={opts.markCol} min={110} max={190} step={10} unit="px" set={(v) => set("markCol", v)} why="A–C. The margin the brackets and notes stand in (the kit's is 170)" />
      <Slider label="Stage padding" value={opts.stagePad} min={12} max={56} step={4} unit="px" set={(v) => set("stagePad", v)} why="B. The recess around the post" />
      <SegRow label="Desk type" value={opts.deskType} options={[14, 15, 16] as const} set={(v) => set("deskType", v)} why="Desk. The kit's body is 14; a proof reads larger" />

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
            Reset drafts
          </button>
        </div>
        <span className="config">{config}</span>
      </div>
    </section>
  )
}

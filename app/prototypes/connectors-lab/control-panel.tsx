"use client"

import * as React from "react"

import { SCENARIOS, type Scenario } from "./data"
import { DEFAULT_OPTIONS, type LabOptions } from "./lab-options"

/**
 * The control panel: every choice the owner has not made, live. Harness,
 * not design (candidates.css, "Harness"): dark glass, system font, never
 * kit tokens.
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

export function ControlPanel({
  variant,
  bet,
  givesUp,
  opts,
  setOpts,
  scenario,
  setScenario,
  onReset,
}: {
  variant: string
  bet: string
  givesUp: string
  opts: LabOptions
  setOpts: (o: LabOptions) => void
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
    `direction: ${variant}`,
    `state: ${scenario}`,
    `columns: ${opts.cols}`,
    `density: ${opts.density}`,
    `metric: ${opts.metric}`,
    `tags: ${opts.tags}`,
    `frame: ${opts.frame}`,
    `connected mark: ${opts.mark}`,
    `header pill: ${opts.header}`,
  ].join(" · ")

  if (closed) {
    return (
      <div className="cl-panel-harness" data-closed="">
        <button type="button" className="plain" onClick={() => setClosed(false)}>
          Controls
        </button>
      </div>
    )
  }

  return (
    <section className="cl-panel-harness" aria-label="Controls">
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

      <SegRow label="Account" value={scenario} options={SCENARIOS} set={setScenario} why="today: the live account's shape (GitHub and X in). all: everything live connected. first-run: nothing. failed: GitHub, Circleback and the bookmark read stopped. reauth: LinkedIn and X bookmarks need reconnecting, GitHub half set up." />
      <SegRow label="Columns" value={opts.cols} options={[2, 3, 4] as const} set={(v) => set("cols", v)} why="1. At full width; fewer as the page narrows, one on a phone" />
      <SegRow label="Card density" value={opts.density} options={["comfortable", "compact"] as const} set={(v) => set("density", v)} why="1. Padding 20 or 12 inside a card" />
      <SegRow label="Metric row" value={opts.metric} options={["on", "off"] as const} set={(v) => set("metric", v)} why="Connected cards' one number. Only where the data exists; none for a follower count" />
      <SegRow label="Tags" value={opts.tags} options={["on", "off"] as const} set={(v) => set("tags", v)} why="1. Chips for what a card not connected hands over" />
      <SegRow label="Frame" value={opts.frame} options={["panel", "ground"] as const} set={(v) => set("frame", v)} why="1. panel: the cards in one white object (the reference). ground: each card lifted on the page" />
      <SegRow label="Connected mark" value={opts.mark} options={["dot", "words"] as const} set={(v) => set("mark", v)} why="dot: the brief's LiveDot. words: today's rule, 'a connection is permission, not a running ritual'" />
      <SegRow label="Header pill" value={opts.header} options={["ink", "quiet"] as const} set={(v) => set("header", v)} why="ink: the reference's 'Request integration'. A broken connector takes the ink either way (actions.md)" />
      <SegRow label="Mark proposed" value={opts.proposed} options={["show", "hide"] as const} set={(v) => set("proposed", v)} why="A small 'proposed' beside every control with nothing behind it yet; hover for why" />

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
            Reset account
          </button>
        </div>
        <span className="config">{config}</span>
      </div>
    </section>
  )
}

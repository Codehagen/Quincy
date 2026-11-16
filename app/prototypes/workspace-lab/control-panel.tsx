"use client"

import * as React from "react"

/**
 * The control panel (the prototype skill's CONTROLS.md): every number the
 * owner has not decided, on a live control. Each control writes a CSS
 * variable or a data-attribute on the lab root imperatively, so dragging a
 * slider re-renders only the panel, never the workspace under it.
 */

type Slider = { kind: "slider"; key: string; label: string; v: string; min: number; max: number; step: number; unit: string; def: number; why: string }
type Seg = { kind: "seg"; key: string; label: string; attr?: string; v?: string; unit?: string; options: string[]; def: string; why: string }
type Def = Slider | Seg

/**
 * After the surfaces / foundations pass (2026-11-16) only the numbers that
 * are taste, not rule, stay here: density and the detail's floor and
 * ceiling (its width is 36% of the workspace between them). Meta 12,
 * mono 11, page title 15/600, icons 16 @ 1.75, hairline pane edges, text
 * shape tags and the bar-selected row are baked in candidates.css
 * (DECISION.md, "Picked", says why each). "Table" shows the loading rows;
 * the empty state is a search for nothing.
 */
export const DEFS: Def[] = [
  { kind: "slider", key: "row", label: "Row height", v: "--ws-row-h", min: 28, max: 48, step: 2, unit: "px", def: 36, why: "kit ListRow is 44 (60 with two lines)" },
  { kind: "slider", key: "title", label: "Row title", v: "--ws-row-title", min: 12.5, max: 15, step: 0.5, unit: "px", def: 13, why: "meta is 12 and mono 11 below it; 14 closes the gap to meta" },
  // The detail is clamp(min, 36% of the workspace, max) (candidates.css). Both ends move the fold too (layouts/table.tsx).
  { kind: "slider", key: "detailMin", label: "Detail panel, min", v: "--ws-detail-min", min: 360, max: 560, step: 20, unit: "px", def: 440, why: "the width at 1280 (36% is under it there); raising it folds 1280 into Inline" },
  { kind: "slider", key: "detailMax", label: "Detail panel, max", v: "--ws-detail-max", min: 440, max: 680, step: 20, unit: "px", def: 560, why: "the width on a wide screen; from 608 the margin moves beside the prose" },
  { kind: "seg", key: "table", label: "Table", attr: "data-table", options: ["rows", "loading"], def: "rows", why: "search for nothing to see the empty state" },
]

export const DEFAULT_ATTRS = { "data-table": "rows" } as const

function apply(root: HTMLElement, d: Def, value: string | number) {
  if (d.kind === "seg" && d.attr) root.setAttribute(d.attr, String(value))
  else if (d.v) root.style.setProperty(d.v, `${value}${d.kind === "slider" ? d.unit : (d.unit ?? "")}`)
}

export function ControlPanel({
  rootRef,
  frame,
  setFrame,
  variant,
  onResetQueue,
}: {
  rootRef: React.RefObject<HTMLElement | null>
  frame: number
  setFrame: (n: number) => void
  variant: string
  onResetQueue: () => void
}) {
  const initial = React.useMemo(() => Object.fromEntries(DEFS.map((d) => [d.key, String(d.def)])), [])
  const [values, setValues] = React.useState<Record<string, string>>(initial)
  const [closed, setClosed] = React.useState(false)
  const [copied, setCopied] = React.useState(false)

  const set = (d: Def, value: string) => {
    setValues((v) => ({ ...v, [d.key]: value }))
    setCopied(false)
    if (rootRef.current) apply(rootRef.current, d, value)
  }

  const preset = (row: number, title: number) => {
    set(DEFS[0]!, String(row))
    set(DEFS[1]!, String(title))
  }

  const config = [
    `layout: ${variant}`,
    `window: ${frame}`,
    ...DEFS.map((d) => `${d.key}: ${values[d.key]}${d.kind === "slider" ? d.unit : (d.unit ?? "")}`),
  ].join(" · ")

  if (closed) {
    return (
      <div className="ws-panel" data-closed="">
        <button type="button" className="plain" onClick={() => setClosed(false)}>
          Controls
        </button>
      </div>
    )
  }

  return (
    <section className="ws-panel" aria-label="Controls">
      <div className="head" style={{ alignItems: "center", paddingBottom: 8 }}>
        <h2>Controls</h2>
        <button type="button" className="plain" onClick={() => setClosed(true)}>
          Hide
        </button>
      </div>

      <div className="row">
        <div className="head">
          <span>Window</span>
          <output>{frame}px</output>
        </div>
        <div className="seg">
          {[1440, 1280].map((f) => (
            <button key={f} type="button" aria-pressed={frame === f} onClick={() => setFrame(f)}>
              {f}
            </button>
          ))}
        </div>
        <span className="why">the sidebar takes 208 of it</span>
      </div>

      <div className="row">
        <div className="head">
          <span>Density</span>
          <output>
            {values.row}px / {values.title}px
          </output>
        </div>
        <div className="seg">
          <button type="button" aria-pressed={values.row === "32" && values.title === "13"} onClick={() => preset(32, 13)}>
            Compact
          </button>
          <button type="button" aria-pressed={values.row === "36" && values.title === "13"} onClick={() => preset(36, 13)}>
            Default
          </button>
          <button type="button" aria-pressed={values.row === "40" && values.title === "14"} onClick={() => preset(40, 14)}>
            Comfortable
          </button>
        </div>
      </div>

      {DEFS.map((d) => (
        <div className="row" key={d.key}>
          <div className="head">
            {d.kind === "slider" ? <label htmlFor={`ws-c-${d.key}`}>{d.label}</label> : <span>{d.label}</span>}
            <output>
              {values[d.key]}
              {d.kind === "slider" ? d.unit : (d.unit ?? "")}
            </output>
          </div>
          {d.kind === "slider" ? (
            <input
              id={`ws-c-${d.key}`}
              type="range"
              min={d.min}
              max={d.max}
              step={d.step}
              value={values[d.key]}
              onChange={(e) => set(d, e.target.value)}
            />
          ) : (
            <div className="seg" role="group" aria-label={d.label}>
              {d.options.map((o) => (
                <button key={o} type="button" aria-pressed={values[d.key] === o} onClick={() => set(d, o)}>
                  {o}
                </button>
              ))}
            </div>
          )}
          <span className="why">{d.why}</span>
        </div>
      ))}

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
          <button
            type="button"
            className="plain"
            onClick={() => {
              for (const d of DEFS) set(d, String(d.def))
            }}
          >
            Reset
          </button>
          <button type="button" className="plain" onClick={onResetQueue}>
            Reset ideas
          </button>
        </div>
        <span className="config">{config}</span>
      </div>
    </section>
  )
}

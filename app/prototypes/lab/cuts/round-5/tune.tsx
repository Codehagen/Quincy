"use client"

/*
 * The tune panel: harness chrome for 52, not a design element. Neutral and
 * unbranded, plain <select>, <input type="range"> and a checkbox, no new
 * dependency. It never touches React state: each control writes the shared
 * timing ref the director reads at every use, or a CSS variable / data
 * attribute on the piece's wrapper, and its value label is written in place.
 * So moving a slider re-renders nothing, mid-run included.
 */

import * as React from "react"

import { DEFAULT_TUNE, type Tune } from "../round-4/director"

type Num = Exclude<{ [K in keyof Tune]: Tune[K] extends number ? K : never }[keyof Tune], "speed">

const RANGES: ReadonlyArray<{ key: Num; label: string; min: number; max: number; step: number }> = [
  { key: "glideMin", label: "glide min", min: 40, max: 300, step: 10 },
  { key: "glideMax", label: "glide max", min: 80, max: 500, step: 10 },
  { key: "press", label: "press", min: 40, max: 300, step: 10 },
  { key: "gapFirst", label: "gap first", min: 0, max: 400, step: 10 },
  { key: "gapLast", label: "gap last", min: 0, max: 400, step: 10 },
]

export function configLine(t: Tune) {
  return `glide: ${t.glideMin}–${t.glideMax}ms · press: ${t.press}ms · gaps: ${t.gapFirst}→${t.gapLast}ms · tone: ${t.tone === "highlight" ? "yellow" : "ink"} · ring: ${t.ring ? "on" : "off"} · speed: ${t.speed}×`
}

export function TunePanel({
  tuneRef,
  wrapperRef,
}: {
  tuneRef: React.RefObject<Tune>
  /** The piece's wrapper: carries --qc4-press and the tone / ring attributes. */
  wrapperRef: React.RefObject<HTMLDivElement | null>
}) {
  const out = React.useRef<Partial<Record<string, HTMLOutputElement | null>>>({})
  const copied = React.useRef<HTMLSpanElement>(null)

  const write = (key: keyof Tune, value: Tune[keyof Tune], shown: string) => {
    tuneRef.current = { ...tuneRef.current, [key]: value } as Tune
    const o = out.current[key]
    if (o) o.textContent = shown
    const w = wrapperRef.current
    if (!w) return
    if (key === "press") w.style.setProperty("--qc4-press", `${value}ms`)
    if (key === "tone") w.dataset.qc4Tone = String(value)
    if (key === "ring") w.dataset.qc4Ring = value ? "on" : "off"
  }

  const copy = async () => {
    const line = configLine(tuneRef.current)
    try {
      await navigator.clipboard.writeText(line)
      if (copied.current) copied.current.textContent = "Copied"
      window.setTimeout(() => {
        if (copied.current) copied.current.textContent = ""
      }, 1200)
    } catch {
      window.prompt("Copy this", line)
    }
  }

  const row = "grid grid-cols-[72px_1fr_48px] items-center gap-2"
  return (
    <details className="absolute top-2 right-2 z-40 w-[280px] rounded-md bg-white/95 p-2 font-mono text-[11px] text-neutral-800 shadow ring-1 ring-neutral-300 dark:bg-neutral-900/95 dark:text-neutral-100 dark:ring-neutral-700">
      <summary className="cursor-pointer select-none">tune</summary>
      <div className="mt-2 flex flex-col gap-1.5">
        <label className={row}>
          <span>speed</span>
          <select
            defaultValue={String(DEFAULT_TUNE.speed)}
            onChange={(e) => write("speed", Number(e.currentTarget.value), `${e.currentTarget.value}×`)}
            className="rounded border border-neutral-300 bg-transparent px-1 py-0.5"
          >
            {[0.25, 0.5, 1, 1.5].map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
          <output ref={(el) => void (out.current.speed = el)} className="text-right tabular-nums">
            {DEFAULT_TUNE.speed}×
          </output>
        </label>
        {RANGES.map((r) => (
          <label key={r.key} className={row}>
            <span>{r.label}</span>
            <input
              type="range"
              min={r.min}
              max={r.max}
              step={r.step}
              defaultValue={DEFAULT_TUNE[r.key]}
              onInput={(e) => write(r.key, Number(e.currentTarget.value), `${e.currentTarget.value}ms`)}
            />
            <output ref={(el) => void (out.current[r.key] = el)} className="text-right tabular-nums">
              {DEFAULT_TUNE[r.key]}ms
            </output>
          </label>
        ))}
        <label className={row}>
          <span>tone</span>
          <select
            defaultValue={DEFAULT_TUNE.tone}
            onChange={(e) => {
              const v = e.currentTarget.value as Tune["tone"]
              write("tone", v, v === "highlight" ? "yellow" : "ink")
            }}
            className="rounded border border-neutral-300 bg-transparent px-1 py-0.5"
          >
            <option value="ink">ink</option>
            <option value="highlight">yellow</option>
          </select>
          <output ref={(el) => void (out.current.tone = el)} className="text-right">
            ink
          </output>
        </label>
        <label className={row}>
          <span>ring</span>
          <input
            type="checkbox"
            defaultChecked={DEFAULT_TUNE.ring}
            onChange={(e) => write("ring", e.currentTarget.checked, e.currentTarget.checked ? "on" : "off")}
            className="justify-self-start"
          />
          <output ref={(el) => void (out.current.ring = el)} className="text-right">
            on
          </output>
        </label>
        <div className="flex items-center gap-2 pt-1">
          <button type="button" onClick={() => void copy()} className="rounded border border-neutral-300 px-2 py-0.5">
            Copy config
          </button>
          <span ref={copied} />
        </div>
      </div>
    </details>
  )
}

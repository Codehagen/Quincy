"use client"

/*
 * The tune panel, ported from the lab (round-5/tune.tsx) onto the real
 * editor. Harness chrome: neutral, unbranded, plain inputs. It never touches
 * React state. Timing goes to the CSS variables the director reads at the
 * start of every run (agent-cursor.css, timing.ts readTiming), set inline on
 * `.agent-desk`; tone, ring and reduced motion are data attributes on the
 * mock's wrapper (mock.css). Each value label is written in place, so moving
 * a slider re-renders nothing, mid-run included. The model pace and the scan
 * are read by the mock itself: the pace when the transport answers a
 * request, the scan when Replay mounts a fresh editor.
 */


import { TIMING } from "@/components/editor/agent-cursor/timing"
import { MODEL_PACES, type ModelPace } from "@/lib/editor/pace"

import { forceReducedMotion } from "./reduced"

export type Tune = {
  speed: number
  glideMin: number
  glideMax: number
  press: number
  gapFirst: number
  gapLast: number
  tone: "ink" | "highlight"
  ring: boolean
  reduced: boolean
  /** The waits a model makes between parts (lib/editor/pace.ts). */
  pace: ModelPace
  /** Play the arrival's reading on every Replay. */
  scan: boolean
  /** Type and send the scenario's prompt 1.5 s after the starters land; off, the person sends. */
  autoSend: boolean
}

/** The locked numbers (plans/036, "The motion numbers"). */
export const DEFAULT_TUNE: Tune = {
  speed: 1,
  glideMin: TIMING.glideMinMs,
  glideMax: TIMING.glideMaxMs,
  press: TIMING.pressMs,
  gapFirst: TIMING.gapFirstMs,
  gapLast: TIMING.gapLastMs,
  tone: "ink",
  ring: true,
  reduced: false,
  pace: "realistic",
  scan: true,
  autoSend: true,
}

type Num = "glideMin" | "glideMax" | "press" | "gapFirst" | "gapLast"

const RANGES: ReadonlyArray<{ key: Num; label: string; min: number; max: number; step: number; css: string }> = [
  { key: "glideMin", label: "glide min", min: 40, max: 300, step: 10, css: "--agent-glide-min" },
  { key: "glideMax", label: "glide max", min: 80, max: 500, step: 10, css: "--agent-glide-max" },
  { key: "press", label: "press", min: 40, max: 300, step: 10, css: "--agent-press" },
  { key: "gapFirst", label: "gap first", min: 0, max: 400, step: 10, css: "--agent-gap-first" },
  { key: "gapLast", label: "gap last", min: 0, max: 400, step: 10, css: "--agent-gap-last" },
]

/**
 * The tune now: a module-level value the controls write and the mock reads
 * after each remount. Not React state, so a slider re-renders nothing.
 */
export const tuneNow: { current: Tune } = { current: DEFAULT_TUNE }

/** The lab's one-line format, so a tuned run can be pasted into the plan. */
export function configLine(t: Tune) {
  return `glide: ${t.glideMin}–${t.glideMax}ms · press: ${t.press}ms · gaps: ${t.gapFirst}→${t.gapLast}ms · tone: ${t.tone === "highlight" ? "yellow" : "ink"} · ring: ${t.ring ? "on" : "off"} · speed: ${t.speed}× · model pace: ${t.pace} · scan: ${t.scan ? "on" : "off"} · auto-send: ${t.autoSend ? "on" : "off"}`
}

/**
 * Write the tune onto the editor. Called on every change and after every
 * remount (Replay), since a fresh `.agent-desk` starts from the stylesheet.
 * The editor's pace is 1.3 (piece 52); speed divides it, so 0.25× is four
 * times as long with the same curve.
 */
export function applyTune(t: Tune, wrapper: HTMLElement | null) {
  if (!wrapper) return
  const desk = wrapper.querySelector<HTMLElement>(".agent-desk")
  if (desk) {
    desk.style.setProperty("--agent-pace", String(TIMING.pace / t.speed))
    for (const r of RANGES) desk.style.setProperty(r.css, String(t[r.key]))
  }
  wrapper.dataset.tone = t.tone
  wrapper.dataset.ring = t.ring ? "on" : "off"
  if (t.reduced) wrapper.dataset.reduced = ""
  else delete wrapper.dataset.reduced
  forceReducedMotion(t.reduced)
}

/** The value label beside a control, written in place. */
function show(control: HTMLElement, text: string) {
  const out = control.closest("label")?.querySelector("output")
  if (out) out.textContent = text
}

const CHECK_LABEL = { ring: "ring", reduced: "reduce motion", scan: "scan on arrival", autoSend: "auto-send" } as const

export function TunePanel({ wrapper }: { wrapper: () => HTMLElement | null }) {
  const write = (control: HTMLElement, key: keyof Tune, value: Tune[keyof Tune], shown: string) => {
    tuneNow.current = { ...tuneNow.current, [key]: value }
    show(control, shown)
    applyTune(tuneNow.current, wrapper())
  }

  const copy = async (button: HTMLButtonElement) => {
    const line = configLine(tuneNow.current)
    const note = button.nextElementSibling
    try {
      await navigator.clipboard.writeText(line)
      if (note) note.textContent = "Copied"
      window.setTimeout(() => {
        if (note) note.textContent = ""
      }, 1200)
    } catch {
      window.prompt("Copy this", line)
    }
  }

  const row = "grid grid-cols-[96px_1fr_64px] items-center gap-2"
  return (
    <details className="w-fit rounded-md bg-white/95 p-2 font-mono text-[11px] text-neutral-800 shadow ring-1 ring-neutral-300 dark:bg-neutral-900/95 dark:text-neutral-100 dark:ring-neutral-700 open:w-[320px]">
      <summary className="cursor-pointer select-none">tune</summary>
      <div className="mt-2 flex flex-col gap-1.5">
        <label className={row}>
          <span>speed</span>
          <select
            autoComplete="off"
            defaultValue={String(DEFAULT_TUNE.speed)}
            onChange={(e) => write(e.currentTarget, "speed", Number(e.currentTarget.value), `${e.currentTarget.value}×`)}
            className="rounded border border-neutral-300 bg-transparent px-1 py-0.5"
          >
            {[0.25, 0.5, 1, 1.5].map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
          <output className="text-right tabular-nums">
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
              autoComplete="off"
              defaultValue={DEFAULT_TUNE[r.key]}
              onInput={(e) => write(e.currentTarget, r.key, Number(e.currentTarget.value), `${e.currentTarget.value}ms`)}
            />
            <output className="text-right tabular-nums">
              {DEFAULT_TUNE[r.key]}ms
            </output>
          </label>
        ))}
        <label className={row}>
          <span>tone</span>
          <select
            autoComplete="off"
            defaultValue={DEFAULT_TUNE.tone}
            onChange={(e) => {
              const v = e.currentTarget.value as Tune["tone"]
              write(e.currentTarget, "tone", v, v === "highlight" ? "yellow" : "ink")
            }}
            className="rounded border border-neutral-300 bg-transparent px-1 py-0.5"
          >
            <option value="ink">ink</option>
            <option value="highlight">yellow</option>
          </select>
          <output className="text-right">
            ink
          </output>
        </label>
        <label className={row}>
          <span>model pace</span>
          <select
            autoComplete="off"
            defaultValue={DEFAULT_TUNE.pace}
            onChange={(e) => {
              const v = e.currentTarget.value as ModelPace
              write(e.currentTarget, "pace", v, v)
            }}
            className="rounded border border-neutral-300 bg-transparent px-1 py-0.5"
          >
            {MODEL_PACES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <output className="text-right">{DEFAULT_TUNE.pace}</output>
        </label>
        {(["ring", "reduced", "scan", "autoSend"] as const).map((key) => (
          <label key={key} className={row}>
            <span>{CHECK_LABEL[key]}</span>
            <input
              type="checkbox"
              autoComplete="off"
              defaultChecked={DEFAULT_TUNE[key]}
              onChange={(e) => write(e.currentTarget, key, e.currentTarget.checked, e.currentTarget.checked ? "on" : "off")}
              className="justify-self-start"
            />
            <output className="text-right">
              {DEFAULT_TUNE[key] ? "on" : "off"}
            </output>
          </label>
        ))}
        <div className="flex items-center gap-2 pt-1">
          <button type="button" onClick={(e) => void copy(e.currentTarget)} className="rounded border border-neutral-300 px-2 py-0.5">
            Copy config
          </button>
          <span aria-live="polite" />
        </div>
      </div>
    </details>
  )
}

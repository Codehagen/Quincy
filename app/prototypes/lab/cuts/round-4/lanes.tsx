"use client"

/*
 * The lanes for rounds 4 and 5, built for the choreography:
 *
 * - One scale for everything: time → px is the lane width over the cut's
 *   current length, so the ruler and the clips always end together.
 * - The spine is stable boxes: a run of speech is one clip, a pause or the
 *   "um" its own box, keyed by its first segment. A removed box leaves
 *   layout at once and the boxes after it slide in on `translate`. Speech on
 *   both sides of a removed box joins into one clip, so a cut never leaves a
 *   sliver.
 * - Each clip is a filmstrip with its waveform under it (film.tsx), one
 *   rounded outer edge, the strips square-cornered and clipped inside it.
 *   Its label shows only where it fits.
 * - Every target carries three layers under its content: the hover (the
 *   last 40 ms of a glide), the drag selection (grows from its left edge with
 *   the cursor) and the hit (an opacity-only wash as the press lands).
 * - The captions button is a real control: Quincy's press puts it in its
 *   pressed state (scale 0.96, 120 ms). The captions arrive as one wave and
 *   stay in their lane.
 * - An empty lane is quiet: no border (a dashed border reads as a drop zone).
 */

import type * as React from "react"

import { CAPTIONS, HOOK, SEGMENTS, fmt, fmtWhole } from "../round-1/fixture"
import type { CutState } from "../round-2/ops"
import { type Visual, zoomButton } from "./director"
import { CLIP_H, ClipFilm } from "./film"
import "./motion.css"

type Item = { id: string; kind: "speech" | "pause" | "filler"; segs: string[]; from: number; dur: number; src: [number, number]; text: string }

/** The spine's boxes on the cut's clock. Speech either side of a removed box is one clip. */
function layout(removed: ReadonlySet<string>) {
  const items: Item[] = []
  for (const s of SEGMENTS) {
    if (removed.has(s.id)) continue
    const prev = items.at(-1)
    if (s.kind === "speech" && prev?.kind === "speech") {
      prev.segs.push(s.id)
      prev.src[1] = s.end
      continue
    }
    items.push({ id: s.id, kind: s.kind, segs: [s.id], from: 0, dur: 0, src: [s.at, s.end], text: s.text })
  }
  let t = 0
  const spans = new Map<string, { from: number; to: number }>()
  for (const it of items) {
    it.from = t
    for (const id of it.segs) {
      const s = SEGMENTS.find((x) => x.id === id)!
      spans.set(id, { from: t, to: t + s.end - s.at })
      t += s.end - s.at
    }
    it.dur = t - it.from
  }
  for (const s of SEGMENTS) if (!spans.has(s.id)) spans.set(s.id, { from: 0, to: 0 })
  return { items, total: t, spans }
}

export function Target({
  id,
  d,
  tone,
  className = "",
  style,
  children,
  label,
}: {
  id: string
  d: Visual
  tone?: "ink" | "highlight"
  /** Must position the target (`absolute …` or `relative`). */
  className?: string
  style?: React.CSSProperties
  children?: React.ReactNode
  label?: string
}) {
  const dragging = d.drag?.target === id
  return (
    <div data-q={id} aria-label={label} data-pressed={d.button === id || undefined} className={className} style={style}>
      <span aria-hidden className="qc4-layer qc4-hover" data-on={d.hover === id || undefined} />
      <span
        aria-hidden
        className="qc4-layer qc4-sel"
        data-on={dragging || undefined}
        style={{ transitionDuration: dragging ? `${d.drag?.ms}ms` : "0ms" }}
      />
      {d.hot === id ? <span key={d.presses} aria-hidden className="qc4-layer qc4-hot" data-tone={tone} /> : null}
      {children}
    </div>
  )
}

const NAME = 62
/** A clip narrower than this shows no label; its name is in its aria-label. */
const LABEL_MIN = 52

export function Lanes4({
  cut,
  d,
  width,
  prefix = "",
  tone,
  lanes = ["clips", "captions", "effects"],
  name = "Clips",
  playhead,
}: {
  cut: CutState
  d: Visual
  width: number
  prefix?: string
  tone?: "ink" | "highlight"
  lanes?: ReadonlyArray<"clips" | "captions" | "effects">
  /** The first lane's name; 51 and 53 put the cut's letter there. */
  name?: string
  playhead?: number
}) {
  const { items, total, spans } = layout(cut.removed)
  const inner = width - NAME
  // One scale: the cut fills the lane, and the ruler's end is the clips' end.
  const px = inner / Math.max(total, 1)
  const hook = spans.get("hook")!
  const q = (id: string) => prefix + id
  const labels = items.filter((it) => it.kind !== "speech").map((it) => ({ id: it.id, x: (it.from + it.dur / 2) * px, text: it.kind === "pause" ? it.text : "um" }))
  const ticks = [0, 5, 10, 15, 20, 25, 30, 35].filter(
    (t) => t < total && t * px < inner - 48 && labels.every((l) => Math.abs(l.x - t * px) > 30),
  )
  const chips = CAPTIONS.map((c) => ({ ...c, span: spans.get(c.id)! })).filter((c) => c.span.to > c.span.from)
  const stagger = Math.min(25, 300 / Math.max(chips.length, 1))

  const lane = (label: string, h: number, body: React.ReactNode, quiet = false) => (
    <div className="flex items-center" style={{ height: h }}>
      <span className={`shrink-0 truncate text-kit-meta ${quiet ? "text-kit-ink-disabled" : "text-kit-ink-muted"}`} style={{ width: NAME }}>
        {label}
      </span>
      <div className="relative h-full" style={{ width: inner }}>
        {body}
      </div>
    </div>
  )

  return (
    <div className="relative select-none" style={{ width }}>
      {lane(
        "",
        18,
        <>
          {labels.map((l) => (
            <span key={l.id} className="absolute top-0 -translate-x-1/2 font-kit-mono text-kit-mono-sm whitespace-nowrap" style={{ left: l.x }}>
              {l.text}
            </span>
          ))}
          {ticks.map((t) => (
            <span key={t} className="absolute top-0 font-kit-mono text-kit-mono-sm text-kit-ink-muted tabular-nums" style={{ left: t * px }}>
              {fmtWhole(t)}
            </span>
          ))}
          <span className="absolute top-0 right-0 font-kit-mono text-kit-mono-sm tabular-nums">{fmt(total)}</span>
        </>,
      )}
      <div className="flex flex-col gap-1.5">
        {lanes.includes("clips")
          ? lane(
              name,
              CLIP_H,
              <>
                {items.map((it) => {
                  const w = it.dur * px
                  if (it.kind !== "speech") {
                    return (
                      <Target
                        key={it.id}
                        id={q(it.id)}
                        d={d}
                        tone={tone}
                        label={it.kind === "pause" ? `Pause, ${it.text}` : "The “um”"}
                        className="qc4-clip absolute inset-y-0 left-0 rounded-kit-chip bg-kit-well ring-1 ring-kit-ink-muted ring-inset"
                        style={{ translate: `${it.from * px}px 0`, width: Math.max(6, w) }}
                      />
                    )
                  }
                  const cw = w - 2
                  return (
                    <div
                      key={it.id}
                      aria-label={`Take 3, ${fmt(it.src[0])} to ${fmt(it.src[1])}`}
                      className="qc4-clip absolute inset-y-0 left-0 overflow-hidden rounded-kit-chip bg-kit-object shadow-kit-control"
                      style={{ translate: `${it.from * px + 1}px 0`, width: cw }}
                    >
                      <ClipFilm from={it.src[0]} to={it.src[1]} width={cw} />
                      {cw >= LABEL_MIN ? (
                        <span className="absolute top-1 left-1 rounded-kit-chip bg-kit-object/85 px-1 text-kit-meta font-kit-strong">Take 3</span>
                      ) : null}
                    </div>
                  )
                })}
                <Target
                  id={q("hook")}
                  d={d}
                  tone={tone}
                  className="qc4-clip absolute inset-y-0 left-0 rounded-kit-chip"
                  style={{ translate: `${hook.from * px}px 0`, width: (hook.to - hook.from) * px }}
                />
                {d.toolbar === q("hook") ? (
                  <div
                    className="qc4-toolbar absolute -top-9 z-10 flex rounded-kit-control bg-kit-object p-1 shadow-kit-lifted"
                    style={{ left: hook.from * px }}
                  >
                    <Target
                      id={zoomButton(q("hook"))}
                      d={d}
                      className="qc4-btn relative flex h-6 items-center rounded-kit-control-inner px-2 text-kit-meta font-kit-strong"
                    >
                      <span className="relative">Zoom</span>
                    </Target>
                  </div>
                ) : null}
              </>,
            )
          : null}
        {lanes.includes("captions")
          ? lane(
              "Captions",
              24,
              cut.captions ? (
                <Target id={q("captions")} d={d} tone={tone} className="absolute inset-0 rounded-kit-chip">
                  {chips.map((c, i) => (
                    <span
                      key={c.id}
                      data-wave={q("captions")}
                      data-q={i === chips.length - 1 ? q("captions-end") : undefined}
                      className="qc4-wave absolute inset-y-0 left-0 truncate rounded-kit-chip bg-kit-well px-1 text-kit-meta leading-[24px] text-kit-ink-muted"
                      style={{ translate: `${c.span.from * px + 1}px 0`, width: Math.max(2, (c.span.to - c.span.from) * px - 2), animationDelay: `${i * stagger}ms` }}
                    >
                      {c.text}
                    </span>
                  ))}
                </Target>
              ) : (
                <Target
                  id={q("captions")}
                  d={d}
                  className="qc4-btn absolute inset-y-0 left-0 flex items-center rounded-kit-chip bg-kit-control px-2 text-kit-meta shadow-kit-control"
                >
                  <span className="relative">+ Captions from the transcript</span>
                </Target>
              ),
            )
          : null}
        {lanes.includes("effects")
          ? lane(
              "Effects",
              24,
              cut.zoom ? (
                <span
                  className="qc4-wave absolute inset-y-0 left-0 rounded-kit-chip bg-kit-primary px-1.5 text-kit-meta leading-[24px] font-kit-strong whitespace-nowrap text-kit-primary-on"
                  style={{ translate: `${hook.from * px}px 0`, width: (HOOK.end - HOOK.at) * px }}
                >
                  Zoom 1.3×
                </span>
              ) : null,
              !cut.zoom,
            )
          : null}
      </div>
      {playhead != null ? (
        <span aria-hidden className="pointer-events-none absolute top-0 bottom-0 w-px bg-kit-ink" style={{ left: NAME + playhead * px }} />
      ) : null}
    </div>
  )
}

"use client"

import { useLayoutEffect, useRef, useState } from "react"
import { CutSpines } from "@/components/editor/cut-spines"
import { cursorAt, type Beat } from "./cursor-run"
import { FilmCursors } from "./film-cursor"
import { STRIP, type Wave } from "./take"
import { MEDIA, sceneOf } from "./three-scenes"
import { CUTS, spanAt } from "./three-run"

// The timeline holding three cuts: the editor's own CutSpines, fed a scene per cut rebuilt every frame, and a
// cursor per cut. Targets are measured from the spines' own nodes (layout offsets, so a row still swinging in
// measures where it will rest), in desk px.

type Box = { x: number; y: number; w: number; h: number }
type Targets = { lane: Box; frame: Box }

function offset(node: HTMLElement, root: HTMLElement): Box {
  let x = 0
  let y = 0
  for (let n: HTMLElement | null = node; n && n !== root; n = n.offsetParent as HTMLElement | null) {
    x += n.offsetLeft
    y += n.offsetTop
  }
  return { x, y, w: node.offsetWidth, h: node.offsetHeight }
}

export function ThreeCuts({ t, wave, recommended, rowStyle }: { t: number; wave: Wave | null; recommended: boolean; rowStyle: (i: number) => string }) {
  const root = useRef<HTMLDivElement>(null)
  const [targets, setTargets] = useState<Targets[] | null>(null)
  useLayoutEffect(() => {
    const el = root.current
    const desk = el?.closest<HTMLElement>("[data-desk]")
    if (!el || !desk || targets) return
    const found = CUTS.map((c) => {
      const lane = el.querySelector<HTMLElement>(`[data-cut-scene="${c.id}"] [data-lane-kind="video"]`)
      const frame = el.querySelector<HTMLElement>(`[data-cut-scene="${c.id}"] [data-target="control:frame"]`)
      return lane && frame && lane.offsetWidth > 0 ? { lane: offset(lane, desk), frame: offset(frame, desk) } : null
    })
    if (found.every(Boolean)) setTargets(found as Targets[])
  })

  const lanes = targets
    ? CUTS.map((cut, i) => {
        const { lane, frame } = targets[i]!
        const beats: Beat[] = cut.beats.map((b) => {
          const w = b.work
          const span = spanAt(cut, b.glideAt)
          const at = (s: number) => lane.x + (s / span) * lane.w
          const base = { glideAt: b.glideAt, glideDur: b.glideDur, dragAt: b.dragAt, dragDur: b.dragDur, pressAt: b.pressAt }
          if (w.kind === "tap") {
            const box = w.target === "frame" ? frame : w.target === "start" ? { x: lane.x + 2, y: lane.y, w: 14, h: lane.h } : { x: lane.x + lane.w * 0.3, y: lane.y + lane.h + 2, w: 40, h: 12 }
            return { ...base, tap: true, rect: { x0: box.x, x1: box.x + box.w, top: box.y, height: box.h } }
          }
          const rect = { x0: at(w.from), x1: at(w.to) - 2, top: lane.y + 2, height: lane.h - 4 }
          return { ...base, rect, toolbar: w.kind === "zoom" ? { x: (rect.x0 + rect.x1) / 2, y: rect.top - 20 } : undefined }
        })
        const first = cut.beats[0]!
        const state = cursorAt(t, beats, { from: { x: lane.x + lane.w * 0.55, y: lane.y - 36 }, appearAt: first.glideAt - 160, parkAt: cut.doneAt + 300 })
        return { key: cut.id, label: cut.lane.label, support: cut.lane.support, state }
      })
    : []

  return (
    <div ref={root}>
      <CutSpines
        cuts={CUTS.map((c) => ({ sceneId: c.id, letter: c.letter, name: c.name, where: c.where }))}
        scenes={CUTS.map((c) => sceneOf(c, t))}
        recommendedId={recommended ? "cut-a" : null}
        onOpen={() => {}}
        filmstrips={{ [MEDIA]: STRIP }}
        seekIndex={wave}
      />
      {/* CutSpines owns its rows; each swings in through a scoped rule. */}
      <style>{CUTS.map((c, i) => `[data-cut-scene="${c.id}"]{${rowStyle(i)}}`).join("")}</style>
      <FilmCursors lanes={lanes} />
    </div>
  )
}

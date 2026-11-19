"use client"

import { useLayoutEffect, useRef, useState } from "react"
import { ClipFace } from "@/components/editor/studio-parts"
import { cursorAt } from "./cursor-run"
import { FilmCursors } from "./film-cursor"
import { MAIN_APPEAR, MAIN_PARK, mainBeats, piecesAt, scaleAt } from "./main-run"
import { easeOutExpo, progress } from "./motion"
import { pop } from "./parts"
import { CAPTIONS, KEPT, STRIP, type Wave } from "./take"

// The main lane: the take as the editor draws a clip (ClipFace: frames over its own waveform), cut into the
// pieces the run leaves, with Quincy's cursor doing the cutting. Above it, the caption lane.

const CAP_H = 22
const GAP = 8
const CLIP_H = 60

/** Where a source second sits on a lane `w` wide once the pauses are out (kept clips end to end, 2 px apart). */
function cutPx(t: number, w: number, s: number) {
  const k = scaleAt(t, w)
  let x = 0
  for (const [a, b] of KEPT) {
    if (s <= b) return x + Math.max(0, s - a) * k
    x += (b - a) * k + 2
  }
  return x
}

export function MainLane({ t, wave, dropAt, captionsAt }: { t: number; wave: Wave | null; dropAt: number; captionsAt: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<{ x: number; y: number; w: number } | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    const desk = el?.closest<HTMLElement>("[data-desk]")
    if (!el || !desk || box) return
    let x = 0
    let y = 0
    for (let n: HTMLElement | null = el; n && n !== desk; n = n.offsetParent as HTMLElement | null) {
      x += n.offsetLeft
      y += n.offsetTop
    }
    if (el.offsetWidth > 0) setBox({ x, y, w: el.offsetWidth })
  })
  const w = box?.w ?? 0
  const open = easeOutExpo(progress(t, dropAt, 520))
  const beats = box ? mainBeats({ x0: box.x, x1: box.x + w, top: box.y + CAP_H + GAP, height: CLIP_H }) : []
  const state = cursorAt(t, beats, { from: { x: (box?.x ?? 0) + w * 0.7, y: (box?.y ?? 0) - 60 }, appearAt: MAIN_APPEAR, parkAt: MAIN_PARK })
  return (
    <>
    <div ref={ref} data-film-region="main-lane" className="relative w-full" style={{ height: CAP_H + GAP + CLIP_H }}>
      <div className="absolute inset-x-0 top-0" style={{ height: CAP_H }}>
        {w > 0 &&
          CAPTIONS.map((c, i) => {
            const at = captionsAt + i * 110
            if (t < at) return null
            const x = cutPx(t, w, c.from)
            return (
              <span
                key={c.from}
                className="absolute inset-y-0 flex items-center overflow-hidden rounded-[6px] bg-kit-primary px-1.5 text-[10px] leading-none font-kit-strong whitespace-nowrap text-kit-primary-on"
                style={{ left: x, width: Math.max(8, cutPx(t, w, c.to) - x - 2), transformOrigin: "left center", ...pop(t, at, { from: 0.6 }) }}
              >
                {c.text}
              </span>
            )
          })}
      </div>
      <div className="absolute left-0 overflow-hidden rounded-kit-chip" style={{ top: CAP_H + GAP, width: w * open, height: CLIP_H, opacity: Math.min(1, progress(t, dropAt, 80)) }}>
        {w > 0 &&
          piecesAt(t, w).map((p) =>
            p.w < 0.5 ? null : (
              <div
                key={p.from}
                className="absolute inset-y-0 overflow-hidden bg-kit-object shadow-kit-control"
                style={{ left: p.x, width: p.w, opacity: p.opacity, borderRadius: p.pause ? 0 : "var(--radius-kit-chip)" }}
              >
                <ClipFace strip={STRIP} wave={wave} trimStartUs={p.from * 1e6} trimEndUs={p.to * 1e6} widthPx={Math.round(p.w)} />
              </div>
            )
          )}
      </div>
    </div>
    {/* Outside the lane's own box: the cursor layer spans the whole desk, in desk px. */}
    {box && <FilmCursors lanes={[{ key: "main", label: "Quincy", support: false, state }]} />}
    </>
  )
}

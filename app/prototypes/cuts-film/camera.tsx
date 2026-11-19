"use client"

import { useLayoutEffect, useRef } from "react"
import { BACK_TO_SPINES, FOLD_AT, LOOK_AT, RECOMMEND_AT, SAY_AT } from "./chat-times"
import { DESK_H, DESK_W, Desk } from "./desk"
import { RUN_DONE } from "./main-run"
import { blur, easeIn, lerp, progress } from "./motion"
import { STAGE } from "./stage"
import { AT } from "./timeline"

// A virtual camera over the desk: eased moves (700 ms, ease-in-out cubic) to fit a region, holds between.
// Regions are the desk's own nodes ([data-film-region], the timeline card, the chat margin), measured every frame
// in desk px (layout offsets, so the camera's own transform never feeds back). Scaling is a transform on the
// whole desk, so text re-rasterises at its final size and stays crisp.

type Region = "full" | "composer" | "lanes" | "cut" | "receipt" | "thread" | "latest"
const KEYS: { at: number; region: Region }[] = [
  { at: 0, region: "full" },
  { at: AT.ask + 100, region: "composer" },
  { at: AT.cut + 120, region: "cut" },
  { at: FOLD_AT - 80, region: "receipt" },
  { at: AT.check + 80, region: "full" },
  { at: LOOK_AT - 100, region: "thread" },
  { at: AT.three + 80, region: "lanes" },
  { at: SAY_AT - 300, region: "latest" },
  { at: BACK_TO_SPINES, region: "lanes" },
  { at: RECOMMEND_AT + 500, region: "full" },
]
const MOVE = 700
const cubic = (p: number) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2)
const PAD = 24
const MAX = 2.1
/** The caption card's band along the bottom of the frame (scenes/caption.tsx). */
const CAPTION_BAND = 128

type Box = { x: number; y: number; w: number; h: number }

function offsetBox(node: HTMLElement, desk: HTMLElement): Box {
  let x = 0
  let y = 0
  for (let n: HTMLElement | null = node; n && n !== desk; n = n.offsetParent as HTMLElement | null) {
    x += n.offsetLeft
    y += n.offsetTop
  }
  return { x, y, w: node.offsetWidth, h: node.offsetHeight }
}

function regionBox(desk: HTMLElement, region: Region): Box {
  const full = { x: 0, y: 0, w: DESK_W, h: DESK_H }
  const q = (sel: string) => desk.querySelector<HTMLElement>(sel)
  // The thread scrolls by a transform the chat writes (data-scroll); offsets ignore it, so subtract it here.
  const scroll = Number(q("[data-film-scroll]")?.dataset.filmScroll ?? 0)
  const at = (sel: string) => {
    const n = q(sel)
    return n ? offsetBox(n, desk) : null
  }
  if (region === "full") return full
  // The pauses going: the take in the preview and the main lane under it, together (the face reacts to the cut).
  if (region === "cut") {
    const p = at('[data-film-region="preview"]')
    const s = at('section[aria-label="Timeline"]')
    const l = at('[data-film-region="main-lane"]')
    if (!p || !s || !l) return full
    const x0 = Math.min(p.x, l.x)
    const x1 = Math.max(p.x + p.w, l.x + l.w)
    // The lane spans the timeline, so the union is wide; the preview's top 15 % (above the head) is left out to
    // keep the scale up (~1.1) with the caption band still clear.
    const top = p.y + p.h * 0.15
    return { x: x0, y: top, w: x1 - x0, h: l.y + l.h + 8 - top }
  }
  if (region === "lanes") return at('section[aria-label="Timeline"]') ?? full
  if (region === "thread") return at('[data-film-region="thread"]') ?? full
  if (region === "composer") {
    const c = at('[data-film-region="composer"]')
    // Wider than the composer: the take in the preview sits beside the words being typed, not an empty lane.
    const p = at('[data-film-region="preview"]')
    return c && p ? { x: p.x - 20, y: c.y - 330, w: c.x + c.w - p.x + 20, h: c.h + 330 } : full
  }
  if (region === "receipt") {
    const r = at('[data-film-region="receipt"]')
    // Wide enough to take the preview in: the receipt beside the take it describes, not an empty recess.
    const p = at('[data-film-region="preview"]')
    return r && p ? { x: p.x - 20, y: r.y - scroll - 140, w: r.x + r.w + 8 - p.x + 20, h: 300 } : full
  }
  const three = at('[data-film-region="three"]')
  const say = at('[data-film-region="say"]')
  if (!three) return full
  const bottom = say ? say.y + say.h : three.y + three.h + 80
  return { x: three.x - 8, y: three.y - scroll - 16, w: three.w + 16, h: bottom - three.y + 32 }
}

/** The scale and offset that fit `b`, never showing past the desk's edges (the desk is 16:9, like the stage). */
function fit(b: Box) {
  const full = b.w >= DESK_W
  const pad = full ? 0 : PAD
  // A close-up keeps the bottom band free for the caption card: it fits into the frame above it.
  const room = full ? STAGE.height : STAGE.height - CAPTION_BAND
  const k = Math.max(STAGE.width / DESK_W, Math.min(MAX, STAGE.width / (b.w + pad * 2), room / (b.h + pad * 2)))
  const clamp = (v: number, lo: number) => Math.min(0, Math.max(lo, v))
  return {
    k,
    x: clamp(STAGE.width / 2 - (b.x + b.w / 2) * k, STAGE.width - DESK_W * k),
    // Below the desk is the same white ground, so a close-up may lift the desk's bottom edge into the band.
    y: clamp(room / 2 - (b.y + b.h / 2) * k, room - DESK_H * k),
  }
}

export function Camera({ t }: { t: number }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    const desk = el?.querySelector<HTMLElement>("[data-desk]")
    if (!el || !desk) return
    const i = Math.max(0, KEYS.filter((k) => k.at <= t).length - 1)
    const from = fit(regionBox(desk, KEYS[Math.max(0, i - 1)]!.region))
    const to = fit(regionBox(desk, KEYS[i]!.region))
    const p = i === 0 ? 1 : cubic(progress(t, KEYS[i]!.at, MOVE))
    const k = lerp(from.k, to.k, p)
    el.style.transform = `translate(${lerp(from.x, to.x, p).toFixed(2)}px, ${lerp(from.y, to.y, p).toFixed(2)}px) scale(${k.toFixed(4)})`
  })
  if (t > AT.end + 200) return null
  // The desk leaves as the end card's push-through begins: it rushes past the camera and clears in 280 ms.
  const out = easeIn(progress(t, AT.end - 230, 280))
  return (
    <div className="absolute inset-0 origin-center" style={out > 0 ? { opacity: Math.max(0, 1 - out * 1.8), scale: lerp(1, 1.45, out).toFixed(4), filter: blur(out * 10) } : undefined}>
      <div ref={ref} className="absolute top-0 left-0 origin-top-left">
        <Desk t={t} />
      </div>
    </div>
  )
}

export { RUN_DONE }

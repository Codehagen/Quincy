"use client"

import { useLayoutEffect, useMemo, useRef } from "react"
import { AgentCursors } from "@/components/editor/agent-cursor/agent-cursor"
import { ECHO_COUNT, type Director } from "@/components/editor/agent-cursor/director"
import type { CursorState } from "./cursor-run"

// The editor's own cursor markup (AgentCursors), driven by the film's clock instead of the director's timers.
// The director normally writes translate and data attributes to these nodes; here a layout effect writes the
// same things from `t`, so a frame is a pure function of time. The stage kills the CSS transitions and keyframes,
// so the tap, the ring, the selection's growth and the hit wash are written per frame too.

type Nodes = { mark?: HTMLDivElement | null; toolbar?: HTMLDivElement | null; cursor?: HTMLDivElement | null }

export type FilmLane = { key: string; label: string; support: boolean; state: CursorState }

const flag = (node: Element | null | undefined, attr: string, on: boolean) => (on ? node?.setAttribute(attr, "") : node?.removeAttribute(attr))

export function FilmCursors({ lanes }: { lanes: FilmLane[] }) {
  const nodes = useRef(new Map<string, Nodes>())
  const keys = lanes.map((l) => `${l.key}|${l.label}|${l.support}`).join(",")
  const director = useMemo(() => {
    const at = (key: string) => {
      if (!nodes.current.has(key)) nodes.current.set(key, {})
      return nodes.current.get(key)!
    }
    return {
      reduced: false,
      lanes: keys.split(",").map((k) => {
        const [key, label, support] = k.split("|") as [string, string, string]
        return {
          key,
          label,
          support: support === "true",
          attachMark: (n: HTMLDivElement | null) => void (at(key).mark = n),
          attachToolbar: (n: HTMLDivElement | null) => void (at(key).toolbar = n),
          attachCursor: (n: HTMLDivElement | null) => void (at(key).cursor = n),
          attachEchoes: Array.from({ length: ECHO_COUNT }, () => () => {}),
        }
      }),
    } as unknown as Director
  }, [keys])

  useLayoutEffect(() => {
    for (const lane of lanes) {
      const n = nodes.current.get(lane.key)
      const s = lane.state
      const c = n?.cursor
      if (c) {
        c.style.translate = `${s.x.toFixed(2)}px ${s.y.toFixed(2)}px`
        flag(c, "data-shown", s.shown > 0)
        c.style.opacity = String((lane.support ? 0.7 : 1) * s.shown)
        flag(c, "data-cap", s.cap)
        const arrow = c.querySelector<HTMLElement>(".agent-arrow")
        const ring = c.querySelector<HTMLElement>(".agent-ring")
        const p = s.tap
        if (arrow) arrow.style.scale = p >= 0 && p < 0.41 ? String(1 - 0.08 * Math.sin((p / 0.41) * Math.PI)) : ""
        if (ring) {
          ring.style.opacity = p >= 0 ? String(0.9 * (1 - p)) : "0"
          ring.style.scale = p >= 0 ? String(0.6 + 0.8 * (1 - (1 - p) ** 3)) : ""
        }
      }
      const bar = n?.toolbar
      if (bar) {
        if (s.toolbar) bar.style.translate = `${(s.toolbar.x - 28).toFixed(1)}px ${(s.toolbar.y - 16).toFixed(1)}px`
        flag(bar, "data-shown", !!s.toolbar?.shown)
        bar.style.opacity = s.toolbar?.shown ? "1" : "0"
      }
      const m = n?.mark
      if (m) {
        const r = s.mark?.rect
        if (r) {
          m.style.translate = `${r.x0}px ${r.top}px`
          m.style.width = `${Math.max(4, r.x1 - r.x0)}px`
          m.style.height = `${r.height}px`
        }
        flag(m, "data-shown", !!s.mark?.shown)
        flag(m, "data-hover", !!s.mark?.hover)
        const sel = m.querySelector<HTMLElement>(".agent-mark-sel")
        const hot = m.querySelector<HTMLElement>(".agent-mark-hot")
        if (sel) {
          sel.style.scale = `${s.mark?.sel ?? 0} 1`
          sel.style.opacity = s.mark && s.mark.sel > 0 ? "1" : "0"
        }
        if (hot) hot.style.opacity = String(s.mark?.hot ?? 0)
      }
    }
  })

  return <AgentCursors director={director} />
}

"use client"

/*
 * Quincy's cursor: a picture of the op stream.
 *
 * The contract, for building it for real: every edit is a tool part whose
 * input carries a `target` (the `data-q` of the element it acts on). The
 * cursor reads the stream. A part entering `input-available` makes it glide
 * to that target; the same part reaching `output-available` is the press,
 * at the moment the target changes. A press that is not an op cannot be
 * drawn, because the cursor has nothing else to read.
 *
 * Positions are measured from the DOM at the moment of each glide, never
 * hardcoded, so when an earlier op moves the lanes the next glide goes to
 * where the target now is. The cursor writes its own position to its style
 * (no state, no re-render per frame).
 *
 * The person's own pointer stays theirs: this is a drawn layer with
 * `pointer-events: none`. Under reduced motion it is not drawn at all; the
 * targets still change in order with a brief highlight.
 *
 * Lab-local on purpose (round 2), shaped so it could move into the kit.
 */

import * as React from "react"

import { useReducedMotion } from "@/components/kit"
import { PixelFriend } from "@/components/mascot"

import "./cursor.css"

export const GLIDE = 170

/** Where a target sits inside `root`, in the root's own (unscaled) pixels. */
export function measure(root: HTMLElement, id: string) {
  const t = root.querySelector<HTMLElement>(`[data-q="${CSS.escape(id)}"]`)
  if (!t) return null
  const r = root.getBoundingClientRect()
  const s = r.width / root.offsetWidth || 1
  const b = t.getBoundingClientRect()
  const x = b.width > 160 ? b.left + 36 * s : b.left + b.width / 2
  return { x: (x - r.left) / s, y: (b.top + b.height / 2 - r.top) / s }
}

/** Props that make an element a target: its id, and the flash when an op lands on it. */
export function target(hot: string | null | undefined, id: string, tone?: "ink" | "highlight" | "well") {
  return {
    "data-q": id,
    "data-hot": hot === id || undefined,
    "data-tone": tone,
  } as const
}

export type CursorLook = "tag" | "friend" | "dot" | "say"

export type AgentCursorProps = {
  root: React.RefObject<HTMLElement | null>
  /** The target it is on or heading to; `park` when the run has ended. */
  aim: string | null
  /** Changes on every landed op: each new key is one press. */
  pressKey?: string | null
  look?: CursorLook
  label?: string
  /** The words in the tag for `look="say"`: the op in progress. */
  say?: string
  working?: boolean
  glide?: number
  ring?: "line" | "soft"
}

/**
 * The drawn cursor. Ink, never the pen blue. `tag` carries Quincy's name,
 * `friend` the pixel friend, `dot` is a pressed point with a small name,
 * `say` puts the op in progress in the tag.
 */
export function AgentCursor({
  root,
  aim,
  pressKey,
  look = "tag",
  label = "Quincy",
  say,
  working = false,
  glide = GLIDE,
  ring = "line",
}: AgentCursorProps) {
  const reduced = useReducedMotion()
  const el = React.useRef<HTMLDivElement>(null)
  const placed = React.useRef(false)

  React.useLayoutEffect(() => {
    const node = el.current
    const box = root.current
    if (!node || !box || !aim) return
    const p = measure(box, aim)
    if (!p) return
    if (!placed.current) {
      // The first placement appears where it is; only later moves glide.
      node.style.transitionDuration = "0ms"
      node.style.translate = `${p.x}px ${p.y}px`
      void node.offsetWidth
      node.style.transitionDuration = ""
      placed.current = true
    } else {
      node.style.translate = `${p.x}px ${p.y}px`
    }
    node.style.opacity = ""
  }, [aim, root])

  if (reduced) return null
  return (
    <div
      ref={el}
      aria-hidden
      className="qc-cursor"
      data-parked={aim === "park" || undefined}
      style={{ opacity: 0, ["--qc-glide" as string]: `${glide}ms` }}
    >
      {pressKey ? <span key={`r-${pressKey}`} className="qc-ring" data-tone={ring} /> : null}
      <span key={`p-${pressKey ?? "rest"}`} className={pressKey ? "qc-press qc-tap" : "qc-press"}>
        {look === "dot" ? (
          <span className="absolute -top-[7px] -left-[7px] size-3.5 rounded-full border-2 border-kit-object bg-kit-ink shadow-kit-control" />
        ) : (
          <svg width="18" height="23" viewBox="0 0 22 28" className="absolute -top-0.5 -left-0.5 drop-shadow-sm">
            <path
              d="M2 1.5v21.2l5.3-5.1 3.4 8 3.7-1.6-3.4-7.8H18L2 1.5Z"
              className="fill-kit-ink stroke-kit-object"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      {look === "tag" || look === "say" ? (
        <span className="absolute top-[18px] left-3 flex h-[22px] items-center rounded-full bg-kit-primary px-2 text-kit-meta font-kit-strong whitespace-nowrap text-kit-primary-on shadow-kit-control">
          {look === "say" && say ? say : label}
        </span>
      ) : null}
      {look === "friend" ? (
        <span className="absolute top-[16px] left-3 grid size-[26px] place-items-center rounded-full bg-kit-object shadow-kit-lifted">
          <PixelFriend size={16} state={working ? "writing" : "idle"} />
        </span>
      ) : null}
      {look === "dot" ? (
        <span className="absolute top-2 left-3 text-kit-meta font-kit-strong whitespace-nowrap">{label}</span>
      ) : null}
    </div>
  )
}

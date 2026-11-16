"use client"

import * as React from "react"

import { inter } from "../../fonts"
import { INK, PAPER, type MarkRender, type Tone } from "../sheet"

/**
 * The wordmark sheet: "Quincy" set beside the mark in Inter 560, at two
 * sizes (mark 32 with 28px type, mark 16 with 14px type: the same 7:8
 * ratio), on light and on dark, plus the small one where it lives, in a
 * sidebar header. Same 560×420 fixed frame as `IconSheet`, so sizes are real.
 */
const STAGE = "#F2F2F1"
const MUTED = "#6C6C6B"
const DARK_MUTED = "#A4A4A4"
const DARK_OBJECT = "#1E1E1D"
const MONO =
  'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace'

const W = 560
const H = 420

const caption: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 10,
  lineHeight: "12px",
}

function Lockup({
  mark,
  tone,
  size,
}: {
  mark: MarkRender
  tone: Tone
  size: 32 | 16
}) {
  const big = size === 32
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: big ? 10 : 6,
        color: tone === "dark" ? STAGE : INK,
      }}
    >
      <span style={{ display: "flex" }}>{mark(size, tone)}</span>
      <span
        style={{
          fontSize: big ? 28 : 14,
          lineHeight: 1,
          fontWeight: 560,
          letterSpacing: big ? "-0.02em" : "-0.006em",
        }}
      >
        Quincy
      </span>
    </span>
  )
}

function Panel({ tone, top, mark }: { tone: Tone; top: number; mark: MarkRender }) {
  const dark = tone === "dark"
  return (
    <div
      style={{
        position: "absolute",
        left: 24,
        top,
        width: 512,
        height: 112,
        borderRadius: 16,
        background: dark ? INK : PAPER,
        boxShadow: dark
          ? undefined
          : "0 0 0 1px rgba(17,17,16,0.06), 0 1px 2px rgba(17,17,16,0.04), 0 10px 28px -10px rgba(17,17,16,0.12)",
        display: "flex",
        alignItems: "center",
        gap: 48,
        padding: "0 32px",
      }}
    >
      <Lockup mark={mark} tone={tone} size={32} />
      <Lockup mark={mark} tone={tone} size={16} />
      <span
        style={{
          ...caption,
          position: "absolute",
          left: 14,
          top: 10,
          color: dark ? DARK_MUTED : MUTED,
        }}
      >
        {tone} · 32/28 · 16/14
      </span>
    </div>
  )
}

/** The small lockup in place: a sidebar header with two rows under it. */
function Sidebar({ tone, left, mark }: { tone: Tone; left: number; mark: MarkRender }) {
  const dark = tone === "dark"
  const row = dark ? "rgba(255,255,255,0.10)" : "rgba(17,17,16,0.07)"
  return (
    <div
      style={{
        position: "absolute",
        left,
        top: 300,
        width: 248,
        height: 96,
        borderRadius: 12,
        overflow: "hidden",
        background: dark ? DARK_OBJECT : "#FFFFFF",
        boxShadow: dark
          ? "0 0 0 1px rgba(255,255,255,0.08)"
          : "0 0 0 1px rgba(17,17,16,0.06)",
        padding: "14px 14px 0",
      }}
    >
      <Lockup mark={mark} tone={tone} size={16} />
      <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
        {[120, 88].map((w) => (
          <span
            key={w}
            style={{ display: "block", width: w, height: 8, borderRadius: 4, background: row }}
          />
        ))}
      </div>
    </div>
  )
}

export function LockupSheet({ mark, name }: { mark: MarkRender; name: string }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [scale, setScale] = React.useState(1)

  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setScale(Math.min(1, width / W, height / H))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={inter.className}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: STAGE,
        color: INK,
        display: "grid",
        placeItems: "center",
        fontSize: 13,
        lineHeight: "18px",
        fontWeight: 460,
        letterSpacing: "-0.006em",
        WebkitFontSmoothing: "antialiased",
      }}
    >
      <div
        style={{
          position: "relative",
          width: W,
          height: H,
          flexShrink: 0,
          transform: scale < 1 ? `scale(${scale})` : undefined,
        }}
      >
        <p style={{ position: "absolute", left: 24, top: 20, margin: 0, fontWeight: 560 }}>
          {name}
        </p>
        <p
          style={{
            ...caption,
            position: "absolute",
            right: 24,
            top: 23,
            margin: 0,
            color: MUTED,
          }}
        >
          lockup · Inter 560
        </p>
        <Panel tone="light" top={52} mark={mark} />
        <Panel tone="dark" top={176} mark={mark} />
        <Sidebar tone="light" left={24} mark={mark} />
        <Sidebar tone="dark" left={288} mark={mark} />
      </div>
    </div>
  )
}

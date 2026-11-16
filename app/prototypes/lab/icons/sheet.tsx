"use client"

import * as React from "react"

import { inter } from "../fonts"

/**
 * The spec sheet every icon piece stands on: the mark large, at 32 and 16px
 * actual size on light and dark, inside a browser tab, and as an app icon.
 *
 * Every mark is drawn on a 16-unit grid (`viewBox="0 0 16 16"`), so the 16px
 * favicon is 1:1 with the pixel grid and 32 is exactly 2×. The sheet is laid
 * out in fixed pixels at 560×420 so those sizes stay real; it only scales down
 * when the frame is narrower than that (a phone), never up.
 *
 * Colours are the kit's primitives as values, because a lab piece inherits no
 * app token (lab/README.md). A mark uses `currentColor` for ink, plus at most
 * one accent: BLUE (action and pen) or YELLOW (the highlighter).
 */

export type Tone = "light" | "dark"
export type MarkRender = (size: number, tone: Tone) => React.ReactNode

export const INK = "#111110" // --kit-gray-178
export const PAPER = "#FDFDFC" // --kit-gray-994
const STAGE = "#F2F2F1" // --kit-gray-961
const MUTED = "#6C6C6B" // --kit-gray-530
const DARK_OBJECT = "#1E1E1D" // --kit-gray-235
const DARK_STAGE = "#0C0C0C" // --kit-gray-155
const DARK_MUTED = "#A4A4A4" // --kit-gray-720

/** One blue: --kit-blue-540 on light, --kit-blue-720 on dark. */
export const BLUE: Record<Tone, string> = { light: "#3866D2", dark: "#7BA3F6" }
/** The highlighter: --kit-yellow-910. Same on both grounds. */
export const YELLOW = "#FDE24B"

const MONO =
  'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace'

const W = 560
const H = 420

const OBJECT: React.CSSProperties = {
  background: "#FFFFFF",
  borderRadius: 16,
  boxShadow:
    "0 0 0 1px rgba(17,17,16,0.06), 0 1px 2px rgba(17,17,16,0.04), 0 10px 28px -10px rgba(17,17,16,0.12)",
}

const caption: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 10,
  lineHeight: "12px",
  letterSpacing: 0,
}

export function IconSheet({
  mark,
  name,
  app = "ink",
}: {
  mark: MarkRender
  name: string
  /** The app icon's tile: ink with the mark in paper, or paper with it in ink. */
  app?: "ink" | "paper"
}) {
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
        {/* Header */}
        <p
          style={{
            position: "absolute",
            left: 24,
            top: 20,
            margin: 0,
            fontWeight: 560,
          }}
        >
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
          16-unit grid · 120 / 32 / 16
        </p>

        {/* The mark, large */}
        <div
          style={{
            ...OBJECT,
            position: "absolute",
            left: 24,
            top: 52,
            width: 236,
            height: 236,
            display: "grid",
            placeItems: "center",
            color: INK,
          }}
        >
          {mark(120, "light")}
          <span
            style={{
              ...caption,
              position: "absolute",
              left: 14,
              bottom: 12,
              color: MUTED,
            }}
          >
            120
          </span>
        </div>

        {/* Actual size on light and dark */}
        <SizeTile left={276} tone="light" mark={mark} />
        <SizeTile left={414} tone="dark" mark={mark} />

        {/* App icons */}
        <div
          style={{
            ...OBJECT,
            position: "absolute",
            left: 276,
            top: 176,
            width: 260,
            height: 112,
            display: "flex",
            alignItems: "center",
            gap: 20,
            padding: "0 20px",
          }}
        >
          <AppIcon tile={64} markSize={32} radius={15} mark={mark} app={app} />
          <AppIcon
            tile={64}
            markSize={32}
            radius={15}
            mark={mark}
            app={app === "ink" ? "paper" : "ink"}
          />
          <AppIcon tile={32} markSize={16} radius={8} mark={mark} app={app} />
          <span
            style={{
              ...caption,
              position: "absolute",
              left: 14,
              bottom: 10,
              color: MUTED,
            }}
          >
            app · 64 / 32
          </span>
        </div>

        {/* Browser tabs */}
        <BrowserTab left={24} tone="light" mark={mark} />
        <BrowserTab left={288} tone="dark" mark={mark} />
      </div>
    </div>
  )
}

function SizeTile({
  left,
  tone,
  mark,
}: {
  left: number
  tone: Tone
  mark: MarkRender
}) {
  const dark = tone === "dark"
  return (
    <div
      style={{
        ...(dark
          ? { background: INK, borderRadius: 16 }
          : { ...OBJECT, background: PAPER }),
        position: "absolute",
        left,
        top: 52,
        width: 122,
        height: 108,
        color: dark ? STAGE : INK,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        gap: 22,
        paddingBottom: 14,
      }}
    >
      {[32, 16].map((s) => (
        <div
          key={s}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div
            style={{
              height: 32,
              display: "flex",
              alignItems: "flex-end",
            }}
          >
            {mark(s, tone)}
          </div>
          <span style={{ ...caption, color: dark ? DARK_MUTED : MUTED }}>
            {s}
          </span>
        </div>
      ))}
      <span
        style={{
          ...caption,
          position: "absolute",
          left: 12,
          top: 10,
          color: dark ? DARK_MUTED : MUTED,
        }}
      >
        {tone}
      </span>
    </div>
  )
}

function AppIcon({
  tile,
  markSize,
  radius,
  mark,
  app,
}: {
  tile: number
  markSize: number
  radius: number
  mark: MarkRender
  app: "ink" | "paper"
}) {
  const ink = app === "ink"
  return (
    <div
      style={{
        width: tile,
        height: tile,
        borderRadius: radius,
        background: ink ? INK : "#FFFFFF",
        color: ink ? STAGE : INK,
        boxShadow: ink
          ? "0 1px 2px rgba(17,17,16,0.12), 0 6px 14px -6px rgba(17,17,16,0.4)"
          : "0 0 0 1px rgba(17,17,16,0.08), 0 1px 2px rgba(17,17,16,0.06), 0 6px 14px -6px rgba(17,17,16,0.18)",
        display: "grid",
        placeItems: "center",
        flexShrink: 0,
      }}
    >
      {mark(markSize, ink ? "dark" : "light")}
    </div>
  )
}

function BrowserTab({
  left,
  tone,
  mark,
}: {
  left: number
  tone: Tone
  mark: MarkRender
}) {
  const dark = tone === "dark"
  const bar = dark ? DARK_STAGE : "#E1E1E0"
  const tab = dark ? DARK_OBJECT : PAPER
  const text = dark ? STAGE : INK
  const muted = dark ? DARK_MUTED : MUTED
  return (
    <div
      style={{
        position: "absolute",
        left,
        top: 308,
        width: 248,
        height: 88,
        borderRadius: 12,
        overflow: "hidden",
        background: bar,
        boxShadow: dark
          ? "0 0 0 1px rgba(255,255,255,0.08)"
          : "0 0 0 1px rgba(17,17,16,0.06)",
        fontSize: 12,
        lineHeight: "16px",
      }}
    >
      {/* Window dots */}
      <div
        style={{
          position: "absolute",
          left: 12,
          top: 15,
          display: "flex",
          gap: 5,
        }}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: dark ? "rgba(255,255,255,0.16)" : "rgba(17,17,16,0.14)",
            }}
          />
        ))}
      </div>

      {/* The active tab */}
      <div
        style={{
          position: "absolute",
          left: 52,
          top: 6,
          width: 136,
          height: 32,
          borderRadius: "9px 9px 0 0",
          background: tab,
          color: text,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 10px",
        }}
      >
        <span style={{ display: "flex", width: 16, height: 16, color: text }}>
          {mark(16, tone)}
        </span>
        <span style={{ flex: 1, fontWeight: 460 }}>Quincy</span>
        <span aria-hidden style={{ color: muted, fontSize: 13 }}>
          ×
        </span>
      </div>

      {/* An inactive neighbour, so the favicon is read among others */}
      <div
        style={{
          position: "absolute",
          left: 194,
          top: 14,
          display: "flex",
          alignItems: "center",
          gap: 7,
          color: muted,
        }}
      >
        <span
          style={{
            width: 14,
            height: 14,
            borderRadius: 4,
            background: dark ? "rgba(255,255,255,0.18)" : "rgba(17,17,16,0.16)",
          }}
        />
        <span>Ma…</span>
      </div>

      {/* Toolbar */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 38,
          bottom: 0,
          background: tab,
        }}
      >
        <div
          style={{
            margin: "8px 12px",
            height: 26,
            borderRadius: 999,
            background: dark ? DARK_STAGE : STAGE,
            color: muted,
            display: "flex",
            alignItems: "center",
            padding: "0 12px",
            fontFamily: MONO,
            fontSize: 11,
          }}
        >
          /studio
        </div>
      </div>
    </div>
  )
}

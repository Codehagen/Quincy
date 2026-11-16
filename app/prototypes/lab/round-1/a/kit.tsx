import * as React from "react"

import { hand, inter, MONO } from "./fonts"

/**
 * The shared register for group "a": a quiet grey tile that owns the frame,
 * a bold lead sentence with a grey continuation, and white objects with a
 * hairline ring sitting low in the tile, cropped by its edge.
 *
 * Every size is in cqw so a piece reads the same at 560px and at 360px.
 * 1cqw ≈ 5.6px at 560 wide, so 2.5cqw is the 14px body.
 */

export const C = {
  page: "#FDFDFC",
  tile: "#F2F2F1",
  ink: "#111111",
  grey: "rgba(18,18,18,0.46)",
  faint: "rgba(18,18,18,0.3)",
  bar: "rgba(18,18,18,0.075)",
  hair: "rgba(18,18,18,0.08)",
  white: "#FFFFFF",
} as const

export const RING =
  "0 0 0 1px rgba(18,18,18,0.07), 0 1px 2px rgba(18,18,18,0.04), 0 10px 28px -10px rgba(18,18,18,0.12)"

export const BODY: React.CSSProperties = {
  fontSize: "2.5cqw",
  lineHeight: 1.43,
  fontWeight: 460,
  letterSpacing: "-0.0065em",
}

export const fontInter = inter.style.fontFamily
export const fontHand = hand.style.fontFamily
export const fontMono = MONO

export function Tile({
  children,
  dark = false,
  className = "",
  style,
}: {
  children: React.ReactNode
  dark?: boolean
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div className="@container relative h-full w-full overflow-hidden">
      <div
        className={`relative h-full w-full overflow-hidden ${className}`}
        style={{
          background: dark ? C.ink : C.tile,
          color: dark ? C.page : C.ink,
          fontFamily: fontInter,
          fontFeatureSettings: '"cv11", "ss01"',
          WebkitFontSmoothing: "antialiased",
          ...BODY,
          ...style,
        }}
      >
        {children}
      </div>
    </div>
  )
}

/** "**Bold lead.** Grey continuation." — the tile's only heading. */
export function Lead({
  bold,
  grey,
  dark = false,
}: {
  bold: string
  grey: string
  dark?: boolean
}) {
  return (
    <p className="absolute top-[5.4cqw] left-[5.4cqw] max-w-[62cqw]">
      <span style={{ fontWeight: 560 }}>{bold}</span>{" "}
      <span style={{ color: dark ? "rgba(253,253,252,0.5)" : C.grey }}>
        {grey}
      </span>
    </p>
  )
}

/** A grey rounded line standing in for secondary content. */
export function Bar({
  w,
  className = "",
}: {
  w: string
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={`block h-[1.25cqw] rounded-full ${className}`}
      style={{ width: w, background: C.bar }}
    />
  )
}

/** A hand-drawn bracket, opening toward the text on its left. */
export function Bracket({
  color,
  className = "",
  style,
}: {
  color: string
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <span aria-hidden className={`relative block ${className}`} style={style}>
    <svg
      viewBox="0 0 10 100"
      preserveAspectRatio="none"
      className="absolute inset-0 h-full w-full"
      style={{ overflow: "visible" }}
    >
      <path
        d="M1 1.5 C 5 1.5, 6 3, 6 8 L 6.4 44 C 6.5 48, 7.5 50, 10 50 C 7.5 50, 6.5 52, 6.4 56 L 6 92 C 6 97, 5 98.5, 1 98.5"
        fill="none"
        stroke={color}
        strokeWidth={1.3}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
    </span>
  )
}

/** True once the element has been on screen. Reduced motion is handled in CSS. */
export function useSeen<T extends Element>(): [React.RefObject<T | null>, boolean] {
  const ref = React.useRef<T>(null)
  const [seen, setSeen] = React.useState(false)
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setSeen(true)
          io.disconnect()
        }
      },
      { threshold: 0.4 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return [ref, seen]
}


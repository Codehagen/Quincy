import type * as React from "react"

import { caveat, inter } from "./fonts"

/**
 * Shared bones for the c group. Every size is written in "frame pixels"
 * (designed at 560 px wide) and emitted as container units, so a piece is one
 * picture that scales as a whole from 560×420 down to 360×270.
 */
export const px = (n: number) => `${(n / 5.6).toFixed(3)}cqw`

/** Text sizes keep a floor so the mobile frame stays readable. */
export const tx = (n: number) => `max(${(n * 0.62).toFixed(1)}px, ${px(n)})`

export const ink = "#111111"
export const grey = "rgba(18,18,18,0.48)"
export const faint = "rgba(18,18,18,0.3)"
export const ground = "#FDFDFC"
export const stage = "#F2F2F1"
export const skel = "rgba(18,18,18,0.08)"

/** White object on a stage: hairline ring plus a very soft lift. */
export const lift =
  "0 0 0 1px rgba(17,17,17,0.06), 0 1px 2px rgba(17,17,17,0.04), 0 10px 28px -10px rgba(17,17,17,0.12)"

export const mono =
  'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace'

/** The 4:3 frame. Owns its ground and sets the container the units read. */
export function Frame({
  children,
  pad = 10,
}: {
  children: React.ReactNode
  pad?: number
}) {
  return (
    <div
      className={`${inter.className} size-full antialiased`}
      style={{
        containerType: "size",
        background: ground,
        color: ink,
        letterSpacing: "-0.006em",
        fontWeight: 460,
      }}
    >
      <div
        className="size-full"
        style={{ padding: px(pad), boxSizing: "border-box" }}
      >
        {children}
      </div>
    </div>
  )
}

/** A stage: quiet grey, big radius, no border, no shadow. Clips its object. */
export function Tile({
  children,
  dark = false,
  className = "",
  style,
}: {
  children?: React.ReactNode
  dark?: boolean
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{
        background: dark ? ink : stage,
        color: dark ? "#fff" : ink,
        borderRadius: px(18),
        ...style,
      }}
    >
      {children}
    </div>
  )
}

/** "**Bold lead.** Grey continuation." — the one copy pattern. */
export function Lead({
  bold,
  rest,
  dark = false,
  style,
}: {
  bold: string
  rest?: string
  dark?: boolean
  style?: React.CSSProperties
}) {
  return (
    <p
      style={{
        fontSize: tx(14),
        lineHeight: 20 / 14,
        margin: 0,
        textWrap: "pretty",
        ...style,
      }}
    >
      <span style={{ fontWeight: 580 }}>{bold}</span>
      {rest ? (
        <span style={{ color: dark ? "rgba(255,255,255,0.5)" : grey }}>
          {" "}
          {rest}
        </span>
      ) : null}
    </p>
  )
}

/** Grey rounded line standing in for secondary content. */
export function Skel({
  w,
  h = 7,
  style,
}: {
  w: number | string
  h?: number
  style?: React.CSSProperties
}) {
  return (
    <span
      aria-hidden
      className="block"
      style={{
        width: typeof w === "number" ? px(w) : w,
        height: px(h),
        borderRadius: px(h),
        background: skel,
        ...style,
      }}
    />
  )
}

/** Handwritten margin note. */
export function Pen({
  children,
  style,
}: {
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <span
      className={caveat.className}
      style={{
        fontSize: tx(19),
        lineHeight: 1,
        fontWeight: 500,
        color: "rgba(18,18,18,0.62)",
        letterSpacing: 0,
        ...style,
      }}
    >
      {children}
    </span>
  )
}

/** Initials in a neutral disc — no photos, no invented faces. */
export function Face({
  initials,
  size = 26,
  tone = 0,
  style,
}: {
  initials: string
  size?: number
  tone?: number
  style?: React.CSSProperties
}) {
  const tones = ["#E4E4E2", "#D9D9D6", "#CFCFCB", "#EAEAE8", "#DEDEDA"]
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center"
      style={{
        width: px(size),
        height: px(size),
        borderRadius: "50%",
        background: tones[tone % tones.length],
        fontSize: tx(size * 0.38),
        fontWeight: 560,
        color: "rgba(18,18,18,0.66)",
        boxShadow: `0 0 0 ${px(2)} #fff`,
        ...style,
      }}
    >
      {initials}
    </span>
  )
}

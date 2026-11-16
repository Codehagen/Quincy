"use client"

import * as React from "react"

import { inter } from "./fonts"

/**
 * The quiet grey stage every d-piece stands on. One em is the body size, and
 * the body size is a share of the frame's width (floored so 360px stays
 * legible), so a piece laid out in em scales with its frame.
 */

export const INK = "#111111"
export const GREY = "rgba(18,18,18,0.48)"
export const FAINT = "rgba(18,18,18,0.08)"
export const SKELETON = "rgba(18,18,18,0.07)"
export const MONO =
  'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace'

/** A white object on the stage: hairline ring, very soft lift. */
export const OBJECT: React.CSSProperties = {
  background: "#FFFFFF",
  borderRadius: "0.9em",
  boxShadow:
    "0 0 0 1px rgba(18,18,18,0.06), 0 1px 2px rgba(18,18,18,0.04), 0 6px 16px -4px rgba(18,18,18,0.06)",
}

export function Stage({
  lead,
  rest,
  children,
}: {
  lead: string
  rest: string
  children: React.ReactNode
}) {
  return (
    <div
      className="@container relative size-full overflow-hidden"
      style={{ background: "#F2F2F1", color: INK }}
    >
      <style>{stageCss}</style>
      <div
        className={`${inter.className} d-stage`}
        style={{
          position: "relative",
          height: "100%",
          fontSize: "max(10px, 2.5cqw)",
          lineHeight: 1.43,
          fontWeight: 460,
          letterSpacing: "-0.006em",
          fontFeatureSettings: '"cv11", "ss03"',
          WebkitFontSmoothing: "antialiased",
        }}
      >
        <p
          style={{
            position: "absolute",
            left: "1.7em",
            top: "1.5em",
            maxWidth: "23em",
            textWrap: "pretty",
          }}
        >
          <span style={{ fontWeight: 560 }}>{lead}</span>{" "}
          <span style={{ color: GREY }}>{rest}</span>
        </p>
        {children}
      </div>
    </div>
  )
}

/** Skeleton line: stands in for content the viewer does not need to read. */
export function Bar({
  w,
  h = "0.55em",
  style,
}: {
  w: string
  h?: string
  style?: React.CSSProperties
}) {
  return (
    <span
      aria-hidden
      style={{
        display: "block",
        width: w,
        height: h,
        borderRadius: 999,
        background: SKELETON,
        ...style,
      }}
    />
  )
}

const REDUCED = "(prefers-reduced-motion: reduce)"

function subscribeReduced(cb: () => void) {
  const mq = window.matchMedia(REDUCED)
  mq.addEventListener("change", cb)
  return () => mq.removeEventListener("change", cb)
}

/** Server and first client render agree on false; the real value follows. */
export function useReducedMotion() {
  return React.useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED).matches,
    () => false,
  )
}

/**
 * A number that counts to its new value instead of swapping. The count is the
 * cause made visible: the value changed because something just happened.
 */
export function Ticker({
  value,
  ms = 420,
  format = (n: number) => Math.round(n).toLocaleString("en-US"),
}: {
  value: number
  ms?: number
  format?: (n: number) => string
}) {
  const reduced = useReducedMotion()
  const [shown, setShown] = React.useState(value)
  const from = React.useRef(value)

  React.useEffect(() => {
    if (reduced) {
      from.current = value
      return
    }
    const start = performance.now()
    const a = from.current
    let raf = 0
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / ms)
      const e = 1 - Math.pow(1 - p, 3)
      const v = a + (value - a) * e
      from.current = v
      setShown(v)
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value, ms, reduced])

  return (
    <span style={{ fontVariantNumeric: "tabular-nums" }}>{format(reduced ? value : shown)}</span>
  )
}

const stageCss = `
.d-stage button { touch-action: manipulation; font: inherit; color: inherit; }
.d-press {
  transition: transform 140ms cubic-bezier(.2,.8,.3,1), background-color 160ms ease, color 160ms ease, box-shadow 160ms ease;
}
.d-press:active { transform: scale(0.97); }
.d-stage button:focus-visible { outline: 2px solid ${INK}; outline-offset: 2px; }
@keyframes d-rise {
  from { opacity: 0; transform: translateY(0.6em); }
  to   { opacity: 1; transform: none; }
}
.d-rise { animation: d-rise 260ms cubic-bezier(.2,.8,.3,1) both; }
@media (prefers-reduced-motion: reduce) {
  .d-press, .d-press:active { transition: none; transform: none; }
  .d-rise { animation: none; }
}
`

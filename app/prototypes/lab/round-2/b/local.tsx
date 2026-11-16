"use client"

import * as React from "react"

import { u } from "../kit"
import { color, MONO_STACK, motion, radius, type } from "../tokens"

/**
 * Group b's one local block, because the kit has no way to say "pick one of
 * these few values": a segmented choice (an hour, a window of time). It is a
 * radio group, so arrow keys move the choice and Tab leaves it.
 *
 * Candidate for the kit as `Choice`. The well is the stage showing through
 * (color.well); the chosen option is a small white object in it.
 */

const PAD = 3

const css = `
.r2b-seg {
  display: inline-flex; gap: ${u(2)}; padding: ${u(PAD)};
  background: ${color.well}; border-radius: ${u(radius.control)};
}
.r2b-seg-opt {
  position: relative;
  height: ${u(28)}; padding: 0 ${u(11)};
  border: 0; border-radius: ${u(radius.control - PAD)};
  background: transparent; color: ${color.muted};
  font-family: ${MONO_STACK}; font-size: ${u(type.mono.size)}; letter-spacing: 0;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition-property: background-color, box-shadow, color;
  transition-duration: ${motion.state}ms;
  transition-timing-function: ${motion.easeOut};
}
.r2b-seg-opt[aria-checked="true"] {
  background: ${color.surface}; color: ${color.ink};
  box-shadow: 0 0 0 1px ${color.hairline}, 0 1px 2px rgba(18, 18, 18, 0.06);
}
@media (hover: hover) {
  .r2b-seg-opt[aria-checked="false"]:hover { color: ${color.ink}; }
}
@media (pointer: coarse) {
  .r2b-seg-opt::after {
    content: ""; position: absolute; left: 0; right: 0; top: 50%;
    height: 44px; translate: 0 -50%;
  }
}
@media (prefers-reduced-motion: reduce) {
  .r2b-seg-opt { transition-duration: 0ms; }
}
`

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  label: string
}) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([])
  const index = options.findIndex((o) => o.value === value)

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0
    if (!step) return
    e.preventDefault()
    const next = (index + step + options.length) % options.length
    onChange(options[next]!.value)
    refs.current[next]?.focus()
  }

  return (
    <>
      <style href="lab-round-2-b-local" precedence="default">
        {css}
      </style>
      <div
        className="r2b-seg"
        role="radiogroup"
        aria-label={label}
        onKeyDown={onKeyDown}
      >
        {options.map((o, i) => (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            tabIndex={o.value === value ? 0 : -1}
            className="r2b-seg-opt"
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </>
  )
}

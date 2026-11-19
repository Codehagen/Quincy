"use client"

/*
 * Quincy's cursor for round 4. The director owns where it is (it writes
 * `translate` to this node); this draws what it is: an ink arrow, its tag,
 * the press (the arrow taps 1 → 0.92 → 1 in 90 ms), the ring and the ⌫ cap.
 * A support cursor (51's B and C) is smaller, 70% opacity, with no ring.
 * It takes no input, ever: your pointer stays yours.
 */

import { type Director } from "./director"
import "./motion.css"

export function Cursor4({
  director,
  label = "Quincy",
  support = false,
}: {
  director: Director
  label?: string
  support?: boolean
}) {
  const { v, cursor, reduced } = director
  if (reduced) return null
  return (
    <div ref={cursor} aria-hidden className="qc4-cursor" data-support={support || undefined}>
      {!support && v.presses > 0 ? <span key={`r${v.presses}`} className="qc4-ring" /> : null}
      <span key={`p${v.presses}`} className={v.presses > 0 ? "qc4-press qc4-tap" : "qc4-press"}>
        <svg width="18" height="23" viewBox="0 0 22 28" className="absolute -top-0.5 -left-0.5 drop-shadow-sm">
          <path
            d="M2 1.5v21.2l5.3-5.1 3.4 8 3.7-1.6-3.4-7.8H18L2 1.5Z"
            className="fill-kit-ink stroke-kit-object"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span
        className={`absolute top-[18px] left-3 flex items-center gap-1 rounded-full bg-kit-primary font-kit-strong whitespace-nowrap text-kit-primary-on shadow-kit-control ${
          support ? "h-[18px] px-1.5 text-kit-mono-sm" : "h-[22px] px-2 text-kit-meta"
        }`}
      >
        {label}
        {v.cap > 0 ? (
          <span key={`c${v.cap}`} className="qc4-cap rounded-kit-chip bg-kit-object px-1 font-kit-mono text-kit-mono-sm text-kit-ink">
            ⌫
          </span>
        ) : null}
      </span>
    </div>
  )
}

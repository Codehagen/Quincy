import * as React from "react"

import { IconSheet, INK, YELLOW } from "../../sheet"

/**
 * 03 — Swiped.
 *
 * A Q with the highlighter dragged across its lower half: the one sentence
 * that matters, marked. Where the ring crosses the yellow it is always ink,
 * so the overlap keeps its contrast on the dark tile too.
 */
function Mark({ size }: { size: number }) {
  const id = React.useId()
  const band = "M0 9.5 L16 7.5 L16 13 L0 15Z"
  const q = (
    <>
      <circle cx="7.5" cy="7" r="5" strokeWidth="2" />
      <path d="M10.5 10 L14.5 14" strokeWidth="2" strokeLinecap="round" />
    </>
  )
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <defs>
        <clipPath id={id}>
          <path d={band} />
        </clipPath>
      </defs>
      <path d={band} fill={YELLOW} />
      <g stroke="currentColor">{q}</g>
      <g stroke={INK} clipPath={`url(#${id})`}>
        {q}
      </g>
    </svg>
  )
}

export default function Swiped() {
  return <IconSheet name="Swiped" mark={(s) => <Mark size={s} />} />
}

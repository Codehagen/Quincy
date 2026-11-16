import { BLUE, IconSheet, type Tone } from "../../sheet"

/**
 * 11 — Heard, written.
 *
 * Three bars of a voice note on the left, and they settle into one blue line
 * of text on the right: the raw material becoming a draft, left to right.
 * Bars are 2px wide with 1px gaps, the narrowest a waveform can be at 16.
 */
function Mark({ size, tone }: { size: number; tone: Tone }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      aria-hidden
    >
      <g fill="currentColor">
        <rect x="0" y="5" width="2" height="6" />
        <rect x="3" y="1" width="2" height="14" />
        <rect x="6" y="4" width="2" height="8" />
      </g>
      <rect x="9" y="7" width="7" height="2" fill={BLUE[tone]} />
    </svg>
  )
}

export default function HeardWritten() {
  return (
    <IconSheet name="Heard, written" mark={(s, t) => <Mark size={s} tone={t} />} />
  )
}

import { BLUE, IconSheet, type Tone } from "../../sheet"

/**
 * 06 — Margin bracket.
 *
 * Three lines of your text and the blue bracket Quincy draws beside them in
 * the margin. All filled rectangles on whole pixels, so at 16 every edge
 * lands on the grid.
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
      <g fill={BLUE[tone]}>
        <rect x="1" y="1" width="2" height="14" />
        <rect x="1" y="1" width="4" height="2" />
        <rect x="1" y="13" width="4" height="2" />
      </g>
      <g fill="currentColor">
        <rect x="7" y="1" width="8" height="2" />
        <rect x="7" y="7" width="6" height="2" />
        <rect x="7" y="13" width="7" height="2" />
      </g>
    </svg>
  )
}

export default function MarginBracket() {
  return (
    <IconSheet name="Margin bracket" mark={(s, t) => <Mark size={s} tone={t} />} />
  )
}

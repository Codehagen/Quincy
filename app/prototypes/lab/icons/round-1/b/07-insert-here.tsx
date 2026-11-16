import { BLUE, IconSheet, type Tone } from "../../sheet"

/**
 * 07 — Insert here.
 *
 * The proofreader's caret under a gap in a line: something belongs here, and
 * Quincy is the one who says what. The line is two ink bars; the caret is a
 * 2px blue chevron whose point meets the gap.
 */
function Mark({ size, tone }: { size: number; tone: Tone }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <g fill="currentColor" shapeRendering="crispEdges">
        <rect x="0" y="4" width="6" height="2" />
        <rect x="10" y="4" width="6" height="2" />
      </g>
      <path
        d="M3.5 13.5 L8 7 L12.5 13.5"
        stroke={BLUE[tone]}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function InsertHere() {
  return (
    <IconSheet name="Insert here" mark={(s, t) => <Mark size={s} tone={t} />} />
  )
}

import { BLUE, IconSheet, type Tone } from "../../sheet"

/**
 * 15 — Said, then set.
 *
 * A spoken wave above, a straight blue line below: the same thing, before
 * and after Quincy. The wave is one 2px stroke with a full period, so it
 * reads as a wave and not a dash at 16.
 */
function Mark({ size, tone }: { size: number; tone: Tone }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M1.5 6.5 C3.2 2.8 5.6 2.8 8 6.5 S12.8 10.2 14.5 6.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect
        x="1"
        y="12"
        width="14"
        height="2"
        fill={BLUE[tone]}
        shapeRendering="crispEdges"
      />
    </svg>
  )
}

export default function SaidThenSet() {
  return (
    <IconSheet name="Said, then set" mark={(s, t) => <Mark size={s} tone={t} />} />
  )
}

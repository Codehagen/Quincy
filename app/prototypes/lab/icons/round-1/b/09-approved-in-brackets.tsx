import { BLUE, IconSheet, type Tone } from "../../sheet"

/**
 * 09 — Approved in brackets.
 *
 * A check set inside square brackets: the edit is marked, and the mark is
 * yours to give. Brackets are whole-pixel ink, the check is the one blue,
 * the colour of Approve.
 */
function Mark({ size, tone }: { size: number; tone: Tone }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <g fill="currentColor" shapeRendering="crispEdges">
        <rect x="1" y="1" width="2" height="14" />
        <rect x="1" y="1" width="3" height="2" />
        <rect x="1" y="13" width="3" height="2" />
        <rect x="13" y="1" width="2" height="14" />
        <rect x="12" y="1" width="3" height="2" />
        <rect x="12" y="13" width="3" height="2" />
      </g>
      <path
        d="M5 8.2 L7.2 10.4 L11 5.8"
        stroke={BLUE[tone]}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function ApprovedInBrackets() {
  return (
    <IconSheet
      name="Approved in brackets"
      mark={(s, t) => <Mark size={s} tone={t} />}
    />
  )
}

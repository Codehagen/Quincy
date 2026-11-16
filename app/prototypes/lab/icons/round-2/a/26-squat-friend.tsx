import { IconSheet, YELLOW } from "../../sheet"
import { hole, page } from "../friend"

/**
 * 26 — Squat friend.
 *
 * The marked friend three pixels shorter: a 12×11 page instead of 12×14, so
 * the figure sits rather than stands. The eyes move down with it and the
 * sash keeps its 3px band and its 2px overhang on each side.
 */
const BODY = page(2, 3, 12, 11, 3) + hole(5, 5, 2, 3) + hole(9, 5, 2, 3)

function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <path fillRule="evenodd" clipRule="evenodd" fill="currentColor" d={BODY} />
      <rect x="0" y="9" width="16" height="3" fill={YELLOW} shapeRendering="crispEdges" />
    </svg>
  )
}

export default function SquatFriend() {
  return <IconSheet name="Squat friend" mark={(s) => <Mark size={s} />} />
}

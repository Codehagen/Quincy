import { IconSheet, YELLOW } from "../../sheet"
import { hole, page } from "../friend"

/**
 * 27 — Glance.
 *
 * The same page and sash as 20, with both eyes moved two pixels to the
 * right: the friend is looking at the tab title beside it. Only position
 * changes, so the glance survives at 16, where a pupil would not.
 */
const BODY = page(2, 1, 12, 14, 3) + hole(7, 4, 2, 3) + hole(11, 4, 2, 3)

function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <path fillRule="evenodd" clipRule="evenodd" fill="currentColor" d={BODY} />
      <rect x="0" y="9" width="16" height="3" fill={YELLOW} shapeRendering="crispEdges" />
    </svg>
  )
}

export default function Glance() {
  return <IconSheet name="Glance" mark={(s) => <Mark size={s} />} />
}

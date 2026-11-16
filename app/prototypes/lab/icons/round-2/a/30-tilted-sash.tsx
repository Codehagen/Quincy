import { IconSheet, YELLOW } from "../../sheet"
import { hole, page } from "../friend"

/**
 * 30 — Tilted sash.
 *
 * The sash worn on a slant, rising three units across the page, like a
 * stroke pulled fast with a highlighter. From 32 up it is a straight band;
 * at 16 it is three whole-pixel steps, because a slanted 3px band at 16 is
 * all anti-aliasing.
 */
const BODY = page(2, 1, 12, 14, 3) + hole(5, 4, 2, 3) + hole(9, 4, 2, 3)

function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <path fillRule="evenodd" clipRule="evenodd" fill="currentColor" d={BODY} />
      {size >= 32 ? (
        <path d="M0 10.5L16 7.5V10.5L0 13.5Z" fill={YELLOW} />
      ) : (
        <g fill={YELLOW} shapeRendering="crispEdges">
          <rect x="0" y="10" width="5" height="3" />
          <rect x="5" y="9" width="6" height="3" />
          <rect x="11" y="8" width="5" height="3" />
        </g>
      )}
    </svg>
  )
}

export default function TiltedSash() {
  return <IconSheet name="Tilted sash" mark={(s) => <Mark size={s} />} />
}

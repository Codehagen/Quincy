import { IconSheet, YELLOW } from "../../sheet"
import { hole } from "../friend"

/**
 * 29 — Dog-ear.
 *
 * The friend's top-right corner is folded down: a 4×4 notch with the flap
 * lying in it, kept apart from the page by a 1px gap on whole pixels, so the
 * fold is a line of paper colour and not a second ink. The face drops two
 * pixels to clear it; the sash drops one. At 16 the flap is a pixel stair.
 */
const BODY =
  "M5 1H10V5H14V12A3 3 0 0 1 11 15H5A3 3 0 0 1 2 12V4A3 3 0 0 1 5 1Z" +
  hole(5, 6, 2, 3) +
  hole(9, 6, 2, 3)
const FLAP = "M11 1L14 4H11Z"
/** At 16 the flap is a three-row pixel stair, so its slope is not a blur. */
const FLAP_16 = "M11 1h1v1h1v1h1v1h-3Z"

function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <path fillRule="evenodd" clipRule="evenodd" fill="currentColor" d={BODY} />
      {size >= 32 ? (
        <path fill="currentColor" d={FLAP} />
      ) : (
        <path fill="currentColor" shapeRendering="crispEdges" d={FLAP_16} />
      )}
      <rect x="0" y="10" width="16" height="3" fill={YELLOW} shapeRendering="crispEdges" />
    </svg>
  )
}

export default function DogEar() {
  return <IconSheet name="Dog-ear" mark={(s) => <Mark size={s} />} />
}

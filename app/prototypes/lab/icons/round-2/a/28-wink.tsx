import { IconSheet, YELLOW } from "../../sheet"
import { hole, page } from "../friend"

/**
 * 28 — Wink.
 *
 * At 32 and up the right eye closes into a small arch: a wink, for the app
 * icon and the page header. At 16 it opens again, because a 1px arch in a
 * favicon is a smudge and two eyes are what make it a face there.
 */
const PAGE = page(2, 1, 12, 14, 3)
const LEFT = hole(5, 4, 2, 3)
const OPEN = hole(9, 4, 2, 3)
/** An arch 1 unit thick, its feet on the eye's baseline. */
const SHUT = "M8.5 6.6Q10 3.8 11.5 6.6L11.5 7.6Q10 4.9 8.5 7.6Z"

function Mark({ size }: { size: number }) {
  const big = size >= 32
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="currentColor"
        d={PAGE + LEFT + (big ? SHUT : OPEN)}
      />
      <rect x="0" y="9" width="16" height="3" fill={YELLOW} shapeRendering="crispEdges" />
    </svg>
  )
}

export default function Wink() {
  return <IconSheet name="Wink" mark={(s) => <Mark size={s} />} />
}

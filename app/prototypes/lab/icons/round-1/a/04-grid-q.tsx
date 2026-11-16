import { IconSheet } from "../../sheet"

/**
 * 04 — Grid Q.
 *
 * A Q drawn in whole pixels for the 16px tab first and only then enlarged:
 * a 2px square ring with notched corners, and a tail that steps out of the
 * counter one pixel-pair at a time. It is the only mark here that is sharper
 * at 16 than at 120.
 */
function Mark({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden
    >
      <rect x="2" y="1" width="10" height="2" />
      <rect x="2" y="11" width="10" height="2" />
      <rect x="1" y="2" width="2" height="10" />
      <rect x="11" y="2" width="2" height="10" />
      <rect x="7" y="7" width="2" height="2" />
      <rect x="9" y="9" width="2" height="2" />
      <rect x="13" y="13" width="2" height="2" />
    </svg>
  )
}

export default function GridQ() {
  return <IconSheet name="Grid Q" mark={(s) => <Mark size={s} />} />
}

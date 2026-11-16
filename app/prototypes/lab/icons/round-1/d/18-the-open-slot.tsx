import { BLUE, IconSheet, type Tone } from "../../sheet"

/**
 * 18 — The open slot.
 *
 * A fragment of the week: nine slots in a grid, and the one Quincy is
 * filling, in blue. Cells are 4px with 2px gutters and 1px rings on the
 * half-pixel, so every edge is crisp at 16.
 */
const CELLS = [0, 6, 12]

function Mark({ size, tone }: { size: number; tone: Tone }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      shapeRendering="crispEdges"
      aria-hidden
    >
      {CELLS.flatMap((y) =>
        CELLS.map((x) =>
          x === 6 && y === 6 ? (
            <rect key={`${x}-${y}`} x={x} y={y} width="4" height="4" fill={BLUE[tone]} />
          ) : (
            <rect
              key={`${x}-${y}`}
              x={x + 0.5}
              y={y + 0.5}
              width="3"
              height="3"
              stroke="currentColor"
              strokeWidth="1"
            />
          )
        )
      )}
    </svg>
  )
}

export default function TheOpenSlot() {
  return (
    <IconSheet name="The open slot" mark={(s, t) => <Mark size={s} tone={t} />} />
  )
}

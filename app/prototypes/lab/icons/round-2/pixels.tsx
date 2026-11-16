import { INK, YELLOW } from "../sheet"

/**
 * Round 2's pixel marks, written as the 16×16 bitmap they are, so the file is
 * the favicon: `.` empty, `#` ink (currentColor), `y` the highlighter, `k`
 * ink that stays ink on both grounds (a mark drawn on top of yellow).
 *
 * Each colour is one path of whole-pixel runs with crispEdges, so nothing is
 * anti-aliased at 16 and 32 is exactly 2×.
 */
export type Bitmap = readonly string[]

const FILL: Record<string, string> = { "#": "currentColor", y: YELLOW, k: INK }
/** Drawn in this order, so the later colour wins where runs touch. */
const ORDER = ["#", "y", "k"]

export function PixelMark({ rows, size }: { rows: Bitmap; size: number }) {
  const d: Record<string, string> = { "#": "", y: "", k: "" }
  rows.forEach((row, y) => {
    let x = 0
    while (x < 16) {
      const c = row[x]
      if (!c || !(c in FILL)) {
        x++
        continue
      }
      let end = x
      while (end < 16 && row[end] === c) end++
      d[c] += `M${x} ${y}h${end - x}v1h${x - end}Z`
      x = end
    }
  })
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      aria-hidden
    >
      {ORDER.map((c) =>
        d[c] ? <path key={c} d={d[c]} fill={FILL[c]} /> : null
      )}
    </svg>
  )
}

import { IconSheet, INK, YELLOW } from "../../sheet"

/**
 * 08 — The one line.
 *
 * Three lines of text and the highlighter under the middle one: of all you
 * said, this. The highlighted line is always ink, so it keeps its contrast
 * on yellow even when the other two turn light on the dark tile.
 */
function Mark({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      aria-hidden
    >
      <rect x="0" y="6" width="16" height="4" fill={YELLOW} />
      <rect x="1" y="2" width="13" height="2" fill="currentColor" />
      <rect x="2" y="7" width="12" height="2" fill={INK} />
      <rect x="1" y="12" width="9" height="2" fill="currentColor" />
    </svg>
  )
}

export default function TheOneLine() {
  return <IconSheet name="The one line" mark={(s) => <Mark size={s} />} />
}

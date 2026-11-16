import { IconSheet, YELLOW } from "../../sheet"

/**
 * 20 — The marked friend.
 *
 * A character: a squat page with two eyes, wearing the highlighter across
 * its middle like a sash, and the swipe runs past both of its sides. It is
 * the draft as a figure who is pleased to be marked up. It is a squared page
 * with soft corners, not a blob, so it stays Quincy's own shape.
 */
function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="currentColor"
        d="M5 1H11A3 3 0 0 1 14 4V12A3 3 0 0 1 11 15H5A3 3 0 0 1 2 12V4A3 3 0 0 1 5 1Z M5 4h2v3H5Z M9 4h2v3H9Z"
      />
      <rect
        x="0"
        y="9"
        width="16"
        height="3"
        fill={YELLOW}
        shapeRendering="crispEdges"
      />
    </svg>
  )
}

export default function TheMarkedFriend() {
  return <IconSheet name="The marked friend" mark={(s) => <Mark size={s} />} />
}

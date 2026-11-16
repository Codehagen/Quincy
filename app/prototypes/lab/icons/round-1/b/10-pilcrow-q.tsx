import { IconSheet } from "../../sheet"

/**
 * 10 — Pilcrow q.
 *
 * The proofreader's paragraph mark, which is already a q: a filled bowl on
 * the left of a stem. It says "new paragraph here" to anyone who edits, and
 * "Quincy" to anyone who does not. Two stems and a bowl, all at least 2px.
 */
function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M9 1 H6.5 A4 4 0 0 0 6.5 9 H9Z" />
      <rect x="8" y="1" width="7" height="2" shapeRendering="crispEdges" />
      <rect x="8" y="1" width="2" height="14" shapeRendering="crispEdges" />
      <rect x="12" y="1" width="2" height="14" shapeRendering="crispEdges" />
    </svg>
  )
}

export default function PilcrowQ() {
  return <IconSheet name="Pilcrow q" mark={(s) => <Mark size={s} />} />
}

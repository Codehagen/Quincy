import { Friend, type MascotState } from "@/components/mascot"

/**
 * The friend sitting on an object's top edge, its lower body behind it, so
 * the eyes and the yellow sash read over the edge.
 */
export function Perched({
  state,
  size = 48,
  at,
  children,
  className,
}: {
  state: MascotState
  size?: number
  /** Distance from the object's left edge, any CSS length. */
  at: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`relative ${className ?? ""}`}>
      <span aria-hidden className="pointer-events-none absolute text-kit-ink select-none" style={{ left: at, top: -(size * 13) / 16 }}>
        <Friend state={state} size={size} />
      </span>
      <div className="relative">{children}</div>
    </div>
  )
}

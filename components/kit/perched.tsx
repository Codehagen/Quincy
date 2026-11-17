import * as React from "react"

import { Friend, type MascotState } from "@/components/mascot"

export type PerchedProps = Omit<React.ComponentProps<"div">, "children"> & {
  state: MascotState
  /** The friend's size in px (default 48; the landing uses 64 on a hero object). */
  size?: number
  /** Distance from the object's left edge, any CSS length. */
  at: string
  /** The object the friend sits on. */
  children: React.ReactNode
}

/**
 * The friend sitting on an object's top edge, its lower body behind it, so
 * the eyes and the yellow sash read over the edge. Decorative: the friend is
 * hidden from assistive tech and never takes a pointer.
 */
export function Perched({ state, size = 48, at, children, className, ...props }: PerchedProps) {
  return (
    <div data-slot="kit-perched" {...props} className={`relative ${className ?? ""}`}>
      <span aria-hidden className="pointer-events-none absolute text-kit-ink select-none" style={{ left: at, top: -(size * 13) / 16 }}>
        <Friend state={state} size={size} />
      </span>
      <div className="relative">{children}</div>
    </div>
  )
}

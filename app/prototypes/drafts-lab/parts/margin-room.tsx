"use client"

import * as React from "react"

/**
 * MarginRoom: an object at a width of its own, with Quincy's margin beside
 * it, so the kit's marks (BeatBracket, MarginNote) stand outside the
 * object instead of inside it. Headed for components/kit (DECISION.md,
 * "API"): it is the kit's margin rule for any object that is not a Card.
 *
 * ```tsx
 * <MarginRoom objectWidth="598px">
 *   <MarginRoom.Column>{the object}</MarginRoom.Column>
 *   <MarginRoom.Column>{what goes under it}</MarginRoom.Column>
 * </MarginRoom>
 * ```
 *
 * The room is a `kit-stage` size container. From 32rem every Column is the
 * object width, narrowed to leave the margin column and its gap; under it,
 * the Column takes the room and the marks fall under their lines. Inside
 * the object, set `--kit-card-pad` to the distance from the text's edge to
 * the object's outer edge, and the marks stand just past it.
 */

export type MarginRoomProps = React.ComponentPropsWithRef<"div"> & {
  /** The object's own width before the room narrows it ("598px"). Unset, the stylesheet's per-channel width applies. */
  objectWidth?: string
  /** Centre the object and its margin as one picture, instead of starting at the room's edge. */
  align?: "start" | "center"
}

function MarginRoomRoot({ objectWidth, align = "start", className, style, children, ...rest }: MarginRoomProps) {
  return (
    <div
      className={["dl-room @container/kit-stage", className].filter(Boolean).join(" ")}
      data-centred={align === "center" ? "" : undefined}
      style={objectWidth ? ({ "--dl-post-w": objectWidth, ...style } as React.CSSProperties) : style}
      {...rest}
    >
      {children}
    </div>
  )
}

/** A block at the object's width: the object itself, or what belongs to it (its notices, its verbs). */
function MarginColumn({ className, children, ...rest }: React.ComponentPropsWithRef<"div">) {
  return (
    <div className={["dl-col", className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </div>
  )
}

export const MarginRoom = Object.assign(MarginRoomRoot, { Column: MarginColumn })

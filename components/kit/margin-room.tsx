import * as React from "react"

/**
 * An object at a width of its own, with Quincy's margin beside it, so the
 * kit's marks (`BeatBracket`, `MarginNote`) stand outside the object instead
 * of inside it. The margin rule for any object that is not a Card: a post
 * drawn as its feed on /drafts is the first (decided on
 * /prototypes/drafts-lab, "API").
 *
 * ```tsx
 * <MarginRoom objectWidth="598px">
 *   <MarginRoom.Column>{the object}</MarginRoom.Column>
 *   <MarginRoom.Column>{what goes under it: its notices, its verbs}</MarginRoom.Column>
 * </MarginRoom>
 * ```
 *
 * The room is a `kit-stage` size container, which is what the marks
 * measure. From 32rem every Column is the object's width, narrowed to leave
 * the margin column (`--spacing-kit-margin`) and its gap; under it the
 * Column takes the room and the marks fall under their lines.
 *
 * Outside the object `--kit-card-pad` is 0, so a bracket round a whole
 * object stands past its edge. Inside the object, set `--kit-card-pad` to
 * the distance from the text to the object's outer edge, and a mark on a
 * line of text stands just past the object too.
 */

export type MarginRoomProps = React.ComponentPropsWithRef<"div"> & {
  /** The object's own width before the room narrows it ("598px"). Unset, the Column takes the room. */
  objectWidth?: string
  /** Centre the object and its margin as one picture, instead of starting at the room's edge. */
  align?: "start" | "center"
}

function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ")
}

function MarginRoomRoot({ objectWidth, align = "start", className, style, children, ...rest }: MarginRoomProps) {
  return (
    <div
      data-slot="kit-margin-room"
      className={cx(
        "@container/kit-stage w-full",
        align === "center" &&
          "mx-auto max-w-[calc(var(--kit-object-w,100%)_+_var(--spacing-kit-margin)_+_var(--spacing-kit-margin-gap))]",
        className
      )}
      style={objectWidth ? ({ "--kit-object-w": objectWidth, ...style } as React.CSSProperties) : style}
      {...rest}
    >
      {children}
    </div>
  )
}

/** A block at the object's width: the object itself, or what belongs to it. */
function MarginRoomColumn({ className, children, ...rest }: React.ComponentPropsWithRef<"div">) {
  return (
    <div
      data-slot="kit-margin-room-column"
      className={cx(
        "w-[min(var(--kit-object-w,100%),100%)] [--kit-card-pad:0px]",
        "@lg/kit-stage:w-[min(var(--kit-object-w,100%),calc(100%_-_var(--spacing-kit-margin)_-_var(--spacing-kit-margin-gap)))]",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  )
}

export const MarginRoom = Object.assign(MarginRoomRoot, { Column: MarginRoomColumn })

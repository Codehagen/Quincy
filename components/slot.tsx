import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * The domain primitive.
 *
 * A publishing schedule is not a calendar — it is a queue with fixed openings.
 * The strategy document sets a cadence, the cadence generates N openings per
 * day, and a draft claims one. So the atom is the opening, not the day.
 *
 * Two orthogonal axes:
 *   variant  — what kind of opening this is (next / open / past)
 *   children — present means the opening is filled
 *
 * Deriving "filled" from children keeps the two from contradicting each other,
 * which a single five-value `state` prop could not.
 */

type SlotProps = React.ComponentProps<"div"> & {
  time: string
  variant?: "open" | "next" | "past"
}

function Slot({ className, time, variant = "open", children, ...props }: SlotProps) {
  const filled = Boolean(children)

  return (
    <div
      data-slot="slot"
      data-variant={variant}
      data-filled={filled || undefined}
      className={cn(
        "group/slot flex items-center gap-3 rounded-sm px-3 py-2.5",
        "transition-colors duration-100 ease-out",
        variant !== "past" && "hover:bg-muted/60",
        variant === "past" && "opacity-55",
        className
      )}
      {...props}
    >
      {/* Fixed-width marker column: every indicator down the page lands on one
          vertical line, which is what makes a long list scannable at a glance. */}
      <span className="flex w-2 shrink-0 justify-center" aria-hidden="true">
        <span
          className={cn(
            "size-2 rounded-full",
            variant === "next" && "bg-signal",
            variant === "open" && "border border-muted-foreground/40",
            variant === "past" && "bg-muted-foreground/25",
            filled && variant !== "next" && "bg-muted-foreground/50"
          )}
        />
      </span>

      <time className="w-24 shrink-0 font-mono text-caption tabular-nums text-muted-foreground">
        {time}
      </time>

      {filled ? (
        <span className="min-w-0 flex-1 truncate text-body">{children}</span>
      ) : (
        <span className="min-w-0 flex-1 text-body text-muted-foreground/70">
          {variant === "past" ? "Missed" : "Open"}
        </span>
      )}

      {variant === "next" && !filled ? (
        <span className="shrink-0 font-mono text-caption text-signal-foreground">next up</span>
      ) : null}
    </div>
  )
}

function SlotGroup({
  className,
  label,
  meta,
  ...props
}: React.ComponentProps<"section"> & { label: string; meta?: string }) {
  return (
    <section
      data-slot="slot-group"
      className={cn("flex flex-col gap-1", className)}
      {...props}
    >
      <div className="flex items-baseline justify-between px-3 pb-1">
        <h2 className="text-eyebrow text-muted-foreground uppercase">{label}</h2>
        {meta ? (
          <span className="font-mono text-caption text-muted-foreground/70 tabular-nums">
            {meta}
          </span>
        ) : null}
      </div>
      <div className="divide-y divide-border/60">{props.children}</div>
    </section>
  )
}

export { Slot, SlotGroup }

import * as React from "react"

export type LiveDotProps = {
  /**
   * What is running, in words ("Recording", "Heartbeat is reading"). Omit it
   * only where those words already sit beside the dot, as a ListRow's
   * `leading` whose `description` says it: the dot is decorative and never
   * the only thing that says "live".
   */
  children?: React.ReactNode
  /**
   * A ring leaves the dot every 1.8s. Only while something is actively
   * happening right now (recording, publishing); a standing state ("Rhythm
   * on") is a still dot. Reduced motion keeps the dot and drops the ring.
   */
  pulse?: boolean
}

/**
 * "This is running." The only thing in the kit painted --kit-live, and only
 * as an 8px dot beside its label: never a pill, never a fill, never green
 * text (the live-ritual pill was discarded in the lab). The label carries the
 * meaning; the dot is 3.09:1 and decorative.
 */
export function LiveDot({ children, pulse = false }: LiveDotProps) {
  return (
    <span data-slot="kit-live-dot" className="inline-flex items-center gap-2">
      <span aria-hidden className="relative size-2 shrink-0 rounded-full bg-kit-live">
        {pulse ? (
          <span className="absolute inset-0 animate-kit-live-pulse rounded-full bg-kit-live motion-reduce:hidden motion-reduce:animate-none" />
        ) : null}
      </span>
      {children != null ? <span className="min-w-0">{children}</span> : null}
    </span>
  )
}

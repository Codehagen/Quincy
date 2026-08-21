import { cn } from "@/lib/utils"

/**
 * "Last used" beside the method this browser signed in with last.
 *
 * A hint, not an action, so it carries no brand colour and no border weight —
 * it recedes and lets the buttons stay the loudest thing on the screen. It
 * exists to shorten a decision, and a decision aid that competes with the
 * decision has failed.
 *
 * Not aria-hidden. Someone using a screen reader has the same question about
 * which method they used, and the answer is one short phrase.
 */
export function LastUsed({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "rounded-full bg-muted px-2 py-0.5 text-caption text-muted-foreground",
        className
      )}
    >
      Last used
    </span>
  )
}

/**
 * "Last used" beside the method this browser signed in with last.
 *
 * A hint, not an action, so it carries no colour of its own and no weight —
 * it recedes and lets the buttons stay the loudest thing on the screen. It
 * exists to shorten a decision, and a decision aid that competes with the
 * decision has failed.
 *
 * It sits on a button, so it takes that button's ground: the inset chip of a
 * Tag on the white quiet pill, and a step off the ink on the action pill
 * (`--kit-primary-hover`, the mix toward the ground, so it holds in both
 * modes). Absolutely placed at the end and `pointer-events-none`, so it never
 * pushes the label off centre or swallows the click it is advertising.
 *
 * Not aria-hidden. Someone using a screen reader has the same question about
 * which method they used, and the answer is one short phrase.
 */
export function LastUsed({ on }: { on: "quiet" | "action" }) {
  return (
    <span
      className={`pointer-events-none absolute inset-y-0 end-2 my-auto inline-flex h-6 items-center rounded-full px-2 text-kit-small ${
        on === "action"
          ? "bg-kit-primary-hover text-kit-primary-on"
          : "text-kit-ink-muted shadow-kit-inset"
      }`}
    >
      Last used
    </span>
  )
}

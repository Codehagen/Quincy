import { flushSync } from "react-dom"

/**
 * Run a state change as a view transition, so the browser animates the gap
 * between the two layouts instead of cutting to the second one.
 *
 * Extracted from the drafts list once Lineup needed the same
 * thing. Both surfaces have the same shape of problem: a list where committing
 * a decision resizes one row and moves everything below it, in one frame.
 *
 * A CSS transition cannot reach these. Collapsing a row means animating height,
 * which cannot go to or from `auto`, and every wrapper that could animate it
 * breaks the `h-full` chain the bottom-pinned action rows depend on. Moving a
 * row between two days is worse — an element cannot animate out of one list
 * position into another at all. `startViewTransition` needs neither: it
 * snapshots before and after and morphs the named elements between them, so the
 * layout code is untouched.
 *
 * `flushSync` is required. The callback must have committed by the time it
 * returns, and React would otherwise batch the update past the snapshot.
 *
 * **Reduced motion is handled here rather than in CSS.** The reduce block in
 * globals.css flattens transition durations, but a view transition with a
 * near-zero duration still snapshots and repaints the whole document. Skipping
 * `startViewTransition` entirely is the only way to actually opt out, so an
 * unsupported browser and a stated preference take the same path: a plain
 * synchronous state change, correct and instant.
 *
 * **Returns when the transition is over**, which most callers ignore. Drafts
 * does not: finishing a piece renames its rows before the snapshot is taken and
 * has to put the names back once the pane has settled, and polling a timeout
 * would be a second copy of the duration to keep in sync with globals.css. The
 * skip path above resolves immediately, so a caller that awaits behaves the same
 * under reduced motion as it does anywhere else.
 *
 * The rejection is swallowed rather than propagated. `finished` rejects when the
 * update callback throws — which React has already surfaced through its own
 * error handling by then — and an unhandled rejection here would be a second
 * report of the same fault, from a helper that cannot say anything useful about
 * it.
 */
export function withViewTransition(update: () => void): Promise<void> {
  if (
    typeof document === "undefined" ||
    !("startViewTransition" in document) ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    update()
    return Promise.resolve()
  }

  return document.startViewTransition(() => flushSync(update)).finished.catch(() => {})
}

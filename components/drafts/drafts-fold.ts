/*
 * The drafts fold: the rule, and the same rule as CSS. Its own module, free
 * of the kit, so a test can hold the two together (drafts-fold.test.ts).
 */

/** The margin column beside the feed (narrower than the kit's 170, so the pane is 798). */
export const MARK_COLUMN_PX = 150

/** The fixed tracks of a table row: marks 64, age 52, two 12px gaps, the 8 + 12 on each side. */
export const ROW_FIXED_PX = 64 + 52 + 2 * 12 + 40

/** X's 598 column, the mark column, its 10 gap, and the pane's 20 + 20. */
export const PANE_PX = 598 + MARK_COLUMN_PX + 10 + 40

/** Under this the page is a phone or a split tablet: one column. */
const FOLD_MIN_WIDTH = 900
/** The narrowest title column the table may leave before it folds. */
const TITLE_MIN = 200

/**
 * Fold when the workspace is under 900, or when the feed pane would leave
 * the title column under 200: a workspace under ~1180px, so 1280 with the
 * sidebar folds and 1440 stays a table. Drawn by CSS on the page's own
 * width, never the viewport's (below).
 */
export function shouldFold(width: number) {
  if (width < FOLD_MIN_WIDTH) return true
  return width - PANE_PX - 1 - ROW_FIXED_PX < TITLE_MIN
}

/**
 * The fold in CSS (useWorkspaceFold): `shouldFold`'s switch point as a
 * container query on the workspace, so the server's HTML paints the right
 * side at once. Literal, so Tailwind sees the classes;
 * drafts-fold.test.ts holds the number to `shouldFold`.
 */
export const FOLD_AT = 1179
/** Shown under the fold: the one column. */
export const FOLDED = "contents @[1179px]/kit-workspace:hidden"
/** Shown from the fold up: the table and the pane. */
export const UNFOLDED = "hidden @[1179px]/kit-workspace:contents"
/** The probe useWorkspaceFold reads: shown only under the fold. */
export const FOLD_PROBE = "block @[1179px]/kit-workspace:hidden"


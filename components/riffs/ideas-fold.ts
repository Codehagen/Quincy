/*
 * The ideas fold: the rule, and where ideas.css draws it. Its own module,
 * free of the kit, so a test can hold the two together (ideas-fold.test.ts).
 */

/**
 * What a row spends outside the title column, in px, from the columns above:
 * 8+8 inset, 12+12 padding, the 16 glyph, Shape 88, For 52, Age 48, and four
 * 12px gaps. From a 46rem list the Source column (120 + a gap) joins. The
 * fold reads these (`shouldFold`, below).
 */
export const ROW_FIXED_PX = 16 + 24 + 16 + 88 + 52 + 48 + 4 * 12
export const SOURCE_COLUMN_PX = 120 + 12
export const DATA_WIDE_PX = 736

/** The fixed pane: a share of the workspace between a floor and a ceiling (workspace-lab DECISION.md). */
const DETAIL_MIN = 440
const DETAIL_MAX = 560
const DETAIL_SHARE = 0.36
export const DETAIL_WIDTH = `clamp(${DETAIL_MIN}px, ${DETAIL_SHARE * 100}cqi, ${DETAIL_MAX}px)`

/** Under this the page is a phone or a split tablet: one column. */
const FOLD_MIN_WIDTH = 900
/** The narrowest title column the table may leave before it folds. */
const TITLE_MIN = 320

/**
 * Fold when the workspace is under 900, or when the detail pane would leave
 * the title column under 320 (at the defaults: a workspace under ~1053px).
 * Drawn by CSS on the page's own width, never the viewport's (ideas.css).
 */
export function shouldFold(width: number) {
  if (width < FOLD_MIN_WIDTH) return true
  const detail = Math.min(DETAIL_MAX, Math.max(DETAIL_MIN, width * DETAIL_SHARE))
  const list = width - detail - 1
  const title = list - ROW_FIXED_PX - (list >= DATA_WIDE_PX ? SOURCE_COLUMN_PX : 0)
  return title < TITLE_MIN
}

/** The fold's switch points in ideas.css, held to `shouldFold` by ideas-fold.test.ts. */
export const FOLD_CSS = { unfoldAt: 1053, refoldFrom: 1177, refoldTo: 1185 } as const


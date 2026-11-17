/*
 * Lineup's layout rule, in its own module, free of the kit, so a test can
 * hold it to lineup.css (lineup-fold.test.ts).
 */

export type Mode = "week" | "day" | "feed"

/**
 * The layout for a workspace this wide; `coarse` is a touch screen. The page
 * draws it in CSS (lineup.css, "The layout, in CSS"); this is the rule those
 * container queries say, held to them by lineup-fold.test.ts.
 */
export function modeFor(width: number, coarse: boolean): Mode {
  if (coarse || width < 860) return "feed"
  return width >= 1020 ? "week" : "day"
}


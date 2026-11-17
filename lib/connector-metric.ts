import type { ConnectorMetric } from "./connectors"
import { MIN_WEEKS, usualOf } from "./numbers-read"

/**
 * A connector's one number (lib/connectors-load.ts reads the timestamps;
 * this does the arithmetic, so a test can pin it without a database).
 */

const DAY = 86_400_000
const WEEK = 7 * DAY

/** The metric's window. */
export const WINDOW_DAYS = 30

/**
 * The window's count against the usual for a window that long: the median
 * of the complete weeks before it since `from` (lib/numbers-read.ts, the
 * same arithmetic /numbers uses). Left out when the history holds fewer than
 * `MIN_WEEKS` weeks, or when there is nothing on either side of it, so a
 * number never stands without its usual.
 */
export function metricFor(
  label: string,
  times: readonly Date[],
  from: Date | null,
  now: Date,
  minWeeks = MIN_WEEKS
): ConnectorMetric | undefined {
  if (!from) return undefined
  const age = (d: Date) => now.getTime() - d.getTime()
  const value = times.filter((d) => age(d) >= 0 && age(d) < WINDOW_DAYS * DAY).length
  const historyWeeks = Math.floor(age(from) / WEEK)
  const perWeek = (w: number) => times.filter((d) => age(d) >= w * WEEK && age(d) < (w + 1) * WEEK).length
  const { usual } = usualOf(perWeek, WINDOW_DAYS, historyWeeks, minWeeks)
  if (usual === null) return undefined
  if (value === 0 && usual === 0) return undefined
  return { label, window: `${WINDOW_DAYS} days`, value, usual }
}


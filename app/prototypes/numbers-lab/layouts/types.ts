import type { Measure, NumbersData, Period, Read } from "../data"
import type { Phase } from "../parts/chrome"

/** Which posts Table shows: every post, those with replies, or those someone came back to. */
export type Show = "all" | "replies" | "returning"
export type Order = "newest" | "best" | "replies"
export type Against = "any" | "above" | "below" | "outlier"

/** Table's own state, mirrored into the URL (`?view=table&post=…&show=…&order=…`). */
export type TableState = { post: string | null; show: Show; order: Order; against: Against }

/** A tile, said as the Table it opens. */
export const TABLE_FOR: Record<Measure, Pick<TableState, "show" | "order">> = {
  replies: { show: "replies", order: "replies" },
  people: { show: "returning", order: "newest" },
  posts: { show: "all", order: "newest" },
  reach: { show: "all", order: "best" },
}

/** What every layout is handed: the same data, the same read, the same states. */
export type LayoutProps = {
  data: NumbersData
  read: Read
  phase: Phase
  period: Period
  setPeriod: (p: Period) => void
  /** Dashboard → Table: a tile (a measure) or a "What worked" row (a post). */
  openTable: (next: Partial<TableState>, returnTo: string) => void
  /** Table's state, from the URL. */
  table: TableState
  setTable: (next: TableState) => void
  /** Set when Table was opened from the Dashboard: the crumb and Esc go back. */
  back?: () => void
  /** The element on the Dashboard that opened Table, refocused on the way back. */
  returnTo: string | null
}

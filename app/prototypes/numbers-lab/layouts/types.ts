import type { NumbersData, Period, Read } from "../data"
import type { Phase } from "../parts/chrome"

/** What every layout is handed: the same data, the same read, the same states. */
export type LayoutProps = {
  data: NumbersData
  read: Read
  phase: Phase
  period: Period
  setPeriod: (p: Period) => void
  /** Open one post in B · Table (from A's "What worked" and C's report). */
  openPost: (id: string) => void
  /** The post B opens on, when another layout sent you. */
  initialPost: string | null
}

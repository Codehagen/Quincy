/**
 * A number against the person's own median, in one line.
 *
 * docs/vision.md: every number in the product is stated against the user's
 * own baseline, never a follower count. lib/numbers.ts holds the arithmetic
 * for /numbers, but it imports the database, so a client card cannot import a
 * value from it. `formatMultiple` below is a copy of the one there, rounding
 * included — the same choice lib/post-metrics.ts made for `medianOf`. If one
 * changes, change both.
 */

/** Same as `formatMultiple` in lib/numbers.ts. */
export function formatMultiple(m: number): string {
  if (!Number.isFinite(m)) return "—"
  if (m >= 10) return `${Math.round(m)}×`
  if (m >= 1) return `${m.toFixed(1)}×`
  return `${m.toFixed(2)}×`
}

export type AgainstMedianInput = {
  value: number
  median: number
  /** "you" on a page about the person; "me" inside their own post. */
  person?: "you" | "me"
  /**
   * `multiple` says the ratio ("1.8× your median."); `median` says the
   * baseline itself ("Your median is 6."), for a line under a figure that
   * already is the value.
   */
  say?: "multiple" | "median"
  /** A qualifier on the median: "at 48 hours", "at 07:45". */
  at?: string
}

export type AgainstMedian = {
  /** Null when there is no median yet: nothing has been measured. */
  multiple: number | null
  direction: "above" | "at" | "below" | "none"
  text: string
}

const fmt = (n: number) => n.toLocaleString("en-US")

export function againstMedian({
  value,
  median,
  person = "you",
  say = "multiple",
  at,
}: AgainstMedianInput): AgainstMedian {
  const whose = person === "you" ? "your" : "my"
  const Whose = person === "you" ? "Your" : "My"
  const qual = at ? ` ${at}` : ""

  if (!Number.isFinite(median) || median <= 0 || !Number.isFinite(value)) {
    return {
      multiple: null,
      direction: "none",
      text: `No median yet${qual}. Nothing has been measured.`,
    }
  }

  const multiple = value / median
  // Within 5% reads as "at": 1.0× said as a direction would be noise.
  const direction = multiple >= 1.05 ? "above" : multiple <= 0.95 ? "below" : "at"

  if (say === "median") {
    return { multiple, direction, text: `${Whose} median${qual} is ${fmt(median)}.` }
  }
  if (direction === "at") {
    return { multiple, direction, text: `About ${whose} median${qual}.` }
  }
  return {
    multiple,
    direction,
    text: `${formatMultiple(multiple)} ${whose} median${qual}.`,
  }
}

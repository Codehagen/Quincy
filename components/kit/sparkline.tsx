import * as React from "react"

/**
 * A small trend under a figure (docs/design/workspace.md, "StatTile and
 * Sparkline"). Decorative: the figure and its sentence beside it say the
 * numbers, so the line is `aria-hidden`. One series on kit tokens, emphasis only:
 *
 * - ink (`kit-ink`): the stretch that is the point (`emphasis`, the period
 *   the person picked), ending in a dot.
 * - the faint mark (`kit-mark`): the context before it. 2.4:1, under the
 *   3:1 a mark wants alone, which is why it is never the only place a value
 *   is said.
 * - muted ink (`kit-ink-muted`): the person's usual, as a flat 1px line.
 *
 * No hue: blue is the pen. Above or below the usual is position, never
 * green and red. Tokens re-point in dark mode, so there are no `dark:` variants.
 */
export type SparklineProps = {
  /** One value per step, oldest first. Null is a gap. */
  values: (number | null)[]
  /** Per step: true draws it in ink. Leave out to ink the whole line. */
  emphasis?: boolean[]
  /** The usual, in the same unit as `values`, drawn as a flat line. */
  usual?: number | null
}

const W = 100
const H = 28

export function Sparkline({ values, emphasis, usual = null }: SparklineProps) {
  const nums = values.filter((v): v is number => v !== null)
  const max = Math.max(1, ...nums, usual ?? 0)
  const n = values.length
  const x = (i: number) => (n <= 1 ? W / 2 : (i / (n - 1)) * W)
  const y = (v: number) => H - 2 - (v / max) * (H - 4)
  const inked = (i: number) => (emphasis ? emphasis[i] === true : true)

  // Two paths: the whole run in the context mark, the emphasis over it in ink.
  const path = (keep: (i: number) => boolean) => {
    let d = ""
    let pen = false
    values.forEach((v, i) => {
      if (v === null || !keep(i)) {
        pen = false
        return
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(2)},${y(v).toFixed(2)}`
      pen = true
    })
    return d
  }
  const firstInk = values.findIndex((_, i) => inked(i))
  const lastI = n - 1
  const last = values[lastI]

  return (
    <div data-slot="kit-sparkline" className="relative h-7 w-full" aria-hidden>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
        {usual !== null ? (
          <line x1={0} x2={W} y1={y(usual)} y2={y(usual)} className="stroke-kit-ink-muted" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ) : null}
        <path d={path(() => true)} fill="none" className="stroke-kit-mark" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {firstInk >= 0 ? (
          <path
            // From the step before the emphasis, so the ink joins the context line.
            d={path((i) => i >= Math.max(0, firstInk - 1))}
            fill="none"
            className="stroke-kit-ink"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
      </svg>
      {last !== null && last !== undefined ? (
        // The end dot in HTML, so the stretched viewBox cannot squash it.
        <span
          className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-kit-ink ring-2 ring-kit-object"
          style={{ left: `${x(lastI)}%`, top: `${(y(last) / H) * 100}%` }}
        />
      ) : null}
    </div>
  )
}

"use client"

/*
 * Feature card: "Every number is against your own median."
 *
 * Started from Stageshow's examples/static-card (MIT; see ../NOTICE.md):
 * pinned bottom bleed, real words only on what the story is about, filler
 * everywhere else. The story is what the system does, so there is no cursor:
 *
 *   1. Thirty posts rise in as bars, in reading order. Filler: their heights
 *      are the only thing that matters.
 *   2. The dashed line is your median. It is the only scale on the chart;
 *      there is no axis in followers or impressions.
 *   3. One post clears it, the multiple rolls to 3.4×, and the note says what
 *      that means in a person's words.
 *
 * Plays once, as the card comes into view, and holds.
 */

import { Note } from "../annotation"
import type { Act } from "../act"
import { usePictureWidth } from "../bento"
import { Count } from "../motion/count"
import { Stage } from "../stage"
import { Bar } from "../window"
import "./median-card.css"

type S = { bars: boolean; lead: boolean; note: boolean }
const initial: S = { bars: false, lead: false, note: false }
const POSTER: S = { bars: true, lead: true, note: true }

// The last 30 posts, as multiples of their own median. The median post sits
// exactly on the line (1.0); one post found its first line.
const POSTS = [
  0.7, 1.1, 0.8, 1.3, 0.9, 1.0, 0.6, 1.5, 1.2, 0.9, 0.5, 1.4, 1.0, 0.8, 1.1,
  3.4, 1.2, 0.9, 0.7, 1.6, 1.0, 0.6, 1.3, 0.9, 1.1, 2.1, 1.0, 0.8, 0.7, 0.9,
]
const LEAD = POSTS.indexOf(3.4)
const CHART = 128
const SCALE = CHART / 3.7

async function script(a: Act<S>) {
  await a.wait(450)
  await a.set({ bars: true })
  // 30 bars at 18ms apart, plus the last one's rise
  await a.wait(900)
  await a.set({ lead: true })
  await a.wait(900)
  await a.set({ note: true })
}

export function MedianCard() {
  const [ref, width] = usePictureWidth(400)
  return (
    <div ref={ref}>
      <Stage<S>
        width={width}
        height={300}
        initial={initial}
        poster={POSTER}
        script={script}
        play="once"
        className="qm"
      >
        {(s, rect) => {
          const bar = rect("lead-bar")
          const top = { x: bar.x - 5, y: bar.y + 8 }
          return (
            <>
              <div className="qm-panel">
                <div className="qm-head">
                  <span className="qm-title">Last 30 posts</span>
                  <span className="qm-mono">vs. your median</span>
                </div>
                <div className="qm-chart" style={{ height: CHART }}>
                  <span className="qm-median" style={{ bottom: SCALE }} data-on={s.bars || undefined}>
                    <span className="qm-median__label">1.0×</span>
                  </span>
                  {POSTS.map((m, i) => {
                    const lead = i === LEAD
                    const h = lead && !s.lead ? 1.1 * SCALE : m * SCALE
                    return (
                      <span
                        key={i}
                        className="qm-bar"
                        data-lead={lead || undefined}
                        data-target={lead ? "lead-bar" : undefined}
                        data-on={s.bars || undefined}
                        style={{ height: h, transitionDelay: s.bars && !s.lead ? `${i * 18}ms` : "0ms" }}
                      />
                    )
                  })}
                </div>
                <div className="qm-row" data-lead>
                  <span className="qm-post">We stopped doing standups for a month.</span>
                  <span className="qm-multiple">
                    <Count value={s.lead ? 3.4 : 1.1} format={(n) => n.toFixed(1)} duration={700} />
                    <span className="qm-x">×</span>
                  </span>
                </div>
                <div className="qm-row">
                  <Bar w={188} h={6} tone={3} />
                  <Bar w={28} h={6} tone={2} />
                </div>
                <div className="qm-row">
                  <Bar w={152} h={6} tone={3} />
                  <Bar w={28} h={6} tone={2} />
                </div>
              </div>
              <Note at={{ x: bar.x - 30, y: bar.y + 24 }} to={top} align="end" show={s.note}>
                your best in a month
              </Note>
            </>
          )
        }}
      </Stage>
    </div>
  )
}

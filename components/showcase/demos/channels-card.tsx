"use client"

/*
 * Feature card: "One idea, a different first line per channel."
 *
 * Started from Stageshow's examples/stacked-cards (MIT; see ../NOTICE.md):
 * components at one width and one left edge, a small gap, the lowest one
 * running off the bottom. The story is what the system does, so no cursor:
 *
 *   1. The idea sits at the top, in a quiet well: one thing you said.
 *   2. A post for each channel drops in under it, one after another, each
 *      opening on its own first line. The bodies are the same idea, so they
 *      stay filler, at the same widths on every card.
 *   3. YouTube Shorts gets a title in search terms, because Shorts is a
 *      search surface (docs/vision.md).
 *
 * Plays once, as the card comes into view, and holds all three.
 */

import type { Act } from "../act"
import { usePictureWidth } from "../bento"
import { Collapse } from "../motion/collapse"
import { Stage } from "../stage"
import { Bar } from "../window"
import "./channels-card.css"

type S = { shown: number }
const initial: S = { shown: 0 }
const POSTER: S = { shown: 3 }

const POSTS = [
  { channel: "LinkedIn", slot: "Tue 08:00", first: "Per-seat pricing cost us every small team." },
  { channel: "X", slot: "Tue 12:30", first: "Our pricing page was a tax on hiring." },
  { channel: "YouTube Shorts", slot: "Wed 17:00", first: "Per-seat vs flat pricing for small teams" },
]

async function script(a: Act<S>) {
  await a.wait(500)
  for (let i = 1; i <= POSTS.length; i++) {
    await a.set({ shown: i })
    await a.wait(520)
  }
}

export function ChannelsCard() {
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
        className="qc"
      >
        {(s) => (
          <div className="qc-stack">
            <div className="qc-idea">
              <span className="qc-mono">One idea</span>
              <span className="qc-idea__text">Per-seat pricing, and the small teams it lost us</span>
            </div>
            {POSTS.map((p, i) => (
              <Collapse key={p.channel} open={s.shown > i} reveal="drop">
                <div className="qc-post">
                  <div className="qc-post__head">
                    <span className="qc-channel">{p.channel}</span>
                    <span className="qc-mono">{p.slot}</span>
                  </div>
                  <div className="qc-first">{p.first}</div>
                  <div className="qc-body">
                    <Bar w="78%" h={6} tone={3} />
                  </div>
                </div>
              </Collapse>
            ))}
          </div>
        )}
      </Stage>
    </div>
  )
}

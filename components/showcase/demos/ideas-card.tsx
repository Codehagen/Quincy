"use client"

/*
 * Feature card: "You ship. Quincy finds the idea."
 *
 * Started from ./channels-card.tsx (itself after Stageshow's
 * examples/stacked-cards, MIT; see ../NOTICE.md): one left edge, one width,
 * the lowest object running off the bottom. The story is what the system
 * does, so there is no cursor:
 *
 *   1. The material is already there: a merged pull request, in a quiet
 *      well. Merged work is the source most ideas come from today
 *      (riff.source_id "github", 74 of 77 rows on 2026-11-15).
 *   2. The group is named by its source: "3 ideas from your merged PR".
 *   3. The ideas drop in under it, one after another. Only the first has
 *      all its words; the third is filler at the crop.
 *   4. The first idea carries "Draft this idea". It is quiet: the person
 *      has not chosen yet, and the page's one blue is Approve in the hero.
 *
 * Plays once as the card comes into view and holds all three. The poster is
 * that ending.
 */

import type { Act } from "../act"
import { usePictureWidth } from "../bento"
import { Button } from "../button"
import { Icon } from "../icon"
import { Collapse } from "../motion/collapse"
import { Stage } from "../stage"
import { Bar } from "../window"
import "./ideas-card.css"

type S = { shown: number }
const initial: S = { shown: 0 }
const POSTER: S = { shown: 3 }

async function script(a: Act<S>) {
  await a.wait(500)
  for (let i = 1; i <= 3; i++) {
    await a.set({ shown: i })
    await a.wait(480)
  }
}

export function IdeasCard() {
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
        className="qi"
      >
        {(s) => (
          <div className="qi-stack">
            <div className="qi-source">
              <span className="qi-source__icon">
                <Icon name="merge" size={14} />
              </span>
              <span className="qi-source__text">
                <span className="qi-mono">Merged · #412</span>
                <span className="qi-source__title">Signup asks for 3 fields, not 9</span>
              </span>
            </div>

            <div className="qi-group">3 ideas from your merged PR</div>

            <Collapse open={s.shown > 0} reveal="drop">
              <div className="qi-idea">
                <div className="qi-idea__text">People weren’t lazy. The form was.</div>
                <div className="qi-idea__foot">
                  <span className="qi-mono">LinkedIn · X</span>
                  <Button size="small">Draft this idea</Button>
                </div>
              </div>
            </Collapse>
            <Collapse open={s.shown > 1} reveal="drop">
              <div className="qi-idea">
                <div className="qi-idea__text">What we learned deleting six fields</div>
                <div className="qi-idea__foot">
                  <Bar w={64} h={6} tone={2} />
                </div>
              </div>
            </Collapse>
            <Collapse open={s.shown > 2} reveal="drop">
              <div className="qi-idea">
                <Bar w="70%" h={6} tone={3} />
                <div className="qi-idea__foot">
                  <Bar w={64} h={6} tone={2} />
                </div>
              </div>
            </Collapse>
          </div>
        )}
      </Stage>
    </div>
  )
}

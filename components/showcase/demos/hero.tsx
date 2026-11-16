"use client"

/*
 * The landing hero: a voice note becomes a post in the week.
 *
 * Started from Stageshow's examples/hero-demo (MIT; see ../NOTICE.md): a
 * browser window in a corner bleed, named targets, one cursor gesture and a
 * payoff that holds. Simplified to Quincy's one story:
 *
 *   1. The voice note is already there, transcribed (a finished screen).
 *   2. Quincy finds the angle: the highlighter sweeps the one sentence, and
 *      a graphite note writes in beside it.
 *   3. The draft arrives under it in three beats, each named in pen. The
 *      number sits on its own line.
 *   4. The cursor presses Approve. Quincy drafts; the person sends.
 *   5. The draft's slot flies into Thursday. It holds there.
 *
 * Plays once as it comes into view and holds the week, so data never
 * rewinds in view; the page's Replay button remounts it. The poster (reduced
 * motion, thumbnails) is that held ending.
 */

import { Highlight } from "@/components/kit"

import { BeatMark } from "../annotation"
import type { Act } from "../act"
import { Button } from "../button"
import { Icon } from "../icon"
import { Collapse } from "../motion/collapse"
import { Fly } from "../motion/fly"
import { Stage } from "../stage"
import { Bar, Window } from "../window"
import "./hero.css"

type S = {
  angle: boolean
  draft: boolean
  beats: boolean
  approved: boolean
  flying: boolean
  landed: boolean
}

const initial: S = {
  angle: false,
  draft: false,
  beats: false,
  approved: false,
  flying: false,
  landed: false,
}

const POSTER: S = {
  angle: true,
  draft: true,
  beats: true,
  approved: true,
  flying: false,
  landed: true,
}

const REST = { wide: { x: 520, y: 300 }, compact: { x: 320, y: 128 } }

async function script(a: Act<S>) {
  await a.wait(700)
  // The angle: the sweep, then the note writes in as it finishes.
  await a.set({ angle: true })
  await a.wait(1500)
  // The draft lands under the note, then its beats are named, top down.
  await a.set({ draft: true })
  await a.wait(800)
  await a.set({ beats: true })
  await a.wait(1600)
  // The person approves. Nothing goes out without that press.
  await a.move({ at: "approve", x: 0.78, y: 0.62 })
  await a.wait(220)
  await a.click()
  await a.set({ approved: true })
  await a.wait(450)
  a.mark("fly")
  if (a.layout === "wide") {
    await a.set({ flying: true })
    await a.wait(800)
  }
  await a.set({ flying: false, landed: true })
  await a.wait(300)
  await a.move("rest")
}

const DAYS = [
  { day: "Mon", bars: [118, 76] },
  { day: "Tue", bars: [92, 64] },
  { day: "Wed", bars: null },
  { day: "Thu", target: true },
  { day: "Fri", bars: [104, 58] },
] as const

function SlotChip({ hidden, target }: { hidden?: boolean; target?: string }) {
  return (
    <span
      className="qh-chip"
      data-target={target}
      style={hidden ? { visibility: "hidden" } : undefined}
    >
      <Icon name="calendar" size={14} />
      <span>Thu 08:00 · LinkedIn</span>
    </span>
  )
}

export function HeroDemo() {
  return (
    <Stage<S>
      width={880}
      height={540}
      compact={{ below: 640, width: 358, height: 730 }}
      initial={initial}
      poster={POSTER}
      script={script}
      play="once"
      cursor={{ at: REST }}
      className="qh"
    >
      {(s, rect, layout) => {
        const wide = layout === "wide"
        const week = (
          <div className="qh-week" data-crop>
            <div className="qh-week__title">This week</div>
            {DAYS.map((d) => (
              <div key={d.day} className="qh-day" data-filled={("target" in d && s.landed) || undefined}>
                <span className="qh-day__name">{d.day}</span>
                {"target" in d ? (
                  <span className="qh-slot qh-slot--open" data-landed={s.landed || undefined}>
                    <SlotChip hidden={!s.landed} target="chip-dst" />
                    <span className="qh-slot__title" data-on={s.landed || undefined}>
                      Signup form, 9 → 3
                    </span>
                  </span>
                ) : d.bars ? (
                  <span className="qh-slot">
                    <Bar w={d.bars[0]} h={6} tone={3} />
                    <Bar w={d.bars[1]} h={6} tone={2} />
                  </span>
                ) : (
                  <span className="qh-slot qh-slot--empty" />
                )}
              </div>
            ))}
          </div>
        )
        const strip = (
          <div className="qh-strip">
            {DAYS.map((d) => (
              <span
                key={d.day}
                className="qh-strip__day"
                data-busy={("bars" in d && d.bars) || undefined}
                data-filled={("target" in d && s.landed) || undefined}
              >
                {d.day}
                <span className="qh-strip__dot" />
              </span>
            ))}
          </div>
        )
        return (
          <>
            <Window url="hirequincy.com/studio" className="qh-window">
              <div className="qh-body">
                <div className="qh-chat">
                  {wide ? null : strip}
                  <div className="qh-who">You · voice note</div>
                  <div className="qh-voice">
                    <div className="qh-voice__player">
                      <span className="qh-play">
                        <Icon name="play" size={14} stroke={2} />
                      </span>
                      <span className="qh-wave" aria-hidden>
                        {WAVE.map((h, i) => (
                          <span key={i} style={{ height: h }} />
                        ))}
                      </span>
                      <span className="qh-mono">0:48</span>
                    </div>
                    <div className="qh-transcript">
                      …so we cut the signup form from nine fields to three, and a
                      week later 68% finish it.
                    </div>
                    <BeatMark label="the angle" tone="graphite" show={s.angle} delay={620}>
                      <div className="qh-transcript qh-transcript--angle">
                        <Highlight active={s.angle}>People weren’t lazy. The form was.</Highlight>
                      </div>
                    </BeatMark>
                  </div>

                  <Collapse open={s.draft} reveal="drop" from="below">
                    <div className="qh-who qh-who--quincy">Quincy · draft for LinkedIn</div>
                    <div className="qh-draft">
                      <BeatMark label="what I did" show={s.beats}>
                        <div className="qh-line">I cut our signup form from nine fields to three.</div>
                      </BeatMark>
                      <BeatMark label="what happened" show={s.beats} delay={140}>
                        <div className="qh-line">A week later, finished signups:</div>
                        <div className="qh-figure">41% → 68%</div>
                      </BeatMark>
                      <BeatMark label="what it meant" show={s.beats} delay={280}>
                        <div className="qh-line">People weren’t lazy. The form was.</div>
                      </BeatMark>
                      <div className="qh-actions">
                        <SlotChip hidden={wide && (s.flying || s.landed)} target="chip-src" />
                        <span className="qh-spacer" />
                        <Button size="large">Edit</Button>
                        <Button
                          size="large"
                          variant="primary"
                          data-target="approve"
                          icon={s.approved ? <Icon name="check" size={16} stroke={2} /> : undefined}
                        >
                          {s.approved ? "Approved" : "Approve"}
                        </Button>
                      </div>
                    </div>
                  </Collapse>
                </div>
                {wide ? week : null}
              </div>
            </Window>

            {wide && !s.landed ? (
              <Fly from={rect("chip-src")} to={rect("chip-dst")} go={s.flying}>
                <SlotChip />
              </Fly>
            ) : null}

            <span
              data-target="rest"
              style={{ position: "absolute", left: REST[layout].x, top: REST[layout].y }}
            />
          </>
        )
      }}
    </Stage>
  )
}

// A recorded voice, not a sine: louder in the middle of each phrase.
const WAVE = [
  6, 10, 14, 9, 16, 20, 13, 8, 12, 18, 22, 15, 10, 6, 9, 14, 19, 12, 7, 11, 17,
  21, 16, 9, 6, 10, 15, 11, 7, 5,
]

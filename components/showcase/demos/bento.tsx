"use client"

/*
 * The landing page's feature grid, planned as one picture.
 *
 * Started from Stageshow's examples/bento (MIT; see ../NOTICE.md), "hero
 * and strip". The tile list, written before any tile was built:
 *
 *   Tile     Span   Kind       The one thing                       Moves
 *   Replies  2 × 1  Hero UI    one comment and its drafted answer  Send settles to Sent
 *   Yes      1 × 1  Stat       "0", published without your yes     holds still
 *   Sources  1 × 1  Object     three kinds of raw material, paper  the top card settles
 *   People   1 × 1  Diagram    who replied to which post           the dots fill in
 *   Walk     1 × 1  Phone UI   a voice note recording              the wave comes up
 *
 * Two of five tiles show product UI, and only the hero has window chrome.
 * Neighbours differ across and down: the window sits over paper and a
 * diagram, the type tile over the phone. No real string, name or mark
 * appears in two tiles. Depth leads (vision.md): the hero is the reply,
 * not the volume.
 *
 * Each picture is its own Stage at 1:1, pinned to its tile's bottom and
 * cropped by it. Each tile plays one beat, once, as the grid scrolls in,
 * 110ms after the tile before it in reading order.
 */

import { LiveDot } from "@/components/kit"
import type { Act } from "../act"
import { Bento, Tile, usePictureWidth } from "../bento"
import { Button } from "../button"
import { Icon } from "../icon"
import { Phone } from "../phone"
import { Stage } from "../stage"
import { Bar, Window } from "../window"
import "./bento.css"

const STEP = 110
const LEAD = 450

type Beat = { on: boolean }
const before: Beat = { on: false }
const after: Beat = { on: true }
const beat = (i: number) => async (a: Act<Beat>) => {
  await a.wait(LEAD + i * STEP)
  await a.set({ on: true })
}

/* ---------------- Replies (hero) ---------------- */

function Replies() {
  const [picture, width] = usePictureWidth(600)
  const compact = width < 520
  return (
    <Tile
      area="replies"
      lead="Reply to everyone."
      rest="Quincy drafts an answer to every comment on your post. You send it."
      picture={
        <div ref={picture}>
          <Stage<Beat> width={width} height={compact ? 280 : 270} initial={before} poster={after} play="once" script={beat(0)} className="qb-stage">
            {(s) => (
              <Window url="hirequincy.com/replies" className="qb-window" data-compact={compact || undefined}>
                <div className="qb-replies">
                  <div className="qb-comment">
                    <span className="qb-avatar">ID</span>
                    <div className="qb-comment__text">
                      <div className="qb-comment__who">
                        <span className="qb-name">Ines Duarte</span>
                        <span className="qb-mono">2h</span>
                      </div>
                      <div className="qb-said">Did you keep the email field?</div>
                      <div className="qb-draft">
                        <div className="qb-mono">Your reply · drafted</div>
                        <div className="qb-said qb-said--reply">
                          Yes: email, password, company. The other six now come after signup.
                        </div>
                        <div className="qb-draft__actions">
                          <Button size="large">Edit</Button>
                          <Button
                            size="large"
                            variant="primary"
                            icon={s.on ? <Icon name="check" size={16} stroke={2} /> : undefined}
                          >
                            {s.on ? "Sent" : "Send"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                  {[
                    [92, 168],
                    [74, 132],
                  ].map(([name, line], i) => (
                    <div key={i} className="qb-comment qb-comment--filler">
                      <span className="qb-disc" />
                      <div className="qb-comment__text">
                        <Bar w={name} h={6} tone={4} />
                        <Bar w={line} h={6} tone={2} />
                      </div>
                    </div>
                  ))}
                </div>
              </Window>
            )}
          </Stage>
        </div>
      }
    />
  )
}

/* ---------------- Yes (stat) ---------------- */

// Type, not a picture: page text in the tile. A zero that holds still; a
// count-down to nothing would be data rewinding for show.
function Yes() {
  return (
    <Tile area="yes">
      <div className="qb-stat">
        <span className="qb-stat__lead">Posts published without your yes</span>
        <span className="qb-stat__number">0</span>
        <span className="qb-stat__label">Quincy drafts and schedules. Only you send.</span>
      </div>
    </Tile>
  )
}

/* ---------------- Sources (object) ---------------- */

function Sources() {
  return (
    <Tile
      area="sources"
      lead="Start with anything."
      rest="A walk, a call, a pull request you merged."
      pictureFit="center"
      picture={
        <Stage<Beat> width={360} height={200} initial={before} poster={after} play="once" script={beat(2)} className="qb-stage">
          {(s) => (
            <div className="qb-pile">
              <div className="qb-paper" data-at="back" aria-hidden>
                <span className="qb-paper__icon"><Icon name="call" size={16} /></span>
                <Bar w={120} h={6} tone={3} />
                <Bar w={88} h={6} tone={2} />
              </div>
              <div className="qb-paper" data-at="middle" aria-hidden>
                <span className="qb-paper__icon"><Icon name="mic" size={16} /></span>
                <Bar w={104} h={6} tone={3} />
                <Bar w={140} h={6} tone={2} />
              </div>
              <div className="qb-paper" data-at="top" data-on={s.on || undefined}>
                <span className="qb-paper__icon"><Icon name="merge" size={16} /></span>
                <span className="qb-paper__title">Merged #418</span>
                <span className="qb-paper__line">The weekly digest goes out on Mondays</span>
              </div>
            </div>
          )}
        </Stage>
      }
    />
  )
}

/* ---------------- People (diagram) ---------------- */

// Rows are people, columns your last twelve posts, a dot where they replied.
// Two rows are nearly full: the regulars. Only the first is named.
const PEOPLE = [
  "111101111111",
  "100010000100",
  "011011101111",
  "000100001000",
  "010000100010",
  "001000010001",
]

function People() {
  const [picture, width] = usePictureWidth()
  return (
    <Tile
      area="people"
      lead="Know who keeps showing up."
      rest="The people who answer every post, by name."
      picture={
        <div ref={picture}>
          <Stage<Beat> width={width} height={190} initial={before} poster={after} play="once" script={beat(3)} className="qb-stage">
            {(s) => (
              <div className="qb-grid" data-on={s.on || undefined}>
                {PEOPLE.map((row, r) => (
                  <div key={r} className="qb-grid__row" data-regular={r === 0 || undefined}>
                    {r === 0 ? (
                      <span className="qb-grid__who">
                        <span className="qb-name">Marcus Lee</span>
                        <span className="qb-mono">11 of 12</span>
                      </span>
                    ) : (
                      <span className="qb-grid__who">
                        <Bar w={48 + ((r * 17) % 30)} h={6} tone={r === 2 ? 4 : 2} />
                      </span>
                    )}
                    {[...row].map((c, i) => (
                      <span
                        key={i}
                        className="qb-dot"
                        data-hit={c === "1" || undefined}
                        style={{ transitionDelay: `${i * 40 + r * 20}ms` }}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </Stage>
        </div>
      }
    />
  )
}

/* ---------------- Walk (phone) ---------------- */

const WAVE = [10, 18, 26, 16, 34, 44, 28, 14, 22, 38, 48, 30, 18, 10, 16, 28, 40, 24, 12, 20]

function Walk() {
  return (
    <Tile
      area="walk"
      lead="Talk on a walk."
      rest="Quincy keeps the part worth posting."
      pictureFit="center"
      picture={
        <Stage<Beat> width={360} height={210} initial={before} poster={after} play="once" script={beat(4)} className="qb-stage">
          {(s) => (
            <Phone width={250} frame="silver" className="qb-phone">
              <div className="qb-rec">
                <div className="qb-rec__state">
                  <LiveDot>Recording</LiveDot>
                </div>
                <div className="qb-rec__time">0:48</div>
                <div className="qb-rec__wave" data-on={s.on || undefined} aria-hidden>
                  {WAVE.map((h, i) => (
                    <span key={i} style={{ height: h, transitionDelay: `${i * 30}ms` }} />
                  ))}
                </div>
              </div>
            </Phone>
          )}
        </Stage>
      }
    />
  )
}

export function BentoDemo() {
  return (
    <Bento className="qb">
      <Replies />
      <Yes />
      <Sources />
      <People />
      <Walk />
    </Bento>
  )
}

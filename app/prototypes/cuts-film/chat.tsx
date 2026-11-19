"use client"

import { useLayoutEffect, useRef } from "react"
import { TaskFold } from "@/components/ai-elements/task"
import { ToolRow } from "@/components/ai-elements/tool"
import { CheckFrames } from "@/components/editor/self-check/check-frames"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Message, MessageContent } from "@/components/ui/message"
import "@/components/editor/cuts-shadcn.css"
import * as C from "./chat-times"
import { Composer } from "./composer"
import { MAIN_PARK, PRESSES } from "./main-run"
import { easeInOut, easeOut, progress } from "./motion"
import { Typing } from "./parts"
import { LOCAL, TAKE_ASPECT } from "./take"
import { CUTS } from "./three-run"
import { ASK_TEXT, AT } from "./timeline"

// The chat margin as the editor lays it out (header, thread, composer; shadcn inside .cuts-shadcn). One entrance
// per moment: the person's message slides up (the margin's 260 ms rise), Quincy's rows appear as they happen.

const FRAMES = [6.2, 9.4, 16.8].map((s, i) => ({ atUs: s * 1e6, dataUrl: `${LOCAL}/film/check-${i + 1}.jpg` }))
const PAUSES = ["Pause at 0:00 · 5.2 s", "Pause at 0:10 · 1.7 s", "Pause at 0:19 · 1.3 s"]

/** The margin's message entrance: 10 px up and in, 260 ms on its curve. */
const rise = (t: number, at: number) => {
  const p = easeOut(progress(t, at, 260))
  return p >= 1 ? undefined : { opacity: p, translate: `0 ${(10 * (1 - p)).toFixed(2)}px` }
}

export function Chat({ t }: { t: number }) {
  const inner = useRef<HTMLDivElement>(null)
  // The thread scrolls once, as the three-cuts request arrives: it anchors near the top with a peek of the turn
  // before it (the margin's MessageScroller does the same), eased on the film's clock.
  useLayoutEffect(() => {
    const el = inner.current
    const three = el?.querySelector<HTMLElement>('[data-film-region="three"]')
    if (!el) return
    const scroll = three ? Math.max(0, three.offsetTop - 64) * easeInOut(progress(t, C.ASK3_AT, 520)) : 0
    el.style.transform = scroll ? `translateY(${(-scroll).toFixed(2)}px)` : ""
    el.dataset.filmScroll = scroll.toFixed(2)
  })
  const settled = t >= C.FOLD_AT
  const done3 = t >= C.CUTS_DONE_AT
  return (
    <div className="cuts-shadcn flex h-full min-h-0 flex-col text-sm">
      <div className="flex h-12 shrink-0 items-center border-b border-kit-hairline px-kit-row-x">
        <span className="font-medium">Cut with Quincy</span>
      </div>
      <div data-film-region="thread" className="min-h-0 flex-1 overflow-hidden">
        <div ref={inner} data-film-scroll="0" className="relative flex flex-col gap-5 px-kit-row-x py-3">
        {t >= C.READ_AT && (
          <div data-film-region="read" style={rise(t, C.READ_AT)}>
            <ToolRow status={t >= C.READ_DONE ? undefined : "running"} title={t >= C.READ_DONE ? "Read the take" : "Reading the take"} description={t >= C.READ_DONE ? "0:21.3 · three long pauses" : undefined} />
          </div>
        )}
        {t >= C.BUBBLE_AT && (
          <div style={rise(t, C.BUBBLE_AT)}>
            <Message align="end">
              <MessageContent>
                <Bubble align="end" variant="muted">
                  <BubbleContent>{ASK_TEXT}</BubbleContent>
                </Bubble>
              </MessageContent>
            </Message>
          </div>
        )}
        {t >= C.RUN_AT && (
          <div data-film-region="receipt" className="flex flex-col gap-3" style={rise(t, C.RUN_AT)}>
            <TaskFold
              settled={settled}
              title={settled ? "Removed 8.2 s of pauses · 0:21.3 → 0:13.1" : `Removing pauses · ${PRESSES.filter((at) => t >= at).length} of 3`}
              steps={PAUSES.map((title, i) => ({ id: String(i), title, status: t >= PRESSES[i]! ? undefined : "running" }))}
            />
            {t >= C.CAPTIONED_AT && <div style={rise(t, C.CAPTIONED_AT)}><ToolRow status={undefined} title="Added 7 captions" description="burned in, clear of the chin" /></div>}
            {t >= C.LOOK_AT && (
              <div style={rise(t, C.LOOK_AT)}>
                <CheckFrames
                  aspect={TAKE_ASPECT}
                  check={t >= C.LOOKED_AT ? { status: "done", frames: FRAMES, say: "Your face stays in frame and every caption reads." } : { status: "looking", frames: FRAMES.filter((_, i) => t >= C.FRAME_AT(i)) }}
                />
              </div>
            )}
          </div>
        )}
        {t >= C.ASK3_AT && (
          <div data-film-region="three" style={rise(t, C.ASK3_AT)}>
            <TaskFold
              settled={done3}
              title={done3 ? "Made three cuts from one take" : "Making three cuts"}
              steps={CUTS.map((c) => ({ id: c.id, title: `${c.letter} · ${c.beats.map((b) => b.work.say).join(", ")}`, status: t >= c.doneAt ? undefined : "running" }))}
            />
          </div>
        )}
        {t >= C.SAY_AT && (
          <div data-film-region="say" style={rise(t, C.SAY_AT)}>
            <Message>
              <MessageContent className="leading-snug">
                <p>
                  <Typing text={C.SAY} times={C.SAY_TIMES} t={t} />
                </p>
              </MessageContent>
            </Message>
          </div>
        )}
        </div>
      </div>
      <div data-film-region="composer" className="shrink-0 px-kit-row-x pt-2 pb-kit-row-x">
        <Composer t={t} busy={(t >= C.RUN_AT && t < MAIN_PARK) || (t >= AT.three && t < C.CUTS_DONE_AT)} />
      </div>
    </div>
  )
}

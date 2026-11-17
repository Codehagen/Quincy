"use client"

/*
 * The Cuts page's hero picture: the editor whole, the prompt, and the
 * receipt of what it did arriving line by line (docs/design/decisions-landing.md, "Cuts hero"
 * has the pick and the two that lost). It tells one true run
 * (lib/editor/agent.ts): the person asks in a sentence, the tools cut the
 * pauses, build the captions from the transcript and punch in on one clip,
 * and the cut waits.
 *
 * It plays once when seen and holds its ending (docs/design/showcase.md).
 * Under reduced motion it shows its ending at once. Every line that has not
 * arrived yet keeps its room, so nothing below it moves.
 */

import { Mono } from "@/components/kit"
import { Friend } from "@/components/mascot"
import { Stage, Window } from "@/components/showcase"
import { Perched } from "@/components/showcase/demos/perched"
import { useArrival } from "@/components/showcase/demos/use-arrival"

import { PRODUCT } from "./name"
import { ExportChip, Frame, Lanes, RECEIPT, Receipt, YouSaid } from "./pictures"
import { CUT_SECONDS, PROMPT, RAW_SECONDS, SEGMENTS, SOURCE, clock } from "./take"

const CUT = clock(CUT_SECONDS)
const RAW = clock(RAW_SECONDS)
const CLOSING = `It runs ${CUT} in ${SEGMENTS.length} clips. Every change is an edit you can undo.`

const LABEL = `The ${PRODUCT} editor on ${SOURCE}, a 9:16 talking head. You asked: ${PROMPT} Quincy replied with what it did. ${RECEIPT.map(
  ([did, result]) => `${did}, ${result}.`
).join(
  " "
)} The timeline closed up from ${RAW} to ${CUT}, a caption lane filled in, and the frame pushed in on the line Sixty-eight percent. ${CLOSING}`

/** "Cutting" and "done" in one cell, so the name beside them never moves. */
function Status({ done }: { done: boolean }) {
  return (
    <span className="inline-grid">
      <span className={`col-start-1 row-start-1 ${done ? "invisible" : ""}`}>
        <span className="inline-flex items-center gap-2">
          <Friend size={20} state="reading" className="shrink-0" />
          <span className="min-w-0">
            Cutting
          </span>
        </span>
      </span>
      <span className={`col-start-1 row-start-1 ${done ? "" : "invisible"}`}>
        <Mono>done</Mono>
      </span>
    </span>
  )
}

function AskChat({ shown }: { shown: number }) {
  const done = shown >= 4
  return (
    <div className="flex flex-col gap-3">
      <YouSaid>{PROMPT}</YouSaid>
      <div className="flex flex-col gap-1.5">
        <span className="flex items-center gap-2.5">
          <span className="font-kit-strong">Quincy</span>
          <Status done={done} />
        </span>
        <Receipt shown={shown - 1} />
        <p
          data-on={done || undefined}
          className="mt-1 opacity-0 transition-opacity duration-(--kit-duration-enter) ease-kit-out data-on:opacity-100 motion-reduce:transition-none"
        >
          {CLOSING}
        </p>
      </div>
    </div>
  )
}

export function Hero() {
  const [ref, shown] = useArrival<HTMLDivElement>(4, 1300)
  const cut = shown >= 2
  const captions = shown >= 3
  const punch = shown >= 4
  const caption = captions ? "Sixty-eight percent" : undefined

  return (
    <div ref={ref} role="img" aria-label={LABEL} className="pointer-events-none select-none">
      <Stage<object> width={1072} height={560} compact={{ below: 640, width: 360, height: 540 }} unframed>
        {(_, __, layout) =>
          layout === "compact" ? (
            <div className="relative h-[540px] w-[360px] overflow-hidden rounded-kit-stage bg-kit-stage text-kit-ink">
              <div className="absolute top-[64px] left-[20px] w-[320px]">
                <Perched state={punch ? "waiting" : "reading"} at="232px">
                  <div className="flex flex-col gap-4 rounded-kit-object bg-kit-object p-kit-pad pb-16 shadow-kit-object">
                    <AskChat shown={shown} />
                    <div className="rounded-kit-control-inner bg-kit-stage p-2">
                      <Lanes width={272} cut={cut} captions={captions} compact fit="cut" />
                    </div>
                  </div>
                </Perched>
              </div>
            </div>
          ) : (
            <div className="relative h-[560px] w-[1072px] overflow-hidden rounded-kit-stage bg-kit-stage text-kit-ink">
              <div className="absolute top-[52px] left-[56px]">
                <Perched state={punch ? "waiting" : "reading"} at="760px">
                  <Window url="hirequincy.com/cuts" style={{ width: 960, height: 600 }}>
                    <div className="grid h-full grid-cols-[1fr_320px] text-kit-body">
                      <div className="flex flex-col gap-4 px-8 pt-4">
                        <div className="flex items-center justify-between gap-4">
                          <span className="flex items-baseline gap-2.5">
                            <span className="font-kit-strong">Onboarding update</span>
                            <Mono>{SOURCE} · 9:16</Mono>
                          </span>
                          <ExportChip />
                        </div>
                        <div className="grid place-items-center rounded-kit-control bg-kit-stage py-4">
                          <Frame width={128} caption={caption} punch={punch} playhead={cut ? 0.48 : 0.2} />
                        </div>
                        <Lanes width={560} cut={cut} captions={captions} fit="cut" />
                      </div>
                      <div className="border-l border-kit-hairline px-5 pt-5">
                        <AskChat shown={shown} />
                      </div>
                    </div>
                  </Window>
                </Perched>
              </div>
            </div>
          )
        }
      </Stage>
    </div>
  )
}

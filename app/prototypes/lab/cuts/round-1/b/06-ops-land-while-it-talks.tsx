"use client"

/*
 * 06 — The timeline moves while it talks.
 *
 * The run as it happens. Each tool call is a line in the chat and, at the
 * same moment, an edit on the lanes: the pauses are picked out, then gone,
 * then the captions land, then the zoom. While the run works the lanes are
 * held read-only, with the reason over them and the friend at work. It rests
 * mid-run; "Replay the run" walks it from the start. Under reduced motion
 * the replay jumps to the end. No accent.
 */

import {
  PlayIcon,
  Scissor01Icon,
  SubtitleIcon,
  ZoomInAreaIcon,
} from "@hugeicons/core-free-icons"

import { Button } from "@/components/kit"

import { CUT_SECONDS, TAKE, fmt } from "../fixture"
import { EditorBar, Frame, Op, Picture, Quincy, Timeline, You, useRun } from "../parts"

const OPS = [
  { icon: Scissor01Icon, say: "Removing 2 pauses", done: "Removed 2 pauses", detail: "4.1 s" },
  { icon: Scissor01Icon, say: "Cutting the “um”", done: "Cut the “um”", detail: "0.4 s" },
  { icon: SubtitleIcon, say: "Adding captions", done: "Added captions", detail: `${TAKE.words} words` },
  { icon: ZoomInAreaIcon, say: "Pushing in on the strong line", done: "Pushed in", detail: "0:16" },
] as const

export function OpsLandWhileItTalks() {
  const { step, playing, play } = useRun(6, 1000, 3)
  const finished = step === 5
  const state = step === 0 ? "raw" : step === 1 ? "marked" : "cut"
  const opState = (i: number) => (step > i + 1 ? "done" : step === i + 1 ? "now" : "next")

  return (
    <Frame>
      <EditorBar
        seconds={state === "cut" ? CUT_SECONDS : TAKE.seconds}
        right={
          <Button variant="quiet" icon={PlayIcon} onClick={play} pending={playing} pendingLabel="Replaying">
            Replay the run
          </Button>
        }
      />
      <div className="flex h-[664px]">
        <div className="flex min-w-0 flex-1 flex-col items-center gap-5 px-6 pt-6">
          <Picture
            shape="16:9"
            width={520}
            punch={step >= 5}
            caption={step >= 4 ? "They were in the way." : undefined}
            time={fmt(16.9)}
          />
          <div className="rounded-kit-object bg-kit-object px-4 pt-3 pb-4 shadow-kit-object">
            <Timeline
              width={600}
              state={state}
              captions={step >= 4}
              zoom={step >= 5}
              playhead={state === "cut" ? 16.9 : 21.4}
              held={finished ? undefined : "Cutting. The timeline is read-only until I finish."}
            />
          </div>
        </div>

        <aside className="flex w-[300px] shrink-0 flex-col gap-4 border-l border-kit-hairline px-5 pt-5">
          <You time="10:42">Tighten it and add captions. Push in where it matters.</You>
          <Quincy mood={finished ? "found" : "writing"} label={finished ? "Quincy" : "Quincy · cutting"}>
            {OPS.map((o, i) => {
              const s = opState(i)
              return (
                <Op
                  key={o.say}
                  icon={o.icon}
                  state={s}
                  say={s === "done" ? o.done : o.say}
                  detail={s === "done" ? o.detail : undefined}
                />
              )
            })}
            {finished ? (
              <p className="pt-1">
                {fmt(TAKE.seconds)} is now {fmt(CUT_SECONDS)}. One run, so one undo takes all four back.
              </p>
            ) : null}
          </Quincy>
        </aside>
      </div>
    </Frame>
  )
}

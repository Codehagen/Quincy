"use client"

import * as React from "react"
import { Mic01Icon, StopIcon } from "@hugeicons/core-free-icons"

import { Button, Card, Mono, Stage, Text } from "@/components/kit"
import { Friend } from "@/components/mascot"

/** A take shorter than this is a mis-tap, not a thought. */
const MIN_SECONDS = 2
/** Ceiling on one take, so a forgotten tap does not run forever. */
const MAX_SECONDS = 180

type Phase = "idle" | "rec" | "short" | "kept"

const STATUS: Record<Phase, string> = {
  idle: "Tap, talk, tap again. However it comes out.",
  rec: "Listening. Tap Stop when you are done.",
  short: "Too short to keep. Say a bit more.",
  kept: "Kept. I am reading it now, at the top of your riffs.",
}

function clock(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

/**
 * Capture, at the top of the page: capture is the page, the queue is what
 * came back (components/riffs/instrument.tsx). Simulated: no microphone
 * opens, so the prototype never asks for permission.
 *
 * One button that changes its label, not two that swap, so keyboard focus
 * stays on it between Record and Stop.
 */
export function Recorder({
  isAction,
  onKept,
}: {
  /** True when nothing is waiting: recording is then the one next step. */
  isAction: boolean
  onKept: (seconds: number) => void
}) {
  const [phase, setPhase] = React.useState<Phase>("idle")
  const [seconds, setSeconds] = React.useState(0)
  const startedAt = React.useRef(0)
  const recording = phase === "rec"

  const stop = React.useCallback(
    (took: number) => {
      if (took < MIN_SECONDS) {
        setPhase("short")
        return
      }
      setPhase("kept")
      onKept(took)
    },
    [onKept],
  )

  React.useEffect(() => {
    if (!recording) return
    const id = window.setInterval(() => {
      const s = Math.floor((performance.now() - startedAt.current) / 1000)
      setSeconds(s)
      if (s >= MAX_SECONDS) stop(s)
    }, 250)
    return () => window.clearInterval(id)
  }, [recording, stop])

  const press = () => {
    if (recording) {
      stop(Math.floor((performance.now() - startedAt.current) / 1000))
      return
    }
    startedAt.current = performance.now()
    setSeconds(0)
    setPhase("rec")
  }

  return (
    <Stage
      lead="Say what happened."
      rest="I read through the false starts and find the post in it. Nothing goes anywhere until you pick an angle."
    >
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant={isAction ? "action" : "quiet"}
            icon={recording ? StopIcon : Mic01Icon}
            aria-pressed={recording}
            onClick={press}
          >
            {recording ? "Stop" : "Record a thought"}
          </Button>
          {recording ? (
            <>
              <span className="inline-flex items-center gap-2">
                <Friend size={20} state="listening" className="shrink-0" />
                <span className="min-w-0">
                  Recording
                </span>
              </span>
              <Mono tone="ink">{clock(seconds)}</Mono>
            </>
          ) : null}
        </div>
        <div className="mt-3" aria-live="polite">
          <Text variant="small" tone="muted">
            {STATUS[phase]}
          </Text>
        </div>
      </Card>
    </Stage>
  )
}

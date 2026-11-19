"use client"

/*
 * 18 — Export, honestly.
 *
 * The MP4 is rendered in this browser tab, so the page says exactly that:
 * the real frame count, what is done and what is next, a time left that is
 * a measurement, and the one thing that would stop it (closing the tab).
 * The file at the end is named after the scene. It rests part-way;
 * "Export again" walks the count, and reduced motion jumps to the file.
 * No accent.
 */

import { HugeiconsIcon } from "@hugeicons/react"
import { Download04Icon, File01Icon, Tick02Icon } from "@hugeicons/core-free-icons"

import { Button, Progress, Text } from "@/components/kit"
import { Friend } from "@/components/mascot"

import { CUT_SECONDS, fmt } from "../fixture"
import { Frame, PhoneFrame, Picture, useRun } from "../parts"

const FRAMES = Math.round(CUT_SECONDS * 30) // 975 at 30 fps
const STEPS = 11

export function ExportHonestly() {
  const { step, playing, play } = useRun(STEPS, 420, 4)
  const pct = Math.round((step / (STEPS - 1)) * 100)
  const frames = Math.round((FRAMES * pct) / 100)
  const done = step === STEPS - 1
  const left = Math.max(0, Math.round(((100 - pct) / 100) * 52))

  const stages = [
    { label: "Captions laid in", on: true },
    { label: `Frames, ${frames} of ${FRAMES}`, on: done, now: !done },
    { label: "Sound", on: done },
    { label: "MP4 written", on: done },
  ]

  return (
    <Frame>
      <div className="flex h-14 items-center justify-between border-b border-kit-hairline px-6">
        <span className="flex items-baseline gap-2.5">
          <span className="text-kit-meta text-kit-ink-muted">Cuts</span>
          <span className="font-kit-strong">9:16 for X</span>
          <span className="font-kit-mono text-kit-mono text-kit-ink-muted">{fmt(CUT_SECONDS)}</span>
        </span>
        <Button variant="quiet" size="sm" onClick={play} pending={playing} pendingLabel="Exporting">
          Export again
        </Button>
      </div>

      <div className="flex items-start gap-12 px-16 pt-10">
        <PhoneFrame width={190}>
          <Picture
            shape="9:16"
            width={190}
            rounded=""
            caption="They were in the way."
            time={fmt((CUT_SECONDS * pct) / 100)}
          />
        </PhoneFrame>

        <div className="flex min-w-0 flex-1 flex-col gap-5 pt-2">
          <span className="flex items-center gap-2 text-kit-small text-kit-ink-muted">
            <Friend size={20} state={done ? "found" : "writing"} />
            {done ? "Exported" : "Exporting in this tab"}
          </span>

          <div className="rounded-kit-object bg-kit-object p-5 shadow-kit-object">
            <Progress label="Export" value={pct} count />
            <div className="mt-2 flex justify-between font-kit-mono text-kit-mono-sm text-kit-ink-muted tabular-nums">
              <span>
                frame {frames} of {FRAMES}
              </span>
              <span>{done ? "done" : `about ${left} s left`}</span>
            </div>
            <ul className="mt-5 flex flex-col gap-2">
              {stages.map((s) => (
                <li key={s.label} className="flex items-center gap-2.5">
                  <span
                    data-on={s.on || undefined}
                    className="grid size-[18px] place-items-center rounded-full text-kit-ink-muted shadow-kit-inset data-on:bg-kit-well data-on:text-kit-ink data-on:shadow-none"
                  >
                    {s.on ? <HugeiconsIcon icon={Tick02Icon} size={11} strokeWidth={2.5} aria-hidden /> : null}
                  </span>
                  <span className={s.on || s.now ? "" : "text-kit-ink-muted"}>{s.label}</span>
                </li>
              ))}
            </ul>
          </div>

          {done ? (
            <div className="flex items-center justify-between rounded-kit-control bg-kit-object px-4 py-3 shadow-kit-control">
              <span className="flex items-center gap-2.5">
                <HugeiconsIcon icon={File01Icon} size={16} className="text-kit-ink-muted" aria-hidden />
                <span className="font-kit-strong">onboarding-x-9x16.mp4</span>
                <span className="text-kit-ink-muted">38 MB</span>
              </span>
              <Button variant="action" icon={Download04Icon}>
                Save
              </Button>
            </div>
          ) : (
            <Text variant="small" tone="muted">
              Keep this tab open. Closing it stops the export; the cut itself is saved either way.
            </Text>
          )}
        </div>
      </div>
    </Frame>
  )
}

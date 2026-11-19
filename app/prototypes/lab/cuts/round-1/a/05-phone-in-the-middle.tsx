"use client"

/*
 * 05 — The phone in the middle.
 *
 * The target is a 9:16 for X and LinkedIn, so the preview is a phone, at
 * the size the cut will be watched. Over the timeline a row of scenes holds
 * every cut of this one recording; the picked scene is the well grey, and
 * the lanes below are that scene's. Chat is a rail on the right. No accent.
 */

import { HugeiconsIcon } from "@hugeicons/react"
import { Add01Icon, Download04Icon, Linkedin01Icon, NewTwitterIcon, Video01Icon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/kit"

import { CUT_SECONDS, fmt, fmtWhole } from "../fixture"
import { ComposerStill, EditorBar, Frame, PhoneFrame, Picture, Quincy, Timeline, You } from "../parts"

const SCENES = [
  { id: "x", icon: NewTwitterIcon, label: "9:16 for X", seconds: CUT_SECONDS, on: true },
  { id: "li", icon: Linkedin01Icon, label: "9:16 for LinkedIn", seconds: 34.2, on: false },
  { id: "full", icon: Video01Icon, label: "16:9, whole take", seconds: 37, on: false },
] as const

export function PhoneInTheMiddle() {
  return (
    <Frame>
      <EditorBar
        seconds={CUT_SECONDS}
        right={
          <Button variant="action" icon={Download04Icon}>
            Export this cut
          </Button>
        }
      />
      <div className="flex h-[664px]">
        <div className="flex min-w-0 flex-1 flex-col items-center px-6 pt-5">
          <PhoneFrame width={196}>
            <Picture shape="9:16" width={196} rounded="" caption="Before, 48% of new people finished setup." time={fmt(11.2)} />
          </PhoneFrame>

          <div role="radiogroup" aria-label="Scenes" className="mt-5 flex w-full items-center gap-1.5">
            {SCENES.map((s) => (
              <span
                key={s.id}
                role="radio"
                aria-checked={s.on}
                className="flex h-8 items-center gap-1.5 rounded-kit-control px-2.5 text-kit-small text-kit-ink-muted aria-checked:bg-kit-selected aria-checked:font-kit-strong aria-checked:text-kit-ink"
              >
                <HugeiconsIcon icon={s.icon} size={14} aria-hidden />
                {s.label}
                <span className="font-kit-mono text-kit-mono-sm text-kit-ink-muted tabular-nums">{fmtWhole(s.seconds)}</span>
              </span>
            ))}
            <span className="flex h-8 items-center gap-1 rounded-kit-control px-2 text-kit-small text-kit-ink-muted">
              <HugeiconsIcon icon={Add01Icon} size={14} aria-hidden />
              New cut
            </span>
          </div>

          <div className="mt-2 w-full rounded-kit-object bg-kit-object px-4 pt-3 pb-4 shadow-kit-object">
            <Timeline width={620} state="cut" captions zoom playhead={11.2} />
          </div>
        </div>

        <aside className="flex w-[252px] shrink-0 flex-col gap-4 border-l border-kit-hairline px-4 pt-5 pb-4 text-kit-small">
          <span className="font-kit-strong">Cut with Quincy</span>
          <You>Same take, but a LinkedIn one that keeps the numbers longer.</You>
          <Quincy mood="found">
            <p>Made it as its own scene, 0:34. The X cut is untouched.</p>
            <p className="text-kit-ink-muted">Each scene keeps its own captions, zoom and frame.</p>
          </Quincy>
          <div className="mt-auto">
            <ComposerStill placeholder="Change this scene" />
          </div>
        </aside>
      </div>
    </Frame>
  )
}

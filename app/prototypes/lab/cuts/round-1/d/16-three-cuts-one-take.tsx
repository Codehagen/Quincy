"use client"

/*
 * 16 — Three cuts from one take.
 *
 * One recording, one cut per place it goes. The take runs along the top as
 * a strip, and under it three scenes, each with its own frame, length and
 * first line: X opens on the strong line, LinkedIn keeps the numbers, the
 * wide one is the whole take tightened. A scene is picked with the well
 * grey; the lanes are one press behind it. No accent.
 */

import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import { Download04Icon, Linkedin01Icon, NewTwitterIcon, Video01Icon } from "@hugeicons/core-free-icons"

import { Button, Text } from "@/components/kit"

import { CUT_SECONDS, TAKE, fmt } from "../fixture"
import { Frame, Picture, type Shape, Waveform } from "../parts"

const CUTS: ReadonlyArray<{
  id: string
  icon: IconSvgElement
  where: string
  shape: Shape
  seconds: number
  opens: string
  caption: string
  picked?: boolean
}> = [
  {
    id: "x",
    icon: NewTwitterIcon,
    where: "X",
    shape: "9:16",
    seconds: 21.4,
    opens: "Opens on “The screens weren't the product.”",
    caption: "The screens weren't the product.",
    picked: true,
  },
  {
    id: "li",
    icon: Linkedin01Icon,
    where: "LinkedIn",
    shape: "9:16",
    seconds: CUT_SECONDS,
    opens: "Opens on “We cut it from seven screens to two.”",
    caption: "48% → 71%",
  },
  {
    id: "wide",
    icon: Video01Icon,
    where: "Your changelog",
    shape: "16:9",
    seconds: CUT_SECONDS,
    opens: "The whole take, tightened",
    caption: "So, last week we shipped the new onboarding.",
  },
]

export function ThreeCutsOneTake() {
  return (
    <Frame>
      <div className="flex h-14 items-center justify-between border-b border-kit-hairline px-6">
        <span className="flex items-baseline gap-2.5">
          <span className="text-kit-meta text-kit-ink-muted">Cuts</span>
          <span className="font-kit-strong">{TAKE.project}</span>
          <span className="text-kit-ink-muted">3 cuts</span>
        </span>
        <Button variant="action" icon={Download04Icon}>
          Export 3 cuts
        </Button>
      </div>

      <div className="px-8 pt-5">
        <div className="flex items-center justify-between pb-1.5">
          <Text as="span" variant="small" tone="muted">
            The recording · {TAKE.file} · {fmt(TAKE.seconds)}
          </Text>
        </div>
        <div className="rounded-kit-control bg-kit-well px-3 py-2">
          <Waveform from={0} to={TAKE.seconds} width={870} height={22} />
        </div>
      </div>

      <ul className="grid grid-cols-3 gap-5 px-8 pt-6">
        {CUTS.map((c) => (
          <li
            key={c.id}
            data-picked={c.picked || undefined}
            className="flex flex-col gap-3 rounded-kit-object p-3 data-picked:bg-kit-selected"
          >
            <div className="flex h-[300px] items-center justify-center rounded-kit-control bg-kit-object shadow-kit-object">
              <Picture
                shape={c.shape}
                width={c.shape === "9:16" ? 156 : 250}
                caption={c.caption}
                captionClass="text-kit-meta"
                punch={c.id === "x"}
              />
            </div>
            <div className="flex items-center justify-between px-1">
              <span className="flex items-center gap-1.5 font-kit-strong">
                <HugeiconsIcon icon={c.icon} size={14} aria-hidden />
                {c.where}
              </span>
              <span className="font-kit-mono text-kit-mono text-kit-ink-muted tabular-nums">
                {c.shape} · {fmt(c.seconds)}
              </span>
            </div>
            <Text variant="small" tone="muted">
              {c.opens}
            </Text>
          </li>
        ))}
      </ul>
    </Frame>
  )
}

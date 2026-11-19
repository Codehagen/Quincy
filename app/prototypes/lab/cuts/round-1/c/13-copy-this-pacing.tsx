"use client"

/*
 * 13 — Copy this pacing.
 *
 * An inspiration slot. Paste a short you liked and Quincy reads only its
 * rhythm: how often it cuts, when the hook lands, how the captions move.
 * The two rhythms sit one above the other, the short's and your take's,
 * with the hook marked on each, so "make mine like that" becomes a few
 * named changes. It copies pacing, never words or a look. The accent is the
 * highlighter's yellow, on the two hooks.
 */

import { HugeiconsIcon } from "@hugeicons/react"
import { Link01Icon } from "@hugeicons/core-free-icons"

import { Button, Text } from "@/components/kit"

import { HOOK, TAKE } from "../fixture"
import { Frame, Quincy, You } from "../parts"

const WIDTH = 520

function Rhythm({
  label,
  seconds,
  cuts,
  hook,
  meta,
}: {
  label: string
  seconds: number
  cuts: number[]
  hook: [number, number]
  meta: string
}) {
  const px = WIDTH / seconds
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-kit-small font-kit-strong">{label}</span>
        <span className="text-kit-meta text-kit-ink-muted">{meta}</span>
      </div>
      <div className="relative h-8 rounded-kit-chip bg-kit-well" style={{ width: WIDTH }}>
        <span
          className="absolute inset-y-0 rounded-kit-chip bg-kit-highlight"
          style={{ left: hook[0] * px, width: (hook[1] - hook[0]) * px }}
        />
        {cuts.map((c) => (
          <span key={c} className="absolute inset-y-1 w-0.5 rounded-full bg-kit-ink" style={{ left: c * px }} />
        ))}
      </div>
    </div>
  )
}

export function CopyThisPacing() {
  const theirs = Array.from({ length: 11 }, (_, i) => 1.4 + i * 2.1)
  return (
    <Frame>
      <div className="absolute top-6 left-8 flex items-baseline gap-2.5">
        <span className="text-kit-meta text-kit-ink-muted">Cuts</span>
        <span className="font-kit-strong">{TAKE.project}</span>
      </div>

      <div className="mx-auto flex w-[600px] flex-col gap-5 pt-[72px]">
        <div className="flex items-center gap-3 rounded-kit-control bg-kit-object px-4 py-3 shadow-kit-control">
          <HugeiconsIcon icon={Link01Icon} size={16} className="text-kit-ink-muted" aria-hidden />
          <span className="min-w-0 flex-1 truncate">A 24-second founder short you saved last week</span>
          <span className="text-kit-meta text-kit-ink-muted">Inspiration</span>
        </div>

        <You>Make mine move like that one.</You>

        <Quincy mood="found">
          <div className="flex flex-col gap-5 rounded-kit-object bg-kit-object p-5 shadow-kit-object">
            <Rhythm label="That short" seconds={24} cuts={theirs} hook={[0, 1.6]} meta="a cut every 2.1 s · hook at 0:00" />
            <Rhythm label="Your take" seconds={TAKE.seconds} cuts={[]} hook={[HOOK.at, HOOK.end]} meta="one shot · hook at 0:21" />
            <ul className="flex flex-col gap-1.5 text-kit-small">
              <li>Open on “They were in the way”, then go back to the start.</li>
              <li>Cut the pauses and the “um”; push in every few lines instead of cutting away.</li>
              <li>Captions word by word, the way it does.</li>
            </ul>
            <div className="flex items-center gap-3">
              <Button variant="action">Cut mine to this pacing</Button>
              <Text as="span" variant="small" tone="muted">
                Its rhythm only. Your words, your look.
              </Text>
            </div>
          </div>
        </Quincy>
      </div>
    </Frame>
  )
}

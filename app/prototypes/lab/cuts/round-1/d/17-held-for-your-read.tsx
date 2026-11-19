"use client"

/*
 * 17 — Held for your read.
 *
 * The cut is made and waits. One object on the grey stage says so in
 * Quincy's words, and its one action is to watch it through, not to export:
 * the scrub bar fills as you watch, and Export turns ink only once you have
 * seen the end. The receipt sits folded under the picture. One graphite
 * note marks the spot worth a second look. No accent.
 */

import * as React from "react"
import { Download04Icon, PlayIcon } from "@hugeicons/core-free-icons"

import { Button, Text, TextButton } from "@/components/kit"
import { Friend } from "@/components/mascot"

import { CUT_SECONDS, RECEIPT, TAKE, fmt } from "../fixture"
import { Frame, Note, PhoneFrame, Picture } from "../parts"

export function HeldForYourRead() {
  const [watched, setWatched] = React.useState(false)
  const seen = watched ? CUT_SECONDS : 11.2

  return (
    <Frame ground="stage">
      <div className="absolute top-6 left-8 flex items-baseline gap-2.5">
        <span className="text-kit-meta text-kit-ink-muted">Cuts</span>
        <span className="font-kit-strong">{TAKE.project}</span>
      </div>

      <div className="absolute top-[70px] left-[130px] flex w-[640px] gap-7 rounded-kit-object bg-kit-object p-6 shadow-kit-object">
        <PhoneFrame width={200}>
          <Picture shape="9:16" width={200} rounded="" caption="Before, 48% of new people finished setup." time={fmt(seen)} />
        </PhoneFrame>

        <div className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-2 text-kit-small text-kit-ink-muted">
            <Friend size={20} state="waiting" />
            Quincy · 10:44
          </span>
          <Text as="p" weight="strong">
            Your cut for X is ready. Held for your read.
          </Text>
          <Text variant="small" tone="muted">
            {fmt(CUT_SECONDS)} from {fmt(TAKE.seconds)}. Nothing is exported and nothing is posted.
          </Text>

          <div className="mt-6 flex flex-col gap-2">
            <div className="relative h-1.5 rounded-full bg-kit-track">
              <span
                className="absolute inset-0 origin-left rounded-full bg-kit-ink transition-[scale] duration-(--kit-duration-travel) ease-kit-move motion-reduce:transition-none"
                style={{ scale: `${seen / CUT_SECONDS} 1` }}
              />
            </div>
            <span className="font-kit-mono text-kit-mono-sm text-kit-ink-muted tabular-nums">
              watched {fmt(seen)} of {fmt(CUT_SECONDS)}
            </span>
          </div>

          <div className="mt-5 flex items-center gap-2">
            <Button
              variant={watched ? "quiet" : "action"}
              icon={PlayIcon}
              reserve={["Watch again"]}
              onClick={() => setWatched(true)}
            >
              {watched ? "Watch again" : "Watch it through"}
            </Button>
            <Button variant={watched ? "action" : "quiet"} icon={Download04Icon}>
              Export
            </Button>
          </div>

          <details className="mt-auto pt-6 text-kit-small">
            <summary className="cursor-pointer text-kit-ink-muted">What changed · {RECEIPT.length} lines</summary>
            <ul className="mt-2 flex flex-col gap-1">
              {RECEIPT.map((r) => (
                <li key={r.tool}>{r.say}</li>
              ))}
            </ul>
          </details>
          <div className="pt-2">
            <TextButton>Not yet, keep cutting</TextButton>
          </div>
        </div>
      </div>

      <Note height={40} style={{ left: 786, top: 176 }}>
        look again at 0:16
      </Note>
    </Frame>
  )
}

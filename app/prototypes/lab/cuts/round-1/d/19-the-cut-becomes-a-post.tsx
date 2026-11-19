"use client"

/*
 * 19 — The cut becomes a post.
 *
 * The hand-off. The exported cut is attached to a draft, and the draft is
 * written from the same transcript in the three beats: what I did, what
 * happened (the number on its own line), what it meant, which is the line
 * the cut pushes in on. The beats are named in the blue pen, the only blue.
 * Approve holds the post for its slot; nothing goes out on its own.
 * No accent beyond the pen.
 */

import type { ReactNode } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { NewTwitterIcon, Video01Icon } from "@hugeicons/core-free-icons"

import { Button, Text } from "@/components/kit"
import { Friend } from "@/components/mascot"

import { CUT_SECONDS, POST, fmt } from "../fixture"
import { Frame, Hand, HandBracket, PhoneFrame, Picture } from "../parts"

function Beat({ label, height, children }: { label: string; height: number; children: ReactNode }) {
  return (
    <div className="relative">
      {children}
      <span className="absolute top-0 left-[calc(100%+28px)] flex items-center gap-2" style={{ height }}>
        <HandBracket height={height} tone="pen" />
        <Hand tone="pen">{label}</Hand>
      </span>
    </div>
  )
}

export function TheCutBecomesAPost() {
  return (
    <Frame>
      <div className="flex h-14 items-center justify-between border-b border-kit-hairline px-6">
        <span className="flex items-baseline gap-2.5">
          <span className="text-kit-meta text-kit-ink-muted">Drafts</span>
          <span className="font-kit-strong">From your cut</span>
        </span>
        <span className="text-kit-small text-kit-ink-muted">Thu 08:00 · your usual slot</span>
      </div>

      <div className="flex gap-10 px-12 pt-8">
        <div className="flex flex-col items-center gap-3">
          <PhoneFrame width={180}>
            <Picture shape="9:16" width={180} rounded="" punch caption="They were in the way." captionClass="text-kit-meta" />
          </PhoneFrame>
          <span className="flex items-center gap-1.5 text-kit-meta text-kit-ink-muted">
            <HugeiconsIcon icon={Video01Icon} size={12} aria-hidden />
            9:16 for X · {fmt(CUT_SECONDS)}
          </span>
        </div>

        <div className="w-[360px]">
          <span className="flex items-center gap-2 text-kit-small text-kit-ink-muted">
            <Friend size={20} state="waiting" />
            Drafted from the same transcript. Held for your read.
          </span>

          <div className="mt-3 rounded-kit-object bg-kit-object p-5 shadow-kit-object">
            <span className="flex items-center gap-1.5 text-kit-meta text-kit-ink-muted">
              <HugeiconsIcon icon={NewTwitterIcon} size={12} aria-hidden />
              Post on X, video attached
            </span>
            <div className="mt-4 flex flex-col gap-4">
              <Beat label="what I did" height={40}>
                <p>{POST.did}</p>
              </Beat>
              <Beat label="what happened" height={70}>
                <p>{POST.happenedLead}</p>
                <Text variant="figure">{POST.figure}</Text>
                <p className="text-kit-ink-muted">{POST.happenedRest}</p>
              </Beat>
              <Beat label="what it meant" height={40}>
                <p>{POST.meant}</p>
              </Beat>
            </div>
            <div className="mt-6 flex items-center gap-2">
              <Button variant="action">Approve</Button>
              <Button variant="quiet">Edit</Button>
            </div>
          </div>
          <div className="mt-3">
            <Text variant="small" tone="muted">
              Approve holds it for Thursday 08:00. You can still pull it before then.
            </Text>
          </div>
        </div>
      </div>
    </Frame>
  )
}

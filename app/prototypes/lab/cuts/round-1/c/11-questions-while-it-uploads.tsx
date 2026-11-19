"use client"

/*
 * 11 — Questions while it uploads.
 *
 * The upload and the transcript take a minute, so that minute is used. The
 * file keeps going at the top with an honest count, and under it Quincy asks
 * the three things a first cut needs, one at a time: who it is for, where it
 * goes, how long. An answered card folds to one line. Skip is always there;
 * a cut still arrives without answers. No accent.
 */

import { HugeiconsIcon } from "@hugeicons/react"
import { Tick02Icon, Video01Icon } from "@hugeicons/core-free-icons"

import { Choice, Choices, Progress, Text, TextButton } from "@/components/kit"
import { Friend } from "@/components/mascot"

import { TAKE } from "../fixture"
import { Frame } from "../parts"

export function QuestionsWhileItUploads() {
  return (
    <Frame>
      <div className="absolute top-6 left-8 flex items-baseline gap-2.5">
        <span className="text-kit-meta text-kit-ink-muted">Cuts</span>
        <span className="font-kit-strong">New cut</span>
      </div>

      <div className="mx-auto flex w-[560px] flex-col gap-4 pt-[76px]">
        <div className="rounded-kit-object bg-kit-object p-5 shadow-kit-object">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-kit-control bg-kit-well text-kit-ink-muted">
              <HugeiconsIcon icon={Video01Icon} size={18} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <Text weight="strong">{TAKE.file}</Text>
              <Text variant="small" tone="muted">
                264 of 412 MB · then the transcript, about 20 s
              </Text>
            </div>
          </div>
          <div className="mt-4">
            <Progress label="Uploading" value={64} count />
          </div>
        </div>

        <div className="flex items-center gap-2 pt-3">
          <Friend size={24} state="listening" />
          <Text tone="muted">Three questions while it goes. Skip any; you still get a cut.</Text>
        </div>

        <div className="flex items-center justify-between rounded-kit-control bg-kit-object px-4 py-3 shadow-kit-control">
          <span className="flex items-center gap-2.5">
            <HugeiconsIcon icon={Tick02Icon} size={14} className="text-kit-ink-muted" aria-hidden />
            <span className="text-kit-ink-muted">Who is it for?</span>
            <span className="font-kit-strong">Founders building onboarding</span>
          </span>
          <TextButton>Change</TextButton>
        </div>

        <div className="rounded-kit-object bg-kit-object p-5 shadow-kit-object">
          <Text weight="strong">Where does it go?</Text>
          <Text variant="small" tone="muted">
            I pick the frame and the length from this.
          </Text>
          <div className="mt-4">
            <Choices label="Where it goes">
              <Choice>X, vertical</Choice>
              <Choice>LinkedIn, vertical</Choice>
              <Choice>Both, one cut each</Choice>
              <Choice>Not sure yet</Choice>
            </Choices>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-kit-control px-4 py-3 opacity-50 shadow-kit-inset">
          <span className="text-kit-ink-muted">How long should it be?</span>
          <span className="text-kit-meta text-kit-ink-muted">next</span>
        </div>
      </div>
    </Frame>
  )
}

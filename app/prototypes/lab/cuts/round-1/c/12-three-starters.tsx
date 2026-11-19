"use client"

/*
 * 12 — Three starters.
 *
 * The take has landed and nothing is cut yet. The chat is empty, so it
 * shows the friend and what Quincy already read (length, words, the two
 * long pauses), then three starters that are whole requests: tighten,
 * captions, a 9:16. They leave once there is a conversation. One graphite
 * note on the lanes points at the first pause. No accent.
 */

import { Download04Icon } from "@hugeicons/core-free-icons"

import { Button, Choice, Choices, Text } from "@/components/kit"
import { Friend } from "@/components/mascot"

import { TAKE, fmt } from "../fixture"
import { ComposerStill, EditorBar, Frame, Note, Picture, Timeline } from "../parts"

export function ThreeStarters() {
  return (
    <Frame>
      <EditorBar
        right={
          <Button variant="quiet" icon={Download04Icon}>
            Export
          </Button>
        }
      />
      <div className="flex h-[664px]">
        <div className="relative flex min-w-0 flex-1 flex-col items-center gap-6 px-6 pt-6">
          <Picture shape="16:9" width={540} time={fmt(0)} />
          <div className="rounded-kit-object bg-kit-object px-4 pt-3 pb-4 shadow-kit-object">
            <Timeline width={580} state="raw" playhead={0} />
          </div>
          <Note height={32} style={{ left: 176, top: 496 }}>
            a long pause
          </Note>
        </div>

        <aside className="flex w-[300px] shrink-0 flex-col border-l border-kit-hairline px-5 pt-5 pb-5">
          <span className="text-kit-small font-kit-strong">Cut with Quincy</span>
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <Friend size={48} state="idle" />
            <div className="flex flex-col gap-1">
              <Text weight="strong">Your take is in.</Text>
              <Text variant="small" tone="muted">
                {TAKE.seconds} seconds, {TAKE.words} words, two pauses over a second and one “um”.
              </Text>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <Choices label="Starters">
              <Choice>Tighten the edit</Choice>
              <Choice>Add captions</Choice>
              <Choice>Make a 9:16</Choice>
            </Choices>
            <ComposerStill />
          </div>
        </aside>
      </div>
    </Frame>
  )
}

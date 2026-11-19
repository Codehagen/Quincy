"use client"

/*
 * Group c's shared bits: the lanes with the reading sweep over them, and the
 * empty margin that says what Quincy read before anything is asked.
 */

import { Text } from "@/components/kit"
import { Friend } from "@/components/mascot"

import { TAKE } from "../../round-1/fixture"
import { STARTERS } from "../chat"
import { Lanes } from "../desk"
import { Suggestions } from "../elements/suggestion"
import type { CutChat } from "../use-cut-chat"

/** True while the read_take tool has not given its final output. */
export function isReading(chat: CutChat) {
  return chat.messages.some((m) =>
    m.parts.some((p) => p.type === "tool-read_take" && (p.state !== "output-available" || p.preliminary)),
  )
}

export function ReadingLanes({ chat }: { chat: CutChat }) {
  return (
    <div className="relative">
      <Lanes cut={chat.cut} hot={chat.hot} width={600} />
      {isReading(chat) && chat.busy ? (
        <span aria-hidden className="qc-scan" style={{ ["--qc-scan-to" as string]: "596px" }} />
      ) : null}
    </div>
  )
}

/** The starters, each carrying what Quincy read that makes it worth sending. */
export function Starters({ chat }: { chat: CutChat }) {
  return <Suggestions stacked items={STARTERS} disabled={chat.busy} onPick={chat.send} />
}

export function ReadEmpty({ chat }: { chat: CutChat }) {
  return (
    <div className="flex flex-1 flex-col justify-end gap-3 pb-2">
      <div className="flex flex-col items-center gap-2 pb-2 text-center">
        <Friend size={40} state="idle" />
        <Text weight="strong">Your take is in.</Text>
        <Text variant="small" tone="muted">
          I read it while it uploaded: {TAKE.seconds} s, {TAKE.words} words, one speaker.
        </Text>
      </div>
      <Starters chat={chat} />
    </div>
  )
}

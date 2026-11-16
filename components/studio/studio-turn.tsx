"use client"

import * as React from "react"
import { Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons"
import type { UIMessage } from "ai"

import { IconButton, Text } from "@/components/kit"
import { Friend, type MascotState } from "@/components/mascot"
import {
  ChatDraft,
  QuincyReply,
  QuincyWork,
  ReplyText,
  SourceCard,
  YourTurn,
} from "@/components/quincy"
import { isSourceArtifactOutput } from "@/lib/source-artifact"
import type { StudioPart, StudioUIMessage } from "@/lib/studio-message"
import { planTurn, type ToolSentences, type TurnBlock } from "@/lib/studio-turn"

/**
 * One message in the Studio conversation: the chatbot template's
 * `ChatMessage`, on the kit. The person's turn is the one bubble (YourTurn);
 * Quincy's is a page with no surface of its own (QuincyReply), its parts
 * planned by lib/studio-turn.ts and drawn here, one renderer per block:
 *
 *   work   → QuincyWork (thinking, then a receipt of each step)
 *   source → SourceCard
 *   draft  → ChatDraft (the DraftCard, bound to its row)
 *   text   → ReplyText (markdown in the kit preset)
 *   files  → FileChips above the person's bubble
 *
 * Memoized on the message object: the SDK keeps a finished message
 * referentially stable while another streams, so only the arriving turn
 * re-renders (and re-parses its markdown) per chunk.
 */
export type StudioTurnProps = {
  /**
   * Studio's message, or another surface's whose tools are steps in the
   * receipt (the editor's cutting run: `sentences` says them).
   */
  message: StudioUIMessage | UIMessage
  /** This turn is still arriving. */
  live: boolean
  /** The friend's state when this is the newest reply; null for older turns. */
  mood: MascotState | null
  /** Show Copy under the words: a finished reply with text. */
  copyable: boolean
  /** Tool sentences for a surface other than Studio (lib/editor/turn-sentences.ts). */
  sentences?: ToolSentences
}

export const StudioTurn = React.memo(function StudioTurn({ message, live, mood, copyable, sentences }: StudioTurnProps) {
  const blocks = React.useMemo(
    // Another surface's tool parts read as Studio's unknown tools: steps.
    () => planTurn(message.parts as readonly StudioPart[], { live, sentences }),
    [message.parts, live, sentences],
  )

  if (message.role === "user") {
    const files = blocks.find((b) => b.kind === "files")
    const text = blocks
      .filter((b): b is Extract<TurnBlock, { kind: "text" }> => b.kind === "text")
      .map((b) => b.part.text)
      .join("\n\n")
    return (
      <YourTurn
        files={files?.kind === "files" ? files.files.map((f) => ({ name: f.filename ?? "File" })) : undefined}
      >
        {text}
      </YourTurn>
    )
  }

  const words = blocks
    .filter((b): b is Extract<TurnBlock, { kind: "text" }> => b.kind === "text")
    .map((b) => b.part.text)
    .join("\n\n")

  return (
    <QuincyReply streaming={live}>
      <QuincyByline mood={mood} />
      {blocks.map((block) => (
        <Block key={block.key} block={block} />
      ))}
      {copyable && words ? <CopyReply text={words} /> : null}
    </QuincyReply>
  )
})

function Block({ block }: { block: TurnBlock }) {
  switch (block.kind) {
    case "work":
      return <QuincyWork steps={block.steps} />
    case "text":
      return <ReplyText part={block.part} />
    case "draft":
      return <ChatDraft part={block.part} />
    case "source":
      return block.part.state === "output-available" && isSourceArtifactOutput(block.part.output) ? (
        <SourceCard url={block.part.output.url} title={block.part.output.title} excerpt={block.part.output.excerpt} />
      ) : null
    case "files":
      // Quincy's own files have nothing to show yet (lib/studio-turn.ts).
      return null
  }
}

/**
 * "Quincy", with the friend beside the newest reply only: one face on view
 * (docs/design/mascot.md), in the state the turn is in. Older replies keep
 * the slot empty so the names line up.
 */
export function QuincyByline({ mood }: { mood: MascotState | null }) {
  return (
    <div className="flex h-8 items-center gap-2.5">
      <span className="grid size-8 shrink-0 place-items-center text-kit-ink" aria-hidden>
        {mood ? <Friend state={mood} size={32} /> : null}
      </span>
      <Text as="span" weight="strong">
        Quincy
      </Text>
    </div>
  )
}

/** The template's message action, one of them: copy the words of the reply. */
function CopyReply({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false)

  React.useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(t)
  }, [copied])

  return (
    <div className="flex items-center gap-kit-controls">
      <IconButton
        icon={copied ? Tick02Icon : Copy01Icon}
        aria-label="Copy the reply"
        onClick={() => {
          navigator.clipboard
            .writeText(text)
            .then(() => setCopied(true))
            .catch(() => {})
        }}
      />
      <span role="status" className="text-kit-small text-kit-ink-muted">
        {copied ? "Copied" : ""}
      </span>
    </div>
  )
}

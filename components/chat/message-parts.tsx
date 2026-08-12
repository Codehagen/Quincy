"use client"

import * as React from "react"
import type { UIMessage } from "ai"
import {
  Alert02Icon,
  ArrowDown01Icon,
  BrainIcon,
  Tick02Icon,
  ToolsIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Bubble, BubbleContent } from "@/components/ui/bubble"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Markdown } from "@/components/ui/markdown"
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker"

type Part = UIMessage["parts"][number]

/**
 * `tool-searchSources` -> `Search sources`, `tool-remove_silences` -> `Remove
 * silences`.
 *
 * Both conventions, because both are in use: the writing tools are camelCase
 * and the editor's are snake_case, which is what reads best inside a model's
 * tool list. Splitting only on case left the editor showing "Remove_silences"
 * to the user — a variable name where a sentence belongs.
 */
function toolLabel(type: string) {
  const name = type.replace(/^tool-/, "")
  const spaced = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function ReasoningPart({
  text,
  streaming,
}: {
  text: string
  streaming: boolean
}) {
  // Collapsed by default. Reasoning is context for the answer, not the answer —
  // it should be available without competing with it for the reader's attention.
  return (
    <Collapsible>
      <CollapsibleTrigger
        render={
          <Marker
            render={<button type="button" />}
            className="group/reasoning w-full cursor-pointer text-muted-foreground"
          />
        }
      >
        {/* The icon stays put across both states so the row does not shift
            when thinking settles. The shimmer carries the motion instead of a
            spinner — it animates the words that are actually arriving. */}
        <MarkerIcon>
          <HugeiconsIcon icon={BrainIcon} />
        </MarkerIcon>
        <MarkerContent className={streaming ? "shimmer" : undefined}>
          {streaming ? "Thinking" : "Thought about this"}
        </MarkerContent>
        <MarkerIcon className="ml-1">
          {/* Base UI marks the open trigger with data-panel-open, not
              data-open — listening for the wrong attribute meant this never
              moved. Shares the panel's curve and duration, because a
              disclosure and its indicator are one gesture. */}
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            className="transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] group-data-panel-open/reasoning:rotate-180"
          />
        </MarkerIcon>
      </CollapsibleTrigger>
      {/* Height is a layout property and normally off-limits, but a disclosure
          genuinely changes layout and Base UI hands us the measured height as a
          variable, so there is nothing to re-measure. overflow-hidden keeps the
          text from spilling while the box is still growing.

          200ms in on a strong curve; 150ms out on ease-in, because leaving is
          already decided. Transitions, not keyframes, so reversing mid-open
          retargets instead of restarting. */}
      <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] data-ending-style:h-0 data-ending-style:opacity-0 data-ending-style:duration-150 data-ending-style:ease-in data-starting-style:h-0 data-starting-style:opacity-0">
        <p className="mt-1 ml-2 border-l border-border pl-3 text-caption text-pretty whitespace-pre-wrap text-muted-foreground">
          {text}
        </p>
      </CollapsibleContent>
    </Collapsible>
  )
}

function ToolPart({ part }: { part: Extract<Part, { toolCallId: string }> }) {
  const label = toolLabel(part.type)
  const failed = part.state === "output-error"
  const running =
    part.state === "input-streaming" || part.state === "input-available"

  return (
    <Marker
      role="status"
      className={failed ? "text-destructive" : "text-muted-foreground"}
    >
      <MarkerIcon>
        <HugeiconsIcon
          icon={running ? ToolsIcon : failed ? Alert02Icon : Tick02Icon}
        />
      </MarkerIcon>
      {/* The failure reason lives in the text, not just the colour — an error
          told only by a red tint is invisible to a good share of readers. */}
      <MarkerContent className={running ? "shimmer" : undefined}>
        {failed
          ? `${label} failed — ${part.errorText ?? "no reason given"}`
          : label}
      </MarkerContent>
    </Marker>
  )
}

/**
 * One renderer for every part type the transcript can carry. Anything
 * unhandled returns null rather than throwing, so a new part type from the
 * model degrades to a gap instead of a blank screen.
 *
 * Memoized, and the markdown parse is why: `react-markdown` re-parses its
 * whole source on every render, and during a streamed reply every part of
 * every *finished* message was re-parsed once per chunk. The SDK keeps
 * finished parts referentially stable across updates, so the memo confines
 * per-chunk work to the one part that is actually growing.
 */
export const MessagePart = React.memo(function MessagePart({
  part,
  isUser,
}: {
  part: Part
  isUser: boolean
}) {
  if (part.type === "text") {
    // The user's turn is quoted back, not interpreted. Someone pasting a post
    // full of `**` meant those characters; rendering them as emphasis would
    // show them something they did not write, in the one place they can check
    // what they sent.
    if (isUser) {
      return (
        <Bubble variant="secondary" align="end">
          <BubbleContent className="whitespace-pre-wrap">
            {part.text}
          </BubbleContent>
        </Bubble>
      )
    }

    // Quincy's turn is prose, and prose is markdown — headings, lists, bold,
    // tables. Rendering it as preformatted text put the raw syntax on screen
    // and flattened every level of structure the model wrote into one
    // undifferentiated column.
    //
    // The measure is capped here rather than on the column, because the column
    // also carries the composer and the user's bubbles, which are not read line
    // after line. Uncapped it ran past 100 characters; the eye loses its return
    // path somewhere above 75.
    //
    // 52, not 65, because `ch` is the width of a zero and a zero is much wider
    // than the average lowercase letter — measured in this font at this size,
    // 52ch renders 75 characters and the conventional 65ch renders 91. The unit
    // is a proxy; the count is the thing, so the number is set from the count.
    return (
      <Bubble variant="ghost" align="start">
        <BubbleContent>
          <Markdown
            preset="chat"
            streaming={part.state === "streaming"}
            className="max-w-[52ch]"
          >
            {part.text}
          </Markdown>
        </BubbleContent>
      </Bubble>
    )
  }

  if (part.type === "reasoning") {
    return (
      <ReasoningPart text={part.text} streaming={part.state === "streaming"} />
    )
  }

  if (part.type.startsWith("tool-") || part.type === "dynamic-tool") {
    return <ToolPart part={part as Extract<Part, { toolCallId: string }>} />
  }

  return null
})

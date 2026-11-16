"use client"

import * as React from "react"

import { Disclosure, LiveDot, Muted, Text } from "@/components/kit"
import type { WorkStep } from "@/lib/studio-turn"

/**
 * What Quincy did to get to the reply: its thinking, then a receipt of each
 * step, the way the landing's hero shows it ("Read #212 → 6 screens
 * removed"). The chatbot template's Trace, in Quincy's words.
 *
 * - **Thinking** is a Disclosure. Open with a pulsing LiveDot while it is
 *   live (`step.live`: streaming, or nothing visible has landed after it
 *   yet); it folds to "Thought about this" the moment the card or the words
 *   land. A person who opened or shut it keeps their choice.
 * - **A step running** is a pulsing LiveDot and the present tense.
 * - **A step done** is a filled check and the past tense.
 * - **A step that failed** is one sentence in ink with the tool's own words
 *   in grey after it. No red, no icon (docs/design/states.md).
 */
export type QuincyWorkProps = {
  steps: readonly WorkStep[]
}

export function QuincyWork({ steps }: QuincyWorkProps) {
  return (
    <div data-slot="quincy-work" className="flex flex-col gap-kit-tight">
      {steps.map((step) =>
        step.kind === "thinking" ? (
          <Thinking key={step.key} text={step.text} live={step.live} />
        ) : (
          <Step key={step.key} step={step} />
        ),
      )}
    </div>
  )
}

function Thinking({ text, live }: { text: string; live: boolean }) {
  const [chosen, setChosen] = React.useState<boolean | undefined>(undefined)
  const open = chosen ?? live
  return (
    <Disclosure
      open={open}
      onOpenChange={setChosen}
      summary={live ? <LiveDot pulse>Thinking</LiveDot> : <span className="text-kit-ink-muted">Thought about this</span>}
    >
      <Text variant="small" tone="muted">
        <span className="whitespace-pre-wrap">{text || "…"}</span>
      </Text>
    </Disclosure>
  )
}

function Check() {
  return (
    <svg aria-hidden width={16} height={16} viewBox="0 0 16 16" className="flex-none">
      <circle cx="8" cy="8" r="8" className="fill-kit-ink" />
      <path
        d="M4.6 8.2 L7 10.5 L11.4 5.8"
        fill="none"
        className="stroke-kit-object"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function Step({ step }: { step: Extract<WorkStep, { kind: "step" }> }) {
  if (step.state === "running") {
    return (
      <Text as="div" role="status">
        <span className="flex min-h-7 items-center">
          <LiveDot pulse>{step.label}</LiveDot>
        </span>
      </Text>
    )
  }
  if (step.state === "failed") {
    return (
      <Text as="div" role="status">
        <span className="block py-1">
          {step.label}
          {step.reason ? (
            <>
              {" "}
              <Muted>{step.reason}</Muted>
            </>
          ) : null}
        </span>
      </Text>
    )
  }
  return (
    <Text as="div">
      <span className="flex min-h-7 items-center gap-2.5">
        <Check />
        {step.label}
      </span>
    </Text>
  )
}

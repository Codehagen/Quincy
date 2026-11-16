"use client"

import * as React from "react"

import { Choice, Choices, Text, TextLink } from "@/components/kit"
import { Friend } from "@/components/mascot"
import { TypedLine } from "@/components/welcome/typed-line"
import { GREETED_COOKIE, type StudioGreeting } from "@/lib/studio-greeting"

/**
 * Quincy speaks first on an empty Studio (decided 2026-08-12, see
 * lib/studio-greeting.ts): the friend, an opening grounded in what is on the
 * desk, and answers that send on click. The chatbot template's greeting and
 * suggested actions, in Quincy's voice.
 *
 * - The friend is `found` when Quincy is offering something it read (the
 *   greeting carries a link to it), which plays once and settles to idle;
 *   `idle` otherwise (docs/design/mascot.md). Decorative: the words say it.
 * - First-ever visit, the opening types itself word by word; after that it is
 *   there at once (a daily surface pays no delight tax). The cookie is set at
 *   first paint, so answering mid-type still counts as greeted.
 * - The answers wait until the opening has finished: offering answers to a
 *   question still being asked is a form with the answers pre-printed.
 * - The composer is live from the first frame either way; nothing here
 *   blocks typing.
 */
export type QuincyGreetingProps = {
  greeting: StudioGreeting
  /** Send an answer. */
  onPick: (text: string) => void
  /** A reply is arriving: the answers wait. */
  disabled?: boolean
}

export function QuincyGreeting({ greeting, onPick, disabled = false }: QuincyGreetingProps) {
  const [step, setStep] = React.useState(greeting.typed ? 0 : Infinity)
  const done = step >= greeting.opening.length

  React.useEffect(() => {
    if (greeting.typed) {
      document.cookie = `${GREETED_COOKIE}=1; path=/; max-age=31536000; samesite=lax`
    }
  }, [greeting.typed])

  return (
    <section aria-label="Quincy" data-slot="quincy-greeting" className="flex flex-col gap-kit-group">
      <Friend state={greeting.link ? "found" : "idle"} size={48} className="text-kit-ink" />
      <div className="flex flex-col gap-kit-related">
        {greeting.opening.map((line, index) =>
          index <= step ? (
            <Text key={index}>
              {index === step ? (
                <TypedLine text={line} onDone={() => setStep((s) => s + 1)} />
              ) : (
                line
              )}
            </Text>
          ) : null,
        )}
      </div>
      {done && (greeting.chips.length > 0 || greeting.link) ? (
        <div className="flex flex-wrap items-center gap-kit-controls">
          <Choices label="Answers">
            {greeting.chips.map((chip, index) => (
              <Choice key={chip} arrive={index} disabled={disabled} onClick={() => onPick(chip)}>
                {chip}
              </Choice>
            ))}
          </Choices>
          {/* A link, not a chip: it goes somewhere instead of saying something. */}
          {greeting.link ? (
            <Text as="span" variant="small" tone="muted">
              <span className="ml-1.5">
                <TextLink href={greeting.link.href}>{greeting.link.label}</TextLink>
              </span>
            </Text>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

/**
 * The opening, kept above the conversation once the person answers: a
 * greeting that vanished on reply would make the conversation start over.
 * No friend here; the newest reply carries it.
 */
export function QuincyGreetingPrelude({ opening }: { opening: readonly string[] }) {
  return (
    <section aria-label="Quincy" className="flex flex-col gap-kit-related">
      {opening.map((line, index) => (
        <Text key={index}>{line}</Text>
      ))}
    </section>
  )
}

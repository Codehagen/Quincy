"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { GREETED_COOKIE, type StudioGreeting } from "@/lib/studio-greeting"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Button } from "@/components/ui/button"
import { Message, MessageContent } from "@/components/ui/message"
import { TypedLine } from "@/components/welcome/typed-line"

/**
 * Quincy speaks first on an empty Studio.
 *
 * **Decided from /prototypes/studio on 2026-08-12.** Four directions were
 * built against the real account (4 users in production; the deciding account
 * held three brain sentences, one riff, zero drafts):
 *
 * - **Greeting — chosen.** The onboarding's grammar carried into the daily
 *   surface: Quincy opens, grounded in what is actually on the desk, and the
 *   chips are answers that send on click. Chosen for cohesion — the product is
 *   a conversation partner, so the front door is a turn, not a hero.
 * - **Material — rejected.** Pressable scraps as the first turn. Honest only
 *   when riffs exist; the real account had one thin riff and the shelf looked
 *   bare. Worth revisiting if capture volume grows.
 * - **Desk — rejected.** Composer plus riffs/drafts/lineup status rows. Crisp,
 *   but it reads as a dashboard, and docs/vision.md explicitly rejects one.
 * - **Typewriter on every visit — rejected.** The reveal is personality
 *   exactly once. Studio is a daily surface, and the frequency rule for daily
 *   surfaces is no delight tax: type on the first-ever visit, instant after.
 * - **An A/B test instead of a decision — rejected.** 9 sessions in the last
 *   7 days; each arm needs hundreds of users before the number means anything.
 *
 * The values: opening fades up 200ms ease-out when instant; chips arrive
 * staggered 50ms apart and are held until the opening is finished — offering
 * answers to something still being asked is a form with the questions
 * pre-printed. The composer is live at frame one either way; motion never
 * blocks input.
 *
 * **The model never sees this opening.** It is client-side chrome composed in
 * lib/studio-greeting.ts, not a turn in the thread. If first replies start
 * contradicting the greeting ("draft from that riff" → "which riff?"), the
 * fix is to write the opening into the conversation as a real assistant turn
 * server-side, not to make the greeting vaguer.
 */

/** Fade and rise. 200ms, not 300: an entrance, not a performance. */
const ARRIVES =
  "animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-200 ease-out motion-reduce:animate-none"

function QuincyLine({
  children,
  animate,
  delayMs,
}: {
  children: React.ReactNode
  animate?: boolean
  delayMs?: number
}) {
  return (
    <Message
      className={cn(animate && ARRIVES)}
      style={
        delayMs
          ? ({ "--tw-animation-delay": `${delayMs}ms` } as React.CSSProperties)
          : undefined
      }
    >
      <MessageContent>
        <Bubble variant="ghost" align="start">
          <BubbleContent className="text-body text-pretty whitespace-pre-wrap">
            {children}
          </BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  )
}

/**
 * The empty state: opening above, composer and chips below. Owns the reveal
 * sequencing so StudioChat only has to hand over a composer and a send.
 */
export function StudioGreetingEmpty({
  greeting,
  composer,
  onPick,
  disabled,
}: {
  greeting: StudioGreeting
  composer: React.ReactNode
  /** Chips send on click — the first turn is the whole point of the screen. */
  onPick: (text: string) => void
  disabled?: boolean
}) {
  const [step, setStep] = React.useState(greeting.typed ? 0 : Infinity)
  const done = step >= greeting.opening.length

  // The cookie is set at first paint, not at reveal end: someone who answers
  // mid-typing has still been greeted, and the next visit must not replay it.
  React.useEffect(() => {
    if (greeting.typed) {
      document.cookie = `${GREETED_COOKIE}=1; path=/; max-age=31536000; samesite=lax`
    }
  }, [greeting.typed])

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-8">
      <div className="mt-auto flex flex-col gap-5">
        {greeting.opening.map((line, index) =>
          index <= step ? (
            // Instant mode staggers the lines 50ms like the chips; typed mode
            // gets no delay — each line already arrives on its own beat.
            <QuincyLine
              key={index}
              animate
              delayMs={greeting.typed ? 0 : index * 50}
            >
              {index === step ? (
                <TypedLine
                  text={line}
                  onDone={() => setStep((current) => current + 1)}
                />
              ) : (
                line
              )}
            </QuincyLine>
          ) : null
        )}
      </div>

      <div className="flex flex-col gap-3">
        {composer}

        {done ? (
          <div className="flex flex-wrap gap-2">
            {greeting.chips.map((chip, index) => (
              <Button
                key={chip}
                variant="outline"
                size="sm"
                disabled={disabled}
                className={cn(
                  "h-auto max-w-full py-1.5 text-left whitespace-normal",
                  ARRIVES
                )}
                style={
                  {
                    "--tw-animation-delay": `${index * 50}ms`,
                  } as React.CSSProperties
                }
                onClick={() => onPick(chip)}
              >
                {chip}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/**
 * The opening, kept in the transcript after the person answers. The loudest
 * lesson from the first-run flow: a greeting that vanishes the moment you
 * reply makes the conversation start over; the transcript never leaves.
 */
export function StudioGreetingPrelude({ opening }: { opening: string[] }) {
  return (
    <>
      {opening.map((line, index) => (
        <QuincyLine key={index}>{line}</QuincyLine>
      ))}
    </>
  )
}

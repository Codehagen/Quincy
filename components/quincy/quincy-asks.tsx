"use client"

import * as React from "react"

import { Arrive, Button, Field, Input, Muted, Text } from "@/components/kit"

/** What an answer's server action says back. The shape every answer action in the app already returns. */
export type AskResult = { ok: true } | { ok: false; message: string }

/**
 * How the person answers. Two shapes, because Quincy asks two kinds of thing:
 *
 * - `yes` — an offer with one yes: a rule to keep (`RuleOffer`,
 *   lib/edit-classes.ts), a channel to add. "Not now" is the other answer.
 * - `line` — a question answered in a clause: a story gap (`StoryGap`,
 *   lib/story-gaps.ts), the merge question (`SourceQuestion`,
 *   components/sources/answer-question.tsx). One line, never a textarea: a
 *   paragraph is a task, and a task is what nobody does.
 */
export type AskAnswer =
  | {
      kind: "yes"
      /** The yes, as the verb it performs: "Add the rule". */
      label: string
      /** While it runs: "Adding…". */
      pendingLabel?: string
      onAnswer: () => Promise<AskResult>
    }
  | {
      kind: "line"
      /** The field's visible label: "Your answer". */
      label: string
      placeholder?: string
      /** The ceiling, from the action (`MAX_ANSWER_CHARS`, lib/shipped-outcome.ts). */
      maxLength?: number
      /** The submit, as a verb: "Send it". */
      submitLabel: string
      pendingLabel?: string
      onAnswer: (text: string) => Promise<AskResult>
    }

export type QuincyAsksProps = {
  /**
   * The question, in ink, with its evidence in the sentence: "You mention
   * pricing in 4 posts and have no story about it." (`gapQuestion`). A claim
   * about the person's own writing carries its count, or it is an opinion.
   */
  question: string
  /** The grey continuation: the ask itself, or what happens on yes. */
  rest?: string
  answer: AskAnswer
  /**
   * "Not now": a real answer (it costs the offer its counter). The ask folds
   * away at once and this is told; omit it and there is no Not now.
   */
  onDecline?: () => void
  /**
   * What stays after a yes or an answer, announced: "Added. It is on your
   * voice page now." Omit it and the ask simply folds away, which is the
   * truthful end state when the page re-renders without it.
   */
  answered?: string
  /**
   * Whether the yes (or the submit) is the page's one action (actions.md).
   * A line answer defaults to blue only while it holds unsent words (step 1
   * of "Which action wins"); pass `false` when the page gives the action to
   * something else, and lift `onWordsChange` to decide.
   */
  isAction?: boolean
  /** A line answer started or emptied, for the page's action precedence. */
  onWordsChange?: (hasWords: boolean) => void
}

type Phase = "asking" | "answering" | "answered" | "declined"

/**
 * One question or offer from Quincy, answered in a line (plans/030 #8). Not a
 * card: it sits inside the object it is about (under the approved version, in
 * the chat, in a source row), and it is as small as a caption with its
 * controls, because a person who has just decided something is not looking
 * for a second decision.
 *
 * Asked → answering (the button says so) → answered (folds away; `answered`
 * stays if given) or declined (folds away). A refusal from the server stays
 * next to the control it came from, and the person can try again.
 */
export function QuincyAsks({
  question,
  rest,
  answer,
  onDecline,
  answered,
  isAction,
  onWordsChange,
}: QuincyAsksProps) {
  const [phase, setPhase] = React.useState<Phase>("asking")
  const [error, setError] = React.useState<string>()
  const [words, setWords] = React.useState("")
  const questionId = React.useId()
  const receiptRef = React.useRef<HTMLElement>(null)
  const showing = phase === "asking" || phase === "answering"
  const pending = phase === "answering"

  const run = async (call: () => Promise<AskResult>) => {
    setError(undefined)
    setPhase("answering")
    try {
      const result = await call()
      if (result.ok) {
        setPhase("answered")
        onWordsChange?.(false)
      } else {
        setError(result.message)
        setPhase("asking")
      }
    } catch {
      setError("That didn't go through. Try again.")
      setPhase("asking")
    }
  }

  // The answered controls go inert as they fold: put focus on the receipt
  // rather than let it fall to body.
  React.useEffect(() => {
    if (phase === "answered") receiptRef.current?.focus()
  }, [phase])

  const decline = onDecline ? (
    <Button
      disabled={pending}
      onClick={() => {
        setPhase("declined")
        onWordsChange?.(false)
        onDecline()
      }}
    >
      Not now
    </Button>
  ) : null

  return (
    <>
      <Arrive show={showing}>
        <div role="group" aria-labelledby={questionId} className="flex flex-col gap-kit-related">
          <Text id={questionId}>
            {question}
            {rest ? (
              <>
                {" "}
                <Muted>{rest}</Muted>
              </>
            ) : null}
          </Text>

          {answer.kind === "yes" ? (
            <div className="flex flex-col gap-kit-related">
              <div className="flex flex-wrap items-center gap-kit-controls">
                <Button
                  variant={isAction ? "action" : "quiet"}
                  aria-describedby={questionId}
                  pending={pending}
                  pendingLabel={answer.pendingLabel}
                  onClick={() => run(answer.onAnswer)}
                >
                  {answer.label}
                </Button>
                {decline}
              </div>
              {error ? (
                <Text role="status" variant="small">
                  {error}
                </Text>
              ) : null}
            </div>
          ) : (
            <form
              noValidate
              className="flex flex-col gap-kit-related"
              onSubmit={(e) => {
                e.preventDefault()
                const text = words.trim()
                if (!text) {
                  setError("Say a few words first. A clause is enough.")
                  return
                }
                void run(() => answer.onAnswer(text))
              }}
            >
              <Field label={answer.label} error={error}>
                <Input
                  value={words}
                  maxLength={answer.maxLength}
                  placeholder={answer.placeholder}
                  autoComplete="off"
                  onValueChange={(v: string) => {
                    const had = words.trim() !== ""
                    setWords(v)
                    if (error) setError(undefined)
                    const has = v.trim() !== ""
                    if (has !== had) onWordsChange?.(has)
                  }}
                />
              </Field>
              <div className="flex flex-wrap items-center gap-kit-controls">
                <Button
                  type="submit"
                  variant={(isAction ?? words.trim() !== "") ? "action" : "quiet"}
                  pending={pending}
                  pendingLabel={answer.pendingLabel}
                >
                  {answer.submitLabel}
                </Button>
                {decline}
              </div>
            </form>
          )}
        </div>
      </Arrive>

      {answered ? (
        <Arrive show={phase === "answered"}>
          <Text as="p" role="status" tone="muted" ref={receiptRef} tabIndex={-1}>
            {answered}
          </Text>
        </Arrive>
      ) : null}
    </>
  )
}

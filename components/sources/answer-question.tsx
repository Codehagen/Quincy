"use client"

import * as React from "react"
import { useTransition } from "react"

import { MAX_ANSWER_CHARS } from "@/lib/shipped-outcome"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"

/**
 * The one question Quincy asked, and the line that answers it.
 *
 * **A form rather than a chat**, and that is the whole design decision. Quincy
 * refuses most material on purpose and the refusal is right; what was missing
 * is a way for the person who did the work to say the one thing the record
 * never held. A line is enough. Anything larger — a modal, a thread, a second
 * page — makes answering a task, and a task is what nobody does.
 *
 * Per AGENTS.md: a real `<form>` so Enter submits, `FieldGroup` + `Field` for
 * the layout, the error next to the field rather than as a summary, one primary
 * action, and a button labelled with the verb it performs. A single-line
 * `Input` rather than a `Textarea` on purpose — a textarea would need
 * ⌘/Ctrl+Enter and would invite a paragraph where a clause is what the beat can
 * hold.
 *
 * It disappears on success. The answer goes back into the row it came from and
 * the page revalidates, so the next render has no question to ask — which is
 * the truthful end state rather than a receipt claiming one.
 *
 * **Written for the merge question and now shared with the calendar's**
 * (plans/027 1c and 4d). Two sources ask, one form answers: what varies is the
 * sentence under the question, the placeholder, and which server action takes
 * the line. Everything a second copy would have had to keep in step — the
 * ceiling, the disabled rule, the error placement, the derived radius — is
 * here once.
 */

export type SourceQuestion = {
  /** The `source_item` row the answer is written back into. */
  sourceItemId: string
  text: string
}

export function AnswerQuestion({
  question,
  onAnswer,
  inputId,
  lead,
  placeholder,
}: {
  question: SourceQuestion
  /**
   * The server action that stores the line and makes something of it.
   *
   * Passed in rather than branched on inside, so this component never has to
   * know which sources exist. A client component may hold a server action as a
   * prop — it is a reference, not a closure over the server.
   */
  onAnswer: (
    sourceItemId: string,
    answer: string
  ) => Promise<{ ok: true } | { ok: false; message: string }>
  /** Unique per row, because two questions can be on the page at once. */
  inputId: string
  /** Why Quincy is asking. One sentence, in the row's own words. */
  lead: React.ReactNode
  placeholder: string
}) {
  const [answer, setAnswer] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const submit = () => {
    setError(null)
    startTransition(async () => {
      const result = await onAnswer(question.sourceItemId, answer.trim())
      if (!result.ok) {
        setError(result.message)
        return
      }
      setAnswer("")
    })
  }

  return (
    /* Derived nested radius: the list is `rounded-xl` (20px) with 16px of
       padding, so a child sits at `rounded-xs` (4px). AGENTS.md — inner =
       outer − padding. No brass: this is Quincy waiting, not a rhythm
       running. */
    <div className="flex flex-col gap-3 rounded-xs bg-muted p-4">
      <div className="flex flex-col gap-1">
        <p className="text-card-title text-pretty">{question.text}</p>
        <p className="text-caption text-pretty text-muted-foreground">{lead}</p>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={inputId} className="sr-only">
              Your answer
            </FieldLabel>
            <Input
              id={inputId}
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              placeholder={placeholder}
              maxLength={MAX_ANSWER_CHARS}
              autoComplete="off"
            />
            {/* Beside the field, never as a summary, and through the component
                that already announces itself with role="alert". */}
            {error ? <FieldError>{error}</FieldError> : null}
          </Field>

          {/* One primary action. There is no Skip: leaving it unanswered is
              skipping it, and a button for doing nothing is a button. */}
          <div>
            <Button type="submit" disabled={pending || !answer.trim()}>
              {pending ? "Writing…" : "Answer"}
            </Button>
          </div>
        </FieldGroup>
      </form>
    </div>
  )
}

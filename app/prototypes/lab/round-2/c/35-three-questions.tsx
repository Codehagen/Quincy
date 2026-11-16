"use client"

import * as React from "react"
import { Tick02Icon } from "@hugeicons/core-free-icons"

import {
  ActionButton,
  Arrive,
  Mono,
  QuietButton,
  Stage,
  Text,
  u,
  Window,
} from "../kit"
import { color, motion, radius } from "../tokens"

/**
 * 35 — The first-run interview.
 *
 * Before Quincy drafts a word it asks three questions, one at a time, and
 * learns how you talk from the answers. It is a real form: the textarea
 * submits with Cmd/Ctrl+Enter (the hint reads the platform after mount),
 * an empty answer says so next to the field, and Skip is there because a
 * first run you cannot get out of is a wall. Answers stack above as you go,
 * so you can see what you have already said.
 */

const QUESTIONS = [
  {
    ask: "What did you ship or fix this week?",
    example: "Moved the build cache to its own disk. Deploys are fast again.",
  },
  {
    ask: "Who was it for?",
    example: "The three of us who deploy ten times a day.",
  },
  {
    ask: "How would you tell a friend about it?",
    example: "Honestly, nobody asked. It just bugged me.",
  },
] as const

function subscribeNothing() {
  return () => {}
}

/** "⌘" on Apple platforms, "Ctrl" elsewhere and on the server. */
function useModKey() {
  return React.useSyncExternalStore(
    subscribeNothing,
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl"),
    () => "Ctrl",
  )
}

export default function ThreeQuestions() {
  const mod = useModKey()
  const [answers, setAnswers] = React.useState<(string | null)[]>([])
  const [draft, setDraft] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const field = React.useRef<HTMLTextAreaElement>(null)

  const step = answers.length
  const done = step >= QUESTIONS.length
  const q = QUESTIONS[Math.min(step, QUESTIONS.length - 1)]!

  const commit = (value: string | null) => {
    setAnswers((prev) => [...prev, value])
    setDraft("")
    setError(null)
    field.current?.focus()
  }

  const submit = () => {
    if (!draft.trim()) {
      setError("Say it however you would say it. One line is enough.")
      return
    }
    commit(draft.trim())
  }

  return (
    <Stage
      lead="Three questions before the first draft."
      rest="Quincy learns your voice from how you answer."
    >
      <style>{css}</style>
      <Window address="hirequincy.com/welcome" width={440}>
        {QUESTIONS.map((qq, i) => (
          <Arrive key={qq.ask} show={i < step}>
            <div className="c35-answered">
              <Mono tone="faint">{i + 1}</Mono>
              <p className="c35-line" title={qq.ask}>
                {answers[i] ?? <span style={{ color: color.faint }}>Skipped</span>}
              </p>
            </div>
          </Arrive>
        ))}

        {done ? (
          <div aria-live="polite" style={{ paddingTop: u(14) }}>
            <Text weight="strong">That is enough to start.</Text>
            <div style={{ marginTop: u(4), maxWidth: u(360) }}>
              <Text tone="muted">
                Short sentences, first person, what you did before why. I keep
                these in your brain. Change them any time.
              </Text>
            </div>
            <div style={{ display: "flex", gap: u(6), marginTop: u(16) }}>
              <QuietButton onClick={() => setAnswers([])}>Start over</QuietButton>
            </div>
          </div>
        ) : (
          <form
            noValidate
            style={{ paddingTop: step ? u(14) : 0 }}
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <Mono>
                {step + 1} of {QUESTIONS.length}
              </Mono>
            </div>
            <label htmlFor="c35-answer" style={{ display: "block", marginTop: u(6) }}>
              <Text weight="strong" as="span">
                {q.ask}
              </Text>
            </label>
            <textarea
              id="c35-answer"
              ref={field}
              rows={2}
              value={draft}
              placeholder={q.example}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "c35-error" : undefined}
              className="c35-field"
              data-invalid={error ? true : undefined}
              onChange={(e) => {
                setDraft(e.target.value)
                if (error && e.target.value.trim()) setError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  submit()
                }
              }}
            />
            {error ? (
              <p id="c35-error" className="c35-error">
                {error}
              </p>
            ) : null}
            <div style={{ display: "flex", alignItems: "center", gap: u(6), marginTop: u(12) }}>
              <ActionButton
                type="submit"
                icon={step === QUESTIONS.length - 1 ? Tick02Icon : undefined}
              >
                {step === QUESTIONS.length - 1 ? "Done" : "Next"}
              </ActionButton>
              <QuietButton onClick={() => commit(null)}>Skip</QuietButton>
              <span style={{ marginLeft: "auto" }}>
                <Mono tone="faint">{mod} Enter</Mono>
              </span>
            </div>
          </form>
        )}
      </Window>
    </Stage>
  )
}

const css = `
.c35-answered {
  display: grid; grid-template-columns: ${u(18)} 1fr; align-items: baseline;
  padding: ${u(8)} 0;
  border-bottom: 1px solid ${color.hairline};
}
.c35-line { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.c35-field {
  display: block; width: 100%; box-sizing: border-box; resize: none;
  margin-top: ${u(8)}; padding: ${u(9)} ${u(11)};
  border: 0; outline: 0; border-radius: ${u(radius.control)};
  background: ${color.well}; color: ${color.ink};
  font: inherit; line-height: 1.43;
  box-shadow: inset 0 0 0 1px transparent;
  transition-property: box-shadow;
  transition-duration: ${motion.state}ms;
  transition-timing-function: ${motion.easeOut};
}
.c35-field::placeholder { color: ${color.faint}; }
.c35-field:focus-visible { box-shadow: inset 0 0 0 1px ${color.ink}; }
.c35-field[data-invalid] { box-shadow: inset 0 0 0 1.5px ${color.ink}; }
@media (pointer: coarse) { .c35-field { font-size: 16px; } }
.c35-error { margin-top: ${u(6)}; font-size: ${u(12.5)}; color: ${color.ink}; }
@media (prefers-reduced-motion: reduce) { .c35-field { transition-duration: 0ms; } }
`

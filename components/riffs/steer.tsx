"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { askForAngle } from "@/app/(app)/riffs/actions"
import { Button, Disclosure, Field, Input, LiveDot, Text } from "@/components/kit"

type Outcome =
  | { kind: "idle" }
  | { kind: "working" }
  /** The material would not carry what was asked for. Not an error. */
  | { kind: "empty" }
  | { kind: "failed"; message: string }

/**
 * "More like… / less like…": ask Quincy for one more idea from the same
 * material, in your words.
 *
 * Closed by default, a Disclosure under the ideas: you ask for something
 * different after reading what you got, and three permanently open forms
 * cost tab stops for an action you only want when the ideas missed.
 *
 * `onTypingChange` tells the page when words sit in the field unsent, because
 * that makes Ask the page's one action (docs/design/actions.md, rule 1) and
 * the open idea's Draft goes quiet.
 */
export function Steer({
  riffId,
  onTypingChange,
  onAsk,
}: {
  riffId: string
  onTypingChange?: (typing: boolean) => void
  /** Called when an ask starts, so the page can clear its Undo. */
  onAsk?: () => void
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [note, setNote] = React.useState("")
  const [outcome, setOutcome] = React.useState<Outcome>({ kind: "idle" })
  const [pending, startTransition] = React.useTransition()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const working = outcome.kind === "working" || pending
  const typing = note.trim() !== ""

  React.useEffect(() => {
    onTypingChange?.(open && typing)
  }, [open, typing, onTypingChange])

  // Words left in a closed or unmounted Steer are not "underway".
  React.useEffect(() => () => onTypingChange?.(false), [onTypingChange])

  React.useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  function ask() {
    const asked = note.trim()
    if (!asked || working) return
    onAsk?.()
    setOutcome({ kind: "working" })
    startTransition(async () => {
      try {
        const result = await askForAngle({ riffId, note: asked })
        if (!result.ok) {
          setOutcome({ kind: "failed", message: result.message })
          return
        }
        if (!result.found) {
          setOutcome({ kind: "empty" })
          return
        }
        setNote("")
        setOutcome({ kind: "idle" })
        setOpen(false)
        router.refresh()
      } catch {
        setOutcome({ kind: "failed", message: "Could not reach Quincy. Try again." })
      }
    })
  }

  return (
    <Disclosure summary="Ask for a different idea" open={open} onOpenChange={setOpen}>
      <form
        className="flex flex-col gap-kit-related"
        onSubmit={(e) => {
          e.preventDefault()
          ask()
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && !working) setOpen(false)
        }}
      >
        <Field label="What should I look for?">
          <Input
            ref={inputRef}
            name="steer"
            value={note}
            onValueChange={(value) => {
              setNote(value)
              if (outcome.kind !== "idle") setOutcome({ kind: "idle" })
            }}
            disabled={working}
            placeholder="More like… / less like…"
            autoComplete="off"
          />
        </Field>
        <div className="flex flex-wrap items-center gap-kit-related">
          <Button
            type="submit"
            variant={typing ? "action" : "quiet"}
            disabled={!typing}
            pending={working}
            pendingLabel="Asking…"
          >
            Ask
          </Button>
          <div role="status" aria-live="polite" className="min-w-0 flex-1">
            {working ? (
              <Text variant="small" tone="muted" as="div">
                <LiveDot pulse>Looking for that in this one…</LiveDot>
              </Text>
            ) : outcome.kind === "empty" ? (
              /* The honest no: nothing broke. It clears on the next keystroke,
                 because editing the sentence is the way to try again. */
              <Text variant="small" tone="muted">
                I couldn&apos;t find that here without repeating an idea you
                already have. Ask for something else in it.
              </Text>
            ) : outcome.kind === "failed" ? (
              <Text variant="small">{outcome.message}</Text>
            ) : null}
          </div>
        </div>
      </form>
    </Disclosure>
  )
}

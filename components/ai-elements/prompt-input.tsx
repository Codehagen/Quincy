"use client"

/*
 * Prompt Input (AI Elements): the message field. Pattern code from
 * ui.shadcn.com/docs/ai-elements/base/prompt-input and the chatbot
 * template's prompt-form: an InputGroup with an InputGroupTextarea, and the
 * send button in a block-end addon that becomes Stop while a turn works.
 * Enter sends, Shift+Enter is a line break, an IME composition is left alone.
 *
 * Send is `outline`, not the pattern's filled default: the editor's one
 * action is Export (AGENTS.md, docs/design/actions.md).
 */

import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowUp02Icon, StopIcon } from "@hugeicons/core-free-icons"

import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group"

export function PromptInput({
  value,
  onValueChange,
  onSubmit,
  busy,
  onStop,
  label,
  placeholder,
}: {
  value: string
  onValueChange: (value: string) => void
  onSubmit: (text: string) => void
  busy: boolean
  onStop: () => void
  label: string
  placeholder?: string
}) {
  const canSend = value.trim().length > 0 && !busy

  function submit(event?: React.FormEvent) {
    event?.preventDefault()
    if (!canSend) return
    onSubmit(value.trim())
  }

  return (
    <form onSubmit={submit} aria-label={label}>
      <InputGroup>
        <InputGroupTextarea
          aria-label={label}
          placeholder={placeholder}
          className="p-3"
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              submit()
            }
          }}
        />
        <InputGroupAddon align="block-end">
          {busy ? (
            <InputGroupButton
              type="button"
              size="icon-sm"
              variant="outline"
              aria-label="Stop"
              aria-keyshortcuts="Escape"
              className="ml-auto"
              onClick={onStop}
            >
              <HugeiconsIcon icon={StopIcon} strokeWidth={2} />
            </InputGroupButton>
          ) : (
            <InputGroupButton
              type="submit"
              size="icon-sm"
              variant="outline"
              aria-label="Send"
              className="ml-auto"
              disabled={!canSend}
            >
              <HugeiconsIcon icon={ArrowUp02Icon} strokeWidth={2} />
            </InputGroupButton>
          )}
        </InputGroupAddon>
      </InputGroup>
    </form>
  )
}

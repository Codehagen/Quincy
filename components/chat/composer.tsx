"use client"

import * as React from "react"
import {
  Attachment01Icon,
  ArrowUp02Icon,
  Cancel01Icon,
  File01Icon,
  StopIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment"
import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupTextarea,
} from "@/components/ui/input-group"

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Controlled on `value` only, because the parent genuinely needs to write it —
 * the suggestion chips prefill the composer. Everything else it owns itself:
 * the file list never leaves this component until submit, so lifting it would
 * be state the parent carries without reading.
 */
export function Composer({
  value,
  onValueChange,
  onSubmit,
  isBusy = false,
  onStop,
  placeholder = "What are we making today?",
  autoFocus = false,
}: {
  value: string
  onValueChange: (value: string) => void
  onSubmit: (input: { text: string; files: File[] }) => void
  isBusy?: boolean
  onStop?: () => void
  placeholder?: string
  autoFocus?: boolean
}) {
  const [files, setFiles] = React.useState<File[]>([])
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  const canSend = (value.trim().length > 0 || files.length > 0) && !isBusy

  // Focused after mount rather than with the autoFocus attribute, because a
  // coarse pointer means the keyboard would slide up over the page before the
  // user has asked for it. Reading the media query in an effect also keeps it
  // off the render path, so there is nothing for hydration to disagree about.
  React.useEffect(() => {
    if (!autoFocus) {
      return
    }

    if (window.matchMedia("(pointer: coarse)").matches) {
      return
    }

    textareaRef.current?.focus()
  }, [autoFocus])

  function submit() {
    if (!canSend) {
      return
    }

    onSubmit({ text: value.trim(), files })
    onValueChange("")
    setFiles([])
  }

  return (
    // A real form. Enter in a textarea never submits natively, so the keydown
    // handler below still does that work — but the form is what makes the send
    // button a submit button, groups the controls for assistive tech, and gives
    // mobile keyboards something to label their action key with.
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      {files.length > 0 ? (
        <AttachmentGroup>
          {files.map((file, index) => (
            <Attachment key={`${file.name}-${index}`} size="sm" state="idle">
              <AttachmentMedia>
                <HugeiconsIcon icon={File01Icon} />
              </AttachmentMedia>
              <AttachmentContent>
                <AttachmentTitle>{file.name}</AttachmentTitle>
                <AttachmentDescription>
                  {formatSize(file.size)}
                </AttachmentDescription>
              </AttachmentContent>
              <AttachmentActions>
                <AttachmentAction
                  aria-label={`Remove ${file.name}`}
                  onClick={() =>
                    setFiles((current) => current.filter((_, i) => i !== index))
                  }
                >
                  <HugeiconsIcon icon={Cancel01Icon} />
                </AttachmentAction>
              </AttachmentActions>
            </Attachment>
          ))}
        </AttachmentGroup>
      ) : null}

      <InputGroup>
        <InputGroupTextarea
          ref={textareaRef}
          value={value}
          placeholder={placeholder}
          aria-label="Message Quincy"
          rows={1}
          className="max-h-[40vh] min-h-[3.5rem] resize-none"
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.nativeEvent.isComposing) {
              return
            }

            // Cmd+Enter and Ctrl+Enter send too. It is the reflex people bring
            // from every other textarea they have ever submitted, and it works
            // even mid-paragraph where a bare Enter would be a line break.
            if (event.metaKey || event.ctrlKey) {
              event.preventDefault()
              submit()
              return
            }

            // Enter sends, Shift+Enter breaks the line.
            if (!event.shiftKey) {
              event.preventDefault()
              submit()
            }
          }}
        />

        <InputGroupAddon align="block-end">
          {/* sr-only keeps this in the accessibility tree, so a screen reader
              announced an unlabelled "Choose File" button next to the real one.
              The visible button is the control; this is just its mechanism. */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            aria-hidden="true"
            className="hidden"
            tabIndex={-1}
            onChange={(event) => {
              const picked = Array.from(event.target.files ?? [])
              setFiles((current) => [...current, ...picked])
              // Reset so picking the same file twice still fires onChange.
              event.target.value = ""
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Attach files"
            onClick={() => fileInputRef.current?.click()}
          >
            <HugeiconsIcon icon={Attachment01Icon} />
          </Button>

          {/* The one primary action in the view. While a response streams it
              becomes stop rather than growing a second button beside it —
              two live controls in one corner is one too many to aim at. */}
          {isBusy && onStop ? (
            <Button
              type="button"
              size="icon-sm"
              aria-label="Stop generating"
              className="ml-auto"
              onClick={onStop}
            >
              <HugeiconsIcon icon={StopIcon} />
            </Button>
          ) : (
            // type="submit" so the form owns the action: the click path and
            // the keyboard path now end in the same handler instead of two
            // that have to be kept in step.
            <Button
              type="submit"
              size="icon-sm"
              aria-label="Send message"
              className="ml-auto"
              disabled={!canSend}
            >
              <HugeiconsIcon icon={ArrowUp02Icon} />
            </Button>
          )}
        </InputGroupAddon>
      </InputGroup>
    </form>
  )
}

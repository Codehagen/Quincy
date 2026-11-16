"use client"

import * as React from "react"
import { Attachment01Icon } from "@hugeicons/core-free-icons"

import { Button } from "./button"
import { INPUT_TEXT } from "./control-styles"
import { FileChip } from "./file-chip"
import { IconButton } from "./icon-button"

export type ComposerSubmit = { text: string; files: File[] }

/** The words for a refused send, said under the field. */
const SEND_FAILED = "That did not send. Your words are back in the box."

export type ComposerProps = {
  /** Controlled text. Leave out for the composer to own it. */
  value?: string
  onValueChange?: (value: string) => void
  /**
   * Called with the trimmed text and the files. The composer clears itself
   * at once. Return a promise to hold the composer while it settles (files
   * being read): nothing new can be sent meanwhile, and if it rejects, the
   * words and files come back with a short note.
   */
  onSubmit: (input: ComposerSubmit) => void | Promise<void>
  /** A reply is arriving: Send becomes Stop, and nothing new can be sent. */
  busy?: boolean
  /** Stops the reply. Without it, Send is only disabled while busy. */
  onStop?: () => void
  /** The field's name for assistive tech: "Message Quincy". */
  label: string
  placeholder?: string
  /** Shows the attach control. Files travel with the next send. */
  attachments?: boolean
  /**
   * Whether Send is the view's one action (docs/design/actions.md). The
   * screen decides: words typed and not sent win; otherwise an item waiting
   * (a draft's Approve) does. Default true.
   */
  isAction?: boolean
  /** Focus on mount, under a fine pointer only: a phone's keyboard waits to be asked. */
  autoFocus?: boolean
  /** Fires when the files change, for a screen that weighs them in `isAction`. */
  onFilesChange?: (files: File[]) => void
  /**
   * The most the attached files may weigh together, in bytes. A pick that
   * would pass it is refused with a note, so a send never fails on size.
   */
  maxFileBytes?: number
  /** The textarea, for a screen that moves focus here (after a Choice). */
  inputRef?: React.Ref<HTMLTextAreaElement>
  /**
   * The screen's own controls in the toolbar, after attach on the left
   * (Studio's history). IconButtons at the toolbar's size; never a second
   * submit, and never the action: Send is.
   */
  tools?: React.ReactNode
}

const COARSE = "(pointer: coarse)"

function subscribeCoarse(onChange: () => void) {
  const query = window.matchMedia(COARSE)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

function readCoarse() {
  return window.matchMedia(COARSE).matches
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Where the person writes to Quincy: a white object with the words, the files
 * handed over as FileChips, attach (and the screen's `tools`) on the left and
 * Send on the right.
 *
 * - A real `<form>`: Send is its submit, so the click and the keyboard end in
 *   one handler.
 * - **Enter sends, Shift+Enter breaks the line**, ⌘/Ctrl+Enter sends too.
 *   Under a coarse pointer (a phone's keyboard has no Shift+Enter habit),
 *   Enter breaks the line and Send or ⌘/Ctrl+Enter sends.
 *   An IME composition's Enter is left alone.
 * - Grows with its words (`field-sizing: content`) up to 40% of the viewport,
 *   then scrolls. 16px under a coarse pointer, so iOS never zooms.
 * - While a reply arrives, Send becomes Stop in the same place (a label,
 *   not a second button), and the words stay editable for the next turn.
 */
export function Composer({
  value: valueProp,
  onValueChange,
  onSubmit,
  busy = false,
  onStop,
  label,
  placeholder,
  attachments = false,
  isAction = true,
  autoFocus = false,
  onFilesChange,
  maxFileBytes,
  inputRef,
  tools,
}: ComposerProps) {
  const [own, setOwn] = React.useState("")
  const value = valueProp ?? own
  const setValue = (next: string) => {
    if (valueProp === undefined) setOwn(next)
    onValueChange?.(next)
  }
  const [files, setFilesState] = React.useState<File[]>([])
  const setFiles = (next: File[]) => {
    setFilesState(next)
    onFilesChange?.(next)
  }
  const area = React.useRef<HTMLTextAreaElement>(null)
  // Hands the caller the same textarea, so it can move focus here after a
  // choice is picked. The handle, not a written-to prop, keeps the ref ours.
  React.useImperativeHandle(inputRef, () => area.current as HTMLTextAreaElement, [])
  const picker = React.useRef<HTMLInputElement>(null)
  const id = React.useId()
  const noteId = React.useId()
  // A send whose files are still being read: a second one waits for it.
  const [sending, setSending] = React.useState(false)
  const [note, setNote] = React.useState<string | null>(null)

  // False on the server and through hydration (the server snapshot), the
  // real pointer after: the markup agrees, and a phone's Enter is a line
  // break from then on.
  const coarse = React.useSyncExternalStore(subscribeCoarse, readCoarse, () => false)

  const canSend = !busy && !sending && (value.trim().length > 0 || files.length > 0)

  React.useEffect(() => {
    if (!autoFocus || readCoarse()) return
    area.current?.focus()
  }, [autoFocus])

  const submit = () => {
    if (!canSend) return
    const typed = value
    const attached = files
    setNote(null)
    setValue("")
    setFiles([])
    // Send is about to disable (or become Stop); keep focus where the next
    // words go. Under a coarse pointer that would open the keyboard
    // unasked, so there Send keeps focus instead (focusableWhenDisabled).
    if (!readCoarse()) area.current?.focus()
    let pending: unknown
    try {
      pending = onSubmit({ text: typed.trim(), files: attached })
    } catch {
      restore(typed, attached)
      return
    }
    if (!(pending instanceof Promise)) return
    setSending(true)
    pending.then(
      () => setSending(false),
      () => {
        setSending(false)
        restore(typed, attached)
      },
    )
  }

  function restore(typed: string, attached: File[]) {
    setValue(typed)
    setFiles(attached)
    setNote(SEND_FAILED)
  }

  const addFiles = (picked: File[]) => {
    if (picked.length === 0) return
    const next = [...files, ...picked]
    if (maxFileBytes != null) {
      const total = next.reduce((sum, file) => sum + file.size, 0)
      if (total > maxFileBytes) {
        setNote(`Files can be ${formatSize(maxFileBytes)} together at most. Those were not added.`)
        return
      }
    }
    setNote(null)
    setFiles(next)
  }

  return (
    <form
      data-slot="kit-composer"
      aria-label={label}
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className="flex flex-col gap-kit-related rounded-kit-object bg-kit-object p-kit-related shadow-kit-object has-[textarea:focus-visible]:outline-2 has-[textarea:focus-visible]:outline-offset-2 has-[textarea:focus-visible]:outline-kit-focus has-[textarea:focus-visible]:outline-solid"
    >
      {files.length > 0 ? (
        <ul aria-label="Files to send" className="flex flex-wrap gap-kit-controls">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`} className="max-w-full min-w-0">
              <FileChip
                name={file.name}
                meta={formatSize(file.size)}
                onRemove={() => {
                  setNote(null)
                  setFiles(files.filter((_, i) => i !== index))
                  area.current?.focus()
                }}
              />
            </li>
          ))}
        </ul>
      ) : null}

      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <textarea
        ref={area}
        id={id}
        rows={1}
        value={value}
        placeholder={placeholder}
        aria-describedby={note ? noteId : undefined}
        aria-keyshortcuts={coarse ? "Meta+Enter Control+Enter" : "Enter Meta+Enter Control+Enter"}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || e.nativeEvent.isComposing) return
          const mod = e.metaKey || e.ctrlKey
          if (e.shiftKey && !mod) return
          // A phone's Enter is the line break; Send (or ⌘/Ctrl+Enter) sends.
          if (coarse && !mod) return
          e.preventDefault()
          submit()
        }}
        className={`block max-h-[40vh] min-h-11 w-full resize-none bg-transparent px-1.5 pt-1 [field-sizing:content] outline-hidden ${INPUT_TEXT}`}
      />

      <div className="flex items-center gap-kit-controls">
        {attachments ? (
          <>
            <input
              ref={picker}
              type="file"
              multiple
              hidden
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                addFiles(Array.from(e.target.files ?? []))
                // Reset, so picking the same file again still fires.
                e.target.value = ""
              }}
            />
            <IconButton icon={Attachment01Icon} aria-label="Attach files" onClick={() => picker.current?.click()} />
          </>
        ) : null}
        {tools}
        <span className="ml-auto">
          {busy && onStop ? (
            <Button onClick={onStop}>Stop</Button>
          ) : (
            <Button
              type="submit"
              variant={isAction && canSend ? "action" : "quiet"}
              disabled={!canSend}
              // Disabled after a send, but still holding focus: losing it to
              // the page would drop a keyboard or screen-reader user.
              focusableWhenDisabled
            >
              Send
            </Button>
          )}
        </span>
      </div>
      {note ? (
        <p id={noteId} role="status" className="px-1.5 text-kit-small text-kit-ink">
          {note}
        </p>
      ) : null}
    </form>
  )
}

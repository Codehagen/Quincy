"use client"

import * as React from "react"

import { Arrive } from "./arrive"
import { Button } from "./button"
import { Card, type CardWidth } from "./card"
import { Text } from "./text"

export type UndoBarProps = {
  /**
   * Whether the Undo is here. Flip it true in the same state change that
   * removes the item; flip it false on the next action on the page, or when
   * Undo is pressed. It folds away with Arrive either way.
   */
  show: boolean
  /**
   * One sentence, past tense, naming what went: "Dismissed the voice note
   * from today." Pass it only while `show` is true; while leaving, the bar
   * keeps the sentence it last showed (Arrive presence).
   */
  children: React.ReactNode
  /** Puts the item back. Then focus the restored item: the bar is leaving. */
  onUndo: () => void
  /** The width of the object it stands in for, so the edges line up. */
  width?: CardWidth
  /** After the fold ends. Rarely needed; Arrive's presence hook. */
  onExitComplete?: () => void
  /** The Undo button, for a MenuPanel `finalFocus` that must land on it. */
  ref?: React.Ref<HTMLButtonElement>
}

/**
 * The Undo that stands where a removed object stood: its own Card on the
 * Stage, one muted sentence and a quiet Undo. Every remove flow an Undo can
 * take back has one (docs/design/removing.md).
 *
 * - It arrives with Arrive (`appear`), so it can mount already showing.
 * - Focus lands on Undo the moment it shows, so a keyboard user is never
 *   dropped on `body` when the item and its button go. Undo is described
 *   by the sentence, so a screen reader hears what it brings back.
 * - It never times out. It leaves on the person's next action.
 * - One per page: a second removal replaces the sentence, it does not stack.
 */
export function UndoBar({
  show,
  children,
  onUndo,
  width = "full",
  onExitComplete,
  ref,
}: UndoBarProps) {
  const sentenceId = React.useId()
  const buttonRef = React.useRef<HTMLButtonElement>(null)

  // The Arrive is not inert from the commit that shows it, so the focus
  // lands on the first try, whether the bar mounted or flipped.
  React.useEffect(() => {
    if (show) buttonRef.current?.focus()
  }, [show])

  const setRefs = React.useCallback(
    (el: HTMLButtonElement | null) => {
      buttonRef.current = el
      if (typeof ref === "function") return ref(el)
      if (ref) ref.current = el
    },
    [ref],
  )

  return (
    <Arrive show={show} appear onExitComplete={onExitComplete}>
      <Card width={width}>
        <div
          data-slot="kit-undo-bar"
          className="flex flex-wrap items-center justify-between gap-kit-related"
        >
          <Text tone="muted" id={sentenceId}>
            {children}
          </Text>
          <Button ref={setRefs} aria-describedby={sentenceId} onClick={onUndo}>
            Undo
          </Button>
        </div>
      </Card>
    </Arrive>
  )
}

/**
 * Who owns a key press on the desk: the editor (Space plays, S splits,
 * Backspace deletes) or the thing that has focus.
 *
 * A text field owns every key, or typing an s into the composer would split
 * the timeline. A focused control owns its keys too: Space presses a toolbar
 * button rather than toggling playback. The timeline is the exception — its
 * clips are buttons, and clicking one focuses it, so Backspace there is the
 * delete it was selected for (`data-editor-keys`).
 *
 * The chat margin is its own key scope (`data-chat-keys`). Its thread is a
 * focusable scroller, not a text field, so without the scope a press of S
 * after clicking in the thread split the clip under the playhead and broke
 * "Undo the run". Escape and ⌘Z / ⇧⌘Z still mean the editor from anywhere.
 */

/** The part of a DOM element the decision reads; an HTMLElement fits. */
export type KeyTarget = {
  tagName: string
  isContentEditable: boolean
  closest(selector: string): { closest(selector: string): unknown } | null
}

export type KeyPress = {
  key: string
  metaKey: boolean
  ctrlKey: boolean
}

const CONTROL =
  "button, a[href], select, [role=button], [role=menuitem], [role=slider], [role=option], [role=tab], [role=switch], [role=checkbox]"

/** True when the editor should act on this key press. */
export function editorOwnsKey(target: KeyTarget | null, event: KeyPress): boolean {
  if (
    target?.tagName === "INPUT" ||
    target?.tagName === "TEXTAREA" ||
    target?.isContentEditable
  ) {
    return false
  }

  const editorWide =
    event.key === "Escape" ||
    ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z")
  if (editorWide) return true

  if (target?.closest("[data-chat-keys]")) return false

  const control = target?.closest(CONTROL)
  if (control && !control.closest("[data-editor-keys]")) return false

  return true
}

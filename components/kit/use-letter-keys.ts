"use client"

import * as React from "react"

/**
 * A workspace's letter keys (docs/design/workspace.md, "Keys"): bare keys
 * that act on the open item (j k to move, D, N, U, / to search).
 *
 * ```ts
 * useLetterKeys({
 *   j: () => move(1),
 *   k: () => move(-1),
 *   "/": () => searchRef.current?.focus(),
 *   d: { run: () => draft(open), once: true },
 * })
 * ```
 *
 * What it does so each page does not have to get it right again:
 *
 * - **One document listener, in the capture phase.** A handled key calls
 *   `preventDefault()` and `stopPropagation()`, so a DataList's typeahead
 *   never takes N as the first letter of a title and moves before the action
 *   runs, and the app's bare D (theme) never sees it. The page's root carries
 *   `data-letter-keys` for the second reason as well.
 * - **Ignored where letters are text:** in an input, a textarea, a select or
 *   a contenteditable, with ⌘, Ctrl or Alt held, and inside an open menu or
 *   dialog.
 * - **`once`:** a key that spends or removes (Draft, Not this one) does not
 *   repeat while held. A held D is one press, not a burst.
 *
 * Keys are matched lower case for letters (`d` answers D and d). Handlers
 * are read through a ref, so the map can be a fresh object every render and
 * the listener still binds once.
 */

export type LetterKeyHandler =
  | ((event: KeyboardEvent) => void)
  | {
      run: (event: KeyboardEvent) => void
      /** Ignore auto-repeat while the key is held. */
      once?: boolean
    }

export type LetterKeyMap = Readonly<Record<string, LetterKeyHandler | undefined>>

function isTextTarget(t: EventTarget | null) {
  if (!(t instanceof HTMLElement)) return false
  return /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable
}

export function useLetterKeys(keys: LetterKeyMap, { enabled = true }: { enabled?: boolean } = {}) {
  const live = React.useRef(keys)
  React.useLayoutEffect(() => {
    live.current = keys
  })

  React.useEffect(() => {
    if (!enabled) return
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (isTextTarget(e.target)) return
      const t = e.target instanceof Element ? e.target : null
      if (t?.closest('[role="menu"], [role="dialog"], [role="alertdialog"]')) return
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
      const handler = live.current[key]
      if (!handler) return
      e.preventDefault()
      e.stopPropagation()
      if (typeof handler === "function") return handler(e)
      if (handler.once && e.repeat) return
      handler.run(e)
    }
    document.addEventListener("keydown", onKey, true)
    return () => document.removeEventListener("keydown", onKey, true)
  }, [enabled])
}

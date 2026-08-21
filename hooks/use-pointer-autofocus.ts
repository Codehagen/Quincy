"use client"

import * as React from "react"

/**
 * Focus an element after mount, unless the pointer is coarse.
 *
 * The autoFocus attribute fires everywhere, and on a phone that means the
 * keyboard slides up over the page before the user has asked for anything.
 * Reading the media query in an effect also keeps it off the render path, so
 * there is nothing for hydration to disagree about.
 */
export function usePointerAutofocus<T extends HTMLElement>(enabled = true) {
  const ref = React.useRef<T>(null)

  React.useEffect(() => {
    if (!enabled) {
      return
    }

    if (window.matchMedia("(pointer: coarse)").matches) {
      return
    }

    ref.current?.focus()
  }, [enabled])

  return ref
}

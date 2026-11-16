"use client"

import * as React from "react"

/**
 * One live region for a whole surface (a workspace page), mounted with it
 * and never remounted. A status node that arrives with its text already in
 * it is often not read at all, so every message (the count after a search,
 * "Set aside … Press U to undo.", the recorder) changes the text of this one
 * node instead of mounting a node of its own.
 *
 * Polite: it waits for the screen reader to finish what it is saying. The
 * same message twice in a row is still read: the second takes a trailing
 * no-break space, so the text changes.
 *
 * ```tsx
 * <Announcer>
 *   <Toolbar …/>   // anything inside calls useAnnounce()("4 of 19 ideas")
 * </Announcer>
 * ```
 */
const AnnounceContext = React.createContext<(text: string) => void>(() => {})

export type AnnouncerProps = {
  children: React.ReactNode
}

export function Announcer({ children }: AnnouncerProps) {
  const [text, setText] = React.useState("")
  const announce = React.useCallback((next: string) => {
    // A repeat toggles a trailing no-break space, so the node's text changes.
    setText((prev) => (prev === next && next !== "" ? `${next}\u00a0` : next))
  }, [])
  return (
    <AnnounceContext.Provider value={announce}>
      {children}
      <p role="status" data-slot="kit-announcer" className="sr-only">
        {text}
      </p>
    </AnnounceContext.Provider>
  )
}

/**
 * Says `text` through the nearest Announcer. Outside one it does nothing,
 * so a component can announce without knowing whether the page set one up.
 * Stable across renders: safe in an effect's dependency list.
 */
export function useAnnounce() {
  return React.useContext(AnnounceContext)
}

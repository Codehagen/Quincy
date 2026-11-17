"use client"

import * as React from "react"

/**
 * The clock for /settings ("09:15 there now"). The server's instant through
 * the server render and hydration, so both paint the same minute; the real
 * time from then on, every 15s, so the time zone row stays true while the
 * page is open. An external store rather than state set in an effect: the
 * clock is outside React.
 */
let clock: Date | null = null
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | null = null

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!timer) {
    clock = new Date()
    timer = setInterval(() => {
      clock = new Date()
      listeners.forEach((l) => l())
    }, 15_000)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer) {
      clearInterval(timer)
      timer = null
    }
  }
}

function snapshot(): Date {
  if (!clock) clock = new Date()
  return clock
}

export function useNow(serverIso: string): Date {
  const server = React.useMemo(() => new Date(serverIso), [serverIso])
  return React.useSyncExternalStore(subscribe, snapshot, () => server)
}

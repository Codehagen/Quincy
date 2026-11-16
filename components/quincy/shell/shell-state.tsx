"use client"

import * as React from "react"

import { useIsMobile } from "@/hooks/use-mobile"

import { SIDEBAR_COOKIE, SIDEBAR_COOKIE_MAX_AGE } from "./shell-cookie"

/**
 * Who opens the sidebar, and where it is remembered. One context so the bar's
 * toggle, the shortcut and the sheet agree.
 *
 * - Desktop (≥ 768px): `open`, written to the `sidebar_state` cookie so the
 *   layout can seed it on the next request and a collapsed sidebar never
 *   flashes open (shell-cookie.ts).
 * - Phone: `openMobile`, a sheet. Never persisted: a sheet left open on the
 *   last visit is not a preference.
 */

/**
 * ⌘B on Apple, Ctrl+B elsewhere.
 *
 * An exception to "handlers accept both modifiers" (AGENTS.md), and a
 * deliberate one: on a Mac, Ctrl+B is not a spare chord. Every native text
 * field binds it to "back one character" (the Emacs keys macOS ships), so
 * taking it would toggle the sidebar under somebody moving their caret. On
 * Apple only ⌘ counts; elsewhere only Ctrl, because there the Windows/Super
 * key belongs to the OS.
 */
const SHORTCUT_KEY = "b"

function isApplePlatform() {
  const nav = navigator as Navigator & {
    userAgentData?: { platform?: string }
  }
  const platform = nav.userAgentData?.platform || nav.platform || ""
  return /mac|iphone|ipad|ipod/i.test(platform)
}

type ShellState = {
  open: boolean
  openMobile: boolean
  setOpenMobile: (open: boolean) => void
  isMobile: boolean
  toggle: () => void
}

const ShellContext = React.createContext<ShellState | null>(null)

export function useShell(): ShellState {
  const value = React.useContext(ShellContext)
  if (!value) throw new Error("useShell must be used inside <AppShell>.")
  return value
}

export function ShellStateProvider({
  defaultOpen,
  children,
}: {
  defaultOpen: boolean
  children: React.ReactNode
}) {
  const isMobile = useIsMobile()
  const [open, setOpenState] = React.useState(defaultOpen)
  const [openMobile, setOpenMobile] = React.useState(false)

  const toggle = React.useCallback(() => {
    if (isMobile) {
      setOpenMobile((value) => !value)
      return
    }
    const next = !open
    setOpenState(next)
    document.cookie = `${SIDEBAR_COOKIE}=${next}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}; samesite=lax`
  }, [isMobile, open])

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== SHORTCUT_KEY) return
      // A held key repeats, and would flap the sidebar open and shut. An
      // editor that took ⌘B for bold has prevented it, and keeps it.
      if (event.repeat || event.defaultPrevented) return
      if (event.altKey || event.shiftKey) return
      const apple = isApplePlatform()
      const chord = apple
        ? event.metaKey && !event.ctrlKey
        : event.ctrlKey && !event.metaKey
      if (!chord) return
      event.preventDefault()
      toggle()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [toggle])

  // Grown past the breakpoint with the sheet open: the sheet has no place on
  // a desktop, and reopening it later should be a choice.
  // Adjusted during render, not in an effect, so no frame shows it open.
  const [wasMobile, setWasMobile] = React.useState(isMobile)
  if (wasMobile !== isMobile) {
    setWasMobile(isMobile)
    if (!isMobile && openMobile) setOpenMobile(false)
  }

  const value = React.useMemo(
    () => ({ open, openMobile, setOpenMobile, isMobile, toggle }),
    [open, openMobile, isMobile, toggle],
  )

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>
}

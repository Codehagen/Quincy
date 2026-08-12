"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"

import "../picker.css"
import type { ConversationSummary } from "@/lib/conversations"
import { AppSidebar } from "@/components/app-sidebar"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"

import { Roster } from "./variants/roster"

/**
 * The question was: what does a source row have to prove? Roster said it
 * exists, Feed said it is still working, Supply said something is waiting for
 * it. Roster won on symmetry with /channels — the two pages are the same
 * question in opposite directions and should be read with one habit.
 *
 * Feed and Supply are deleted. The harness stays so the next exploration is one
 * import and one line here, not a rebuild — the picker, the shell, the fixtures
 * and the entrance timing are all still wired.
 *
 * Supply is worth remembering rather than just deleting: filing sources by what
 * reads them is what surfaced that four of them have no reader at all and the
 * four that do are all `available: false`. That belongs on this page again the
 * day rhythms start running.
 */
const VARIANTS = [{ name: "Roster", render: () => <Roster /> }]

/**
 * Fixtures for the real shell. Fixed dates rather than anything derived from
 * `now`, so the server and client render the same string.
 */
const USER = {
  name: "Christer Hagen",
  email: "christer@quincy.test",
  image: null,
}

const CONVERSATIONS: ConversationSummary[] = [
  {
    id: "c1",
    title: "Thread about the X pricing change",
    updatedAt: new Date("2026-08-03T09:12:00Z"),
  },
  {
    id: "c2",
    title: "LinkedIn post on hiring",
    updatedAt: new Date("2026-08-02T14:40:00Z"),
  },
  {
    id: "c3",
    title: "Weekly numbers",
    updatedAt: new Date("2026-07-30T08:05:00Z"),
  },
]

export function Harness() {
  // Read through the router hook rather than syncing an effect off
  // location.search: the hook resolves on the server too, so the first paint
  // already carries the right variant and there is no setState-in-effect.
  const params = useSearchParams()
  const requested = parseInt(params.get("v") ?? "", 10)
  const [current, setCurrent] = React.useState(
    requested >= 1 && requested <= VARIANTS.length ? requested - 1 : 0
  )
  const [ready, setReady] = React.useState(false)

  const itemRefs = React.useRef<(HTMLButtonElement | null)[]>([])
  const [highlight, setHighlight] = React.useState({ left: 0, width: 0 })

  const measure = React.useCallback(() => {
    const el = itemRefs.current[current]
    if (!el) return
    setHighlight({ left: el.offsetLeft, width: el.offsetWidth })
  }, [current])

  React.useLayoutEffect(() => {
    measure()
  }, [measure])

  React.useEffect(() => {
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [measure])

  // Two frames, so the highlight takes its initial position without sliding
  // in from zero on load.
  React.useEffect(() => {
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => setReady(true))
    )
    return () => cancelAnimationFrame(id)
  }, [])

  const select = React.useCallback((i: number) => {
    if (i < 0 || i >= VARIANTS.length) return
    setCurrent(i)
    const url = new URL(location.href)
    url.searchParams.set("v", String(i + 1))
    history.replaceState(null, "", url)
  }, [])

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      if (
        t &&
        (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)
      ) {
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return

      const num = parseInt(e.key, 10)
      if (num >= 1 && num <= VARIANTS.length) select(num - 1)
      else if (e.key === "ArrowRight") select((current + 1) % VARIANTS.length)
      else if (e.key === "ArrowLeft")
        select((current - 1 + VARIANTS.length) % VARIANTS.length)
    }

    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [current, select])

  return (
    <>
      {/* The real shell, mirroring app/(app)/layout.tsx — a sources page is
          judged at the width the sidebar leaves it, not at full viewport.
          No nav row highlights: usePathname reads /prototypes/sources, and
          faking it would mean touching the production component. */}
      <SidebarProvider defaultOpen className="h-svh">
        <AppSidebar conversations={CONVERSATIONS} user={USER} />
        <SidebarInset className="min-h-0 overflow-hidden">
          <div className="bg-background flex h-12 shrink-0 items-center gap-2 px-3">
            <SidebarTrigger />
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {/* Keyed on the variant so switching remounts and any local state
                inside it resets. The swap itself is instant — flipping is a
                high-frequency action and an animation on it would tax every
                comparison. */}
            <div key={current}>{VARIANTS[current].render()}</div>
          </div>
        </SidebarInset>
      </SidebarProvider>

      <nav
        className="proto-picker"
        aria-label="Prototype variants"
        {...(ready ? { "data-ready": "" } : {})}
      >
        <span
          className="proto-picker-highlight"
          aria-hidden="true"
          style={{
            width: highlight.width,
            transform: `translateX(${highlight.left}px)`,
          }}
        />
        {VARIANTS.map((v, i) => (
          <button
            key={v.name}
            ref={(el) => {
              itemRefs.current[i] = el
            }}
            className="proto-picker-item"
            onClick={() => select(i)}
            {...(i === current
              ? { "data-active": "", "aria-current": "true" as const }
              : {})}
          >
            {v.name}
          </button>
        ))}
      </nav>
    </>
  )
}

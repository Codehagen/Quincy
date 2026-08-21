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

import { Briefing } from "./variants/briefing"
import { Desk } from "./variants/desk"
import { Ledger } from "./variants/ledger"

/**
 * The question: /settings is a placeholder promising "the switches you set
 * once", and there are now six real ones — name, time zone, password, sessions,
 * the address, and the way out. This asks what shape holds them.
 *
 * Desk is the conventional card-per-concern page /settings/billing already
 * uses. Ledger is one dense column of values with edit in place. Briefing is
 * the same content spoken by Quincy, with the facts as the controls.
 *
 * Deliberately not on any of them: theme. It lives in the user menu, and
 * `components/user-menu.tsx` argues why — it is a control, not a destination,
 * and a menu is the only place that can hold System as a third state. A copy
 * here would be a second source of truth for one toggle.
 */
const VARIANTS = [
  { name: "Desk", render: () => <Desk /> },
  { name: "Ledger", render: () => <Ledger /> },
  { name: "Briefing", render: () => <Briefing /> },
]

/** Fixtures for the real shell. Fixed dates, so server and client agree. */
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
      {/* The real shell, mirroring app/(app)/layout.tsx — a settings page is
          judged at the width the sidebar leaves it, not at full viewport. */}
      <SidebarProvider defaultOpen className="h-svh">
        <AppSidebar conversations={CONVERSATIONS} user={USER} />
        <SidebarInset className="min-h-0 overflow-hidden">
          <div className="flex h-12 shrink-0 items-center gap-2 bg-background px-3">
            <SidebarTrigger />
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {/* Keyed on the variant so switching remounts and any half-open
                editor inside it resets. The swap itself is instant. */}
            <div key={current}>{VARIANTS[current].render()}</div>
          </div>
        </SidebarInset>
      </SidebarProvider>

      {/* No replay button: nothing here has an entrance worth re-triggering,
          and a settings page that animates on arrival would be the finding
          rather than the harness. */}
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

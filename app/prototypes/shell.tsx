"use client"

import * as React from "react"

import type { ConversationSummary } from "@/lib/conversations"
import { AppShell } from "@/components/quincy/shell/app-shell"

/**
 * The real app chrome, mirroring app/(app)/layout.tsx, so a prototype is judged
 * at the width the sidebar leaves it rather than at full viewport.
 *
 * Shared by the index harness and the detail route — before this existed the
 * two would have drifted, and a detail page judged in a different frame than
 * the list it opens from is not a comparison.
 *
 * No nav row highlights: usePathname reads /prototypes/*, and faking it would
 * mean touching the production sidebar.
 */

const USER = {
  name: "Christer Hagen",
  email: "christer@quincy.test",
  image: null,
}

/** Fixed dates, so the server and client render the same string. */
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

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <AppShell defaultOpen conversations={CONVERSATIONS} user={USER}>
      {children}
    </AppShell>
  )
}

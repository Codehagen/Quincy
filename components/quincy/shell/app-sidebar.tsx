"use client"

import { usePathname } from "next/navigation"

import { NavRow, Tag } from "@/components/kit"
import { QuincyMark } from "@/components/mascot"

import { AccountMenu, type ShellUser } from "./account-menu"
import { NAV, isActive } from "./nav"

export type AppSidebarProps = {
  user: ShellUser
  /**
   * How many things wait for the person, by route (`{ "/drafts": 2 }`): a
   * dot on that row (lab 36). Omitted today: the layout loads nothing that
   * counts them yet (docs/design/app-shell.md, "Open").
   */
  waiting?: Partial<Record<string, number>>
}

/**
 * The sidebar's contents, the same on a desktop and in the phone's sheet
 * (Desk, shell lab 2026-11-16): the mark, one flat list of the six places you
 * work, and the account in the foot. Setup and the account pages are in the
 * account menu; the conversation history is in Studio (app-shell.tsx).
 *
 * Rows sit straight on the ground with no List object around them (lab 36):
 * the sidebar is the frame, and a white object here would compete with the
 * one object on every page's stage. The icons stay beside the labels (the
 * owner's one change to Desk).
 */
export function AppSidebar({ user, waiting }: AppSidebarProps) {
  const pathname = usePathname()

  return (
    <nav aria-label="Quincy" className="flex h-full min-h-0 flex-col">
      {/* Not a link: Studio is the first row. kit-shell-mark is the shell's
          8 plus a row's 16, so the friend sits on the icons' column. */}
      <div className="flex h-kit-shell-bar shrink-0 items-center px-kit-shell-mark text-kit-ink select-none">
        <QuincyMark size="sm" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-kit-shell-pad pb-kit-related">
        <ul>
          {NAV.map((item) => {
            // Opening the page is what clears its dot, so the current row
            // never has one.
            const current = isActive(pathname, item.href)
            return (
              <li key={item.href}>
                <NavRow
                  href={item.href}
                  icon={item.icon}
                  current={current}
                  waiting={current ? 0 : waiting?.[item.href]}
                  density="compact"
                  meta={item.badge ? <Tag>{item.badge}</Tag> : undefined}
                >
                  {item.label}
                </NavRow>
              </li>
            )
          })}
        </ul>
      </div>

      {/* The account is the only thing in the foot: who the rows belong to,
          and the way into setup. No rule above it; the space is the edge. */}
      <div className="shrink-0 px-kit-shell-pad pb-[max(var(--spacing-kit-shell-pad),env(safe-area-inset-bottom,0px))]">
        <AccountMenu user={user} />
      </div>
    </nav>
  )
}

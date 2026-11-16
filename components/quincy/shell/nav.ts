import {
  BrainIcon,
  BulbIcon,
  Calendar03Icon,
  ChartLineData01Icon,
  Coins01Icon,
  CreditCardIcon,
  Megaphone01Icon,
  Message01Icon,
  Plug01Icon,
  QuillWrite01Icon,
  RepeatIcon,
  Settings01Icon,
} from "@hugeicons/core-free-icons"
import type { IconSvgElement } from "@hugeicons/react"

/**
 * The route model, so adding a surface is one line in one file. A plain
 * module (no "use client"), so a server component and a test can both read
 * it (memory: client module constants are proxies).
 *
 * Desk (shell lab, chosen 2026-11-16): the sidebar is one flat list of the
 * places you work every day. Setup is touched once and then left alone, and
 * the account once a month, so both live in the account menu.
 */

export type NavItem = {
  href: string
  /** What a person reads. Never "Riffs": the page is Ideas (plans/029, "Words"). */
  label: string
  icon: IconSvgElement
}

/** The sidebar: the room you talk in, then the things you make and what feeds them. */
export const NAV: NavItem[] = [
  { href: "/studio", label: "Studio", icon: Message01Icon },
  // The route was /riffs until 2026-11-16 (next.config.ts redirects it); the
  // code and the tables still say riff (plans/029).
  { href: "/ideas", label: "Ideas", icon: BulbIcon },
  { href: "/drafts", label: "Drafts", icon: QuillWrite01Icon },
  { href: "/lineup", label: "Lineup", icon: Calendar03Icon },
  { href: "/numbers", label: "Numbers", icon: ChartLineData01Icon },
  // In the sidebar, not in Setup: connecting a source is a thing you come
  // back to as the work changes, not a one-off.
  { href: "/sources", label: "Sources", icon: Plug01Icon },
  // No Cuts row. /cuts is the largest unfinished surface in the app, and a
  // row would promise a finished one (app/(app)/cuts/page.tsx, plans/031).
]

/**
 * The account menu's Setup group. Read as a sentence: who you are, where it
 * goes out, how often. Brain first: it changes what every draft comes out like.
 */
export const SETUP_NAV: NavItem[] = [
  { href: "/brain", label: "Brain", icon: BrainIcon },
  { href: "/channels", label: "Channels", icon: Megaphone01Icon },
  { href: "/rhythm", label: "Rhythm", icon: RepeatIcon },
]

/** The account menu's account rows, above Why and Sign out. */
export const ACCOUNT_NAV: NavItem[] = [
  { href: "/credits", label: "Credits", icon: Coins01Icon },
  // Billing beside Settings, not inside it: "why has this stopped" and
  // "cancel this" should not have to guess, and the banner links here.
  { href: "/settings/billing", label: "Billing", icon: CreditCardIcon },
  { href: "/settings", label: "Settings", icon: Settings01Icon },
]

/** Every route the shell links to, sidebar and menu together. */
export const ALL_NAV: NavItem[] = [...NAV, ...SETUP_NAV, ...ACCOUNT_NAV]

/** The full conversation index. Reached from Studio's history menu. */
export const CONVERSATIONS_HREF = "/conversations"

/**
 * Exact match for the root, prefix match on a path boundary for everything
 * else. A bare startsWith would light Rhythm on /rhythm-grid.
 */
export function isActive(pathname: string, href: string): boolean {
  // A conversation is Studio with something in it, so Studio stays lit while
  // reading one. /c/ is not under /studio so a thread has a short link.
  // /conversations is not Studio: it is the index, reached from Studio's
  // history menu, and lighting Studio there would say you are in the room
  // you are looking at the list of. Nothing in the sidebar is lit; the
  // phone bar names the page itself (app-shell.tsx).
  if (href === "/studio") {
    return pathname === "/studio" || pathname.startsWith("/c/")
  }
  // Settings is exact-only, because /settings/billing is its own row.
  if (href === "/settings") {
    return pathname === "/settings"
  }
  return pathname === href || pathname.startsWith(`${href}/`)
}

/** The item a route belongs to, for the phone bar's title. */
export function navItemFor(pathname: string): NavItem | undefined {
  return ALL_NAV.find((item) => isActive(pathname, item.href))
}

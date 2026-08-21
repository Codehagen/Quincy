"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
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
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"

import type { ConversationSummary } from "@/lib/conversations"
import { ConversationList } from "@/components/conversation-list"
import { UserMenu } from "@/components/user-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar"

type NavItem = {
  href: string
  label: string
  icon: IconSvgElement
}

type NavGroup = {
  label?: string
  items: NavItem[]
}

/**
 * The route model lives here, so adding a surface is one line in one file.
 *
 * Grouping follows the work rather than the feature list: the room you talk in,
 * then the things you make, then the machine that feeds them. Config sits at
 * the bottom because it is touched once a month, not once an hour.
 */
const NAV: NavGroup[] = [
  {
    items: [{ href: "/studio", label: "Studio", icon: Message01Icon }],
  },
  {
    label: "Make",
    items: [
      { href: "/riffs", label: "Riffs", icon: BulbIcon },
      { href: "/drafts", label: "Drafts", icon: QuillWrite01Icon },
      { href: "/lineup", label: "Lineup", icon: Calendar03Icon },
      { href: "/numbers", label: "Numbers", icon: ChartLineData01Icon },
    ],
  },
  {
    label: "Setup",
    items: [
      // Read as a sentence: who you are, where it goes out, how often, what
      // feeds it. Brain first because it is the one surface that changes what
      // every draft comes out like.
      //
      // No Voice row. /voice was a placeholder promising "How you sound" while
      // the real, working page sat inside Brain saying the same sentence. Two
      // rows, one name, and the one you could actually reach did nothing. The
      // page lives at /brain?page=voice, which is where the tree points.
      { href: "/brain", label: "Brain", icon: BrainIcon },
      { href: "/channels", label: "Channels", icon: Megaphone01Icon },
      { href: "/rhythm", label: "Rhythm", icon: RepeatIcon },
      { href: "/sources", label: "Sources", icon: Plug01Icon },
    ],
  },
]

const FOOTER_NAV: NavItem[] = [
  { href: "/credits", label: "Credits", icon: Coins01Icon },
  // Billing above Settings, not inside it. Somebody looking for "why has this
  // stopped working" or "cancel this" should not have to guess which page it
  // is filed under — and the read-only banner links straight here.
  { href: "/settings/billing", label: "Billing", icon: CreditCardIcon },
  { href: "/settings", label: "Settings", icon: Settings01Icon },
]

/**
 * Exact match for the root, prefix match on a path boundary for everything
 * else. A bare startsWith would light up Rhythm while sitting on /rhythm-grid,
 * which is a different page.
 */
function isActive(pathname: string, href: string) {
  // A conversation is Studio with something in it, so the row stays lit while
  // reading one. /c/ is not under /studio in the URL because a thread deserves
  // a short link to send someone.
  if (href === "/studio") {
    return pathname === "/studio" || pathname.startsWith("/c/")
  }

  // Settings is exact-only, because /settings/billing is its own row. The
  // prefix rule below would otherwise light both of them at once and leave the
  // sidebar claiming you are in two places.
  if (href === "/settings") {
    return pathname === "/settings"
  }

  return pathname === href || pathname.startsWith(`${href}/`)
}

function AppSidebar({
  conversations,
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  conversations: ConversationSummary[]
  user: { name?: string | null; email: string; image?: string | null }
}) {
  const pathname = usePathname()

  return (
    <Sidebar collapsible="icon" {...props}>
      {/* Vertical breathing only. The horizontal padding stays at the header's
          default p-2 so it matches SidebarGroup — overriding it was what threw
          the mark off the icon column. */}
      <SidebarHeader className="py-4">
        {/* Collapsed, the wordmark is display:none and the mark is decorative,
            which would leave this link with no accessible name at all. The
            label carries it in both states. */}
        <Link
          href="/studio"
          aria-label="Quincy"
          // Same geometry as a menu button, so the mark lands on the icon
          // column in both states: 32px box, 8px inset. Expanded that puts the
          // mark's left edge on the icons' left edge; collapsed, centring the
          // box centres the mark on the same axis the icons sit on.
          className="flex h-8 items-center gap-2.5 rounded-md px-2 ring-sidebar-ring outline-hidden group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 focus-visible:ring-2"
        >
          {/* The mark keeps its footprint when the rail collapses, so the
              wordmark is the only thing that disappears. */}
          <span
            aria-hidden="true"
            className="flex size-5 shrink-0 items-center justify-center rounded bg-sidebar-foreground font-mono text-[0.6875rem] leading-none font-semibold text-sidebar select-none"
          >
            Q
          </span>
          <span
            aria-hidden="true"
            className="truncate text-card-title group-data-[collapsible=icon]:hidden"
          >
            Quincy
          </span>
        </Link>
      </SidebarHeader>

      {/* scroll-fade-y earns its place here. SidebarContent ships no-scrollbar,
          and at 560px tall the whole Conversations section sits below the fold —
          with the bar hidden and nothing fading, the sidebar reads as a finished
          nav that simply has no history. The fade is the only thing saying
          otherwise, and it is what the chat rail and the message list already
          pair with no-scrollbar.

          Pinning the fixed groups and scrolling only history was the other
          option, and it is worse: nine rows and two labels want 400px, the
          content box has 351, so history gets squeezed to nothing with the
          scroller gone. Everything scrolls; the fade says so. */}
      <SidebarContent className="scroll-fade-y">
        {NAV.map((group, index) => (
          <SidebarGroup key={group.label ?? `group-${index}`}>
            {group.label ? (
              <SidebarGroupLabel className="text-eyebrow uppercase">
                {group.label}
              </SidebarGroupLabel>
            ) : null}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <NavRow key={item.href} item={item} pathname={pathname} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
        {/* Below the fixed surfaces: those are the product, this is history. */}
        <ConversationList conversations={conversations} />
      </SidebarContent>

      {/* Two lists with a rule between them, rather than one list with a rule
          inside it. The rows above are places to go; the account below is who
          they belong to, and a <div role="separator"> is not a valid child of
          a <ul> — it muddies the list count for anyone listening to it. */}
      <SidebarFooter>
        <SidebarMenu>
          {FOOTER_NAV.map((item) => (
            <NavRow key={item.href} item={item} pathname={pathname} />
          ))}
        </SidebarMenu>
        {/* mx-0 on purpose. The shipped default is mx-2, which assumes the
            separator sits directly under Sidebar; inside SidebarFooter's own
            p-2 the inset lands twice and the rule stops 8px short of the rows
            it divides. Footer's gap-2 supplies the vertical air. */}
        <SidebarSeparator className="mx-0" />
        <SidebarMenu>
          <SidebarMenuItem>
            <UserMenu user={user} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}

function NavRow({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(pathname, item.href)

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={active}
        tooltip={item.label}
        render={
          <Link href={item.href} aria-current={active ? "page" : undefined} />
        }
      >
        {/* Third signal for the active row. shadcn's variant gives active the
            same background as hover and leans on font-weight alone to separate
            them, which is too quiet. Icon strength carries the difference
            without reaching for brass — brass means live, not here. */}
        <HugeiconsIcon
          aria-hidden="true"
          icon={item.icon}
          size={16}
          strokeWidth={1.8}
          className="text-muted-foreground group-data-active/menu-button:text-sidebar-accent-foreground"
        />
        <span>{item.label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

export { AppSidebar }

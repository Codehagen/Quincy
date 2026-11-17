"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { Dialog } from "@base-ui/react/dialog"
import {
  Menu01Icon,
  MessageMultiple01Icon,
  SidebarLeftIcon,
} from "@hugeicons/core-free-icons"

import {
  ButtonLink,
  IconButton,
  KitRoot,
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuLinkItem,
  MenuPanel,
  MenuSeparator,
  MenuTrigger,
  Tooltip,
} from "@/components/kit"
// The overlays' shared classes: not on the kit's index, but the phone sheet
// is an overlay and has to agree with the others (scrim, portalled type).
import { PORTAL_TYPE, SCRIM } from "@/components/kit/overlay-styles"
import type { ConversationSummary } from "@/lib/conversations"
import { formatConversationDate } from "@/lib/format-date"
import { browserTimeZone, hhmmIn, resolveTimeZone } from "@/lib/timezone"

import type { ShellUser } from "./account-menu"
import { AppSidebar } from "./app-sidebar"
import { CONVERSATIONS_HREF, isActive, navItemFor } from "./nav"
import { ShellStateProvider, useShell } from "./shell-state"

export type AppShellProps = {
  /** From the `sidebar_state` cookie, read by the layout: no flash on load. */
  defaultOpen: boolean
  /** The recent threads, for Studio's history menu (not the sidebar). */
  conversations: ConversationSummary[]
  /**
   * The account's zone (`user.timezone`), so the history menu's "Today" and
   * its clock agree with every other date in the product. Null for an account
   * that has none yet; the browser's zone stands in.
   */
  timeZone?: string | null
  user: ShellUser
  /** Things waiting for the person, by route. See AppSidebar. */
  waiting?: Partial<Record<string, number>>
  /**
   * The state of the account (the read-only billing notice), above the page
   * and outside the scroll, so it is never scrolled past.
   */
  banner?: React.ReactNode
  /** The page. A kit page renders <KitPage>; an old one renders itself. */
  children: React.ReactNode
}

const SIDEBAR_ID = "app-sidebar"
const CONTENT_ID = "app-content"
const SHOW_LABEL = "Show sidebar"

/** The threads the layout loaded, for Studio's history wherever it renders. */
const HistoryContext = React.createContext<ConversationSummary[] | null>(null)

/** The account zone the history rows are drawn in. See AppShellProps. */
const HistoryZoneContext = React.createContext<string | null>(null)

/**
 * The frame every page inside app/(app) sits in (docs/design/app-shell.md):
 * KitRoot, the sidebar, and the `<main>` landmark that the page fills. Pages
 * own nothing of it; KitPage is the page's own column inside `<main>`.
 *
 * Desk (shell lab, chosen 2026-11-16): no bar over the page on a desktop.
 * The sidebar hides and shows on ⌘B / Ctrl+B; while it is hidden, one icon
 * in the content's top-left corner brings it back. Studio's history is in
 * Studio's own composer (ConversationHistory). A phone always has a bar,
 * because the sheet needs a way in.
 *
 * h-dvh, not min-h: a definite height is what gives every scroll container
 * below a ceiling, so the chat's own viewport scrolls instead of growing.
 * dvh, not svh: it tracks the visible area, so with the root viewport's
 * `resizes-content` the composer rides above the on-screen keyboard.
 */
export function AppShell({ defaultOpen, timeZone, ...props }: AppShellProps) {
  return (
    <KitRoot>
      <ShellStateProvider defaultOpen={defaultOpen}>
        <HistoryContext value={props.conversations}>
          <HistoryZoneContext value={timeZone ?? null}>
            <Frame {...props} />
          </HistoryZoneContext>
        </HistoryContext>
      </ShellStateProvider>
    </KitRoot>
  )
}

function Frame({ conversations, user, waiting, banner, children }: Omit<AppShellProps, "defaultOpen" | "timeZone">) {
  const { open, isMobile } = useShell()
  const sidebar = <AppSidebar user={user} waiting={waiting} />
  useKeepFocus(open, isMobile)

  return (
    <div className="flex h-dvh w-full">
      <SkipLink />

      {/* Desktop. Collapsing slides the column shut (width, so the page
          takes the room) and makes it inert, so Tab never walks into a panel
          you cannot see. Hidden by CSS under md, so a phone's first paint
          never shows it, whatever isMobile reads before hydration.

          The hairline is a pseudo-element on the column's right edge, not a
          border: a border would take 1px out of the 208 and the 208px
          contents would overflow by it, and toggling it would pop the line
          on at frame 0 of the slide. The pseudo rides the edge as it moves
          and is clipped away at width 0. */}
      <div
        id={isMobile ? undefined : SIDEBAR_ID}
        inert={!open}
        data-open={open || undefined}
        className="relative hidden w-0 shrink-0 overflow-hidden transition-[width] duration-(--kit-duration-state) ease-kit-move after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-kit-hairline data-open:w-kit-sidebar motion-reduce:transition-none md:block"
      >
        <div className="h-full w-kit-sidebar">{isMobile ? null : sidebar}</div>
      </div>

      {isMobile ? <MobileSheet>{sidebar}</MobileSheet> : null}

      {/* No row above the page on a desktop: the banner, when there is
          one, is the first thing in the column. While the sidebar is
          hidden, its Show control sits in the column's top-left corner,
          and --kit-shell-inset (the bar's 52) tells a full-width row at the
          top, the banner, to start its words past it. */}
      <div
        data-collapsed={open ? undefined : true}
        className="relative flex min-w-0 flex-1 flex-col md:data-collapsed:[--kit-shell-inset:var(--spacing-kit-shell-bar)]"
      >
        <PhoneBar conversations={conversations} />
        {open ? null : <ShowSidebar />}
        {banner}
        <main
          id={CONTENT_ID}
          // Focusable only from the skip link, which lands here.
          tabIndex={-1}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto outline-hidden"
        >
          {children}
        </main>
      </div>
    </div>
  )
}

/**
 * Where focus goes when the desktop sidebar opens or shuts, so it never
 * falls to <body>. Shutting makes the column inert, which drops focus held
 * inside it: it lands on the control that brings the sidebar back. Opening
 * from that control unmounts it: focus lands on the current row. Focus
 * anywhere else in the page stays where it is.
 */
function useKeepFocus(open: boolean, isMobile: boolean) {
  const previous = React.useRef(open)
  React.useEffect(() => {
    if (previous.current === open) return
    previous.current = open
    if (isMobile) return
    const active = document.activeElement
    const sidebar = document.getElementById(SIDEBAR_ID)
    const lost = active == null || active === document.body || (sidebar?.contains(active) ?? false)
    if (!lost) return
    const target = open
      ? (sidebar?.querySelector<HTMLElement>('[aria-current="page"]') ??
        sidebar?.querySelector<HTMLElement>("a"))
      : document.querySelector<HTMLElement>(`[aria-label="${SHOW_LABEL}"]`)
    // preventScroll: at this moment the column is ~0px wide (opening) or
    // about to be (shutting), and focusing a row inside an overflow-hidden
    // box that narrow scrolls the box sideways to reveal it. The column
    // would then slide open with its contents shifted left.
    target?.focus({ preventScroll: true })
  }, [open, isMobile])
}

/**
 * Studio is the conversation with something in it, so its history is a
 * control in Studio, not a list in the sidebar (Desk). /c/ counts as
 * Studio (nav.ts); /conversations does not: it is the list itself.
 */
function useInStudio() {
  return isActive(usePathname(), "/studio")
}

/**
 * The phone's row above the page: the menu button, the page's name and, in
 * Studio, its history. Hidden by CSS from md up rather than by isMobile, so a
 * phone's first paint is right. A desktop has no row: the page starts at the
 * top of the window.
 */
function PhoneBar({ conversations }: { conversations: ConversationSummary[] }) {
  const { openMobile, toggle } = useShell()
  const pathname = usePathname()
  const inStudio = useInStudio()

  return (
    <div className="flex h-kit-shell-bar shrink-0 items-center gap-kit-controls px-kit-shell-pad md:hidden">
      <IconButton
        icon={Menu01Icon}
        aria-label="Open the menu"
        aria-expanded={openMobile}
        aria-controls={SIDEBAR_ID}
        onClick={toggle}
      />
      {/* Not a heading: the page has its own. This is where you are. */}
      <span className="min-w-0 flex-1 truncate text-center font-kit-strong text-kit-ink">
        {navItemFor(pathname)?.label ??
          (pathname === CONVERSATIONS_HREF ? "Conversations" : null)}
      </span>
      {/* The same width as the menu button, so the name sits centred. */}
      <div className="flex size-kit-control-md shrink-0 items-center justify-center">
        {inStudio ? <HistoryMenu conversations={conversations} side="bottom" align="end" /> : null}
      </div>
    </div>
  )
}

/**
 * The control that brings a hidden desktop sidebar back: one icon in the
 * content column's top-left corner, over the page rather than in a row of
 * its own, so hiding the sidebar never adds an empty bar. Rendered only
 * while the sidebar is hidden, and only from md up. The corner is free:
 * pages centre their column inside a gutter, and the banner starts its
 * words at --kit-shell-inset.
 */
function ShowSidebar() {
  const { toggle } = useShell()
  return (
    <div className="absolute top-kit-shell-pad left-kit-shell-pad z-10 hidden md:block">
      {/* The shortcut is the one thing here not on screen: it is also the
          only way to hide the sidebar again. */}
      <Tooltip content="Show and hide it" shortcut={["mod", "B"]} side="right">
        <IconButton
          icon={SidebarLeftIcon}
          aria-label={SHOW_LABEL}
          aria-expanded={false}
          aria-controls={SIDEBAR_ID}
          aria-keyshortcuts="Meta+B Control+B"
          onClick={toggle}
        />
      </Tooltip>
    </div>
  )
}

/**
 * Studio's history in Studio's own composer, from md up (a phone has it in
 * the bar, and two would be one too many). Reads the threads the shell
 * loaded, and renders nothing outside the AppShell (the kit lab) or off
 * Studio's routes. /conversations has no composer and needs no history
 * control there: that page is the list.
 */
export function ConversationHistory() {
  const conversations = React.useContext(HistoryContext)
  const inStudio = useInStudio()
  if (!conversations || !inStudio) return null
  return (
    <span className="hidden md:contents">
      <HistoryMenu conversations={conversations} side="top" align="start" />
    </span>
  )
}

/**
 * Studio's history: the recent threads and the way to all of them. Rows only
 * open (lists.md): deleting a thread is a HoldButton on the thread.
 *
 * A fixed width, capped by the viewport: the panel would otherwise grow to
 * its longest title and run off a phone. A row's title truncates and its
 * time stays, so two threads with one title still read apart.
 */
function HistoryMenu({
  conversations,
  side,
  align,
}: {
  conversations: ConversationSummary[]
  /** Down from the phone's bar; up from the composer at Studio's foot. */
  side: "top" | "bottom"
  align: "start" | "end"
}) {
  const pathname = usePathname()

  return (
    <Menu>
      <MenuTrigger render={<IconButton icon={MessageMultiple01Icon} aria-label="Conversations" />} />
      <MenuPanel side={side} align={align} width="wide">
        {conversations.length > 0 ? (
          <>
            <MenuGroup>
              <MenuGroupLabel>Recent</MenuGroupLabel>
              {conversations.map((item) => (
                <MenuLinkItem
                  key={item.id}
                  href={`/c/${item.id}`}
                  aria-current={pathname === `/c/${item.id}` ? "page" : undefined}
                >
                  <HistoryRow title={item.title ?? "Untitled"} updatedAt={item.updatedAt} />
                </MenuLinkItem>
              ))}
            </MenuGroup>
            <MenuSeparator />
          </>
        ) : null}
        <MenuLinkItem
          href={CONVERSATIONS_HREF}
          aria-current={pathname === CONVERSATIONS_HREF ? "page" : undefined}
        >
          All conversations
        </MenuLinkItem>
      </MenuPanel>
    </Menu>
  )
}

/**
 * The title, truncated, and when it was last touched, at the row's end.
 *
 * `w-screen max-w-full`: the menu row wraps its children in a span sized to
 * its content, so a plain flex row here would put each time straight after
 * its title, at a different x on every row. Asking for the screen's width
 * and capping at the parent's makes that span take the whole row, and the
 * times line up.
 *
 * The /conversations page's buckets (Today, Yesterday, 3 days ago, 4 Nov),
 * except today, which shows the clock: the recent list is mostly today, and
 * "Today" on every row would tell nothing apart. Drawn in the account's zone,
 * the one /conversations and every other date use, so a thread does not say
 * "Today" here and "Yesterday" there. The browser's zone stands in only for
 * an account with none yet. The panel renders only while open, on the client,
 * so reading the clock is safe here.
 */
function HistoryRow({ title, updatedAt }: { title: string; updatedAt: Date }) {
  const accountZone = React.useContext(HistoryZoneContext)
  const zone = resolveTimeZone(accountZone ?? browserTimeZone())
  const day = formatConversationDate(updatedAt, zone)
  const when = day === "Today" ? hhmmIn(updatedAt, zone) : day

  return (
    <span className="flex w-screen max-w-full items-baseline gap-kit-related">
      <span className="min-w-0 flex-1 truncate">{title}</span>
      <time
        dateTime={updatedAt.toISOString()}
        className="shrink-0 text-kit-small text-kit-ink-muted tabular-nums"
      >
        {when}
      </time>
    </span>
  )
}

/**
 * The phone's sidebar: a sheet from the left over a dimmed ground. Base UI's
 * Dialog traps focus, closes on Escape and on the scrim, and gives focus back
 * to the toggle. Choosing a row closes it, because the page you chose is the
 * thing you came for.
 */
function MobileSheet({ children }: { children: React.ReactNode }) {
  const { openMobile, setOpenMobile } = useShell()
  const pathname = usePathname()
  const navigated = React.useRef(false)
  const shownFor = React.useRef(pathname)

  // A navigation closes the sheet. Keyed on the path, not on a click
  // handler per row, so the account menu's link closes it too. An effect,
  // not a set during render: the state belongs to the provider above, and
  // React forbids updating a parent while a child renders.
  React.useEffect(() => {
    if (shownFor.current === pathname) return
    shownFor.current = pathname
    if (!openMobile) return
    navigated.current = true
    setOpenMobile(false)
  }, [pathname, openMobile, setOpenMobile])

  // A row for the page you are already on navigates nowhere, so the effect
  // above never fires and the sheet would stay over the page you asked for.
  // Delegated from the popup rather than a handler per row, for the same
  // reason the effect is keyed on the path: every link in the sheet is
  // covered, the account menu's included. A modified click opens a new tab
  // and leaves this one where it was, so it does not close anything.
  function closeOnCurrentRow(event: React.MouseEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const link = (event.target as Element | null)?.closest?.("a[href]")
    if (!(link instanceof HTMLAnchorElement) || link.target === "_blank") return
    const url = new URL(link.href, window.location.href)
    if (url.origin !== window.location.origin || url.pathname !== pathname) return
    navigated.current = true
    setOpenMobile(false)
  }

  return (
    <Dialog.Root open={openMobile} onOpenChange={setOpenMobile}>
      <Dialog.Portal>
        <Dialog.Backdrop className={SCRIM} />
        {/* PORTAL_TYPE: portalled into <body>, outside KitRoot, the rows
            would otherwise lose Inter and read in the app's Geist. */}
        <Dialog.Popup
          id={SIDEBAR_ID}
          aria-label="Quincy"
          // Escape or the scrim: back to the menu button, where you were.
          // A navigation: into the new page. The page you chose is where
          // you are now, and the button you opened the sheet from is not.
          // <main> is tabIndex -1 for the skip link, so it takes focus
          // without joining the Tab order; the next Tab starts in the page.
          // Focused here and `false` returned, because a returned element
          // is treated as a container: Base UI moves on to its first
          // tabbable, which skipped the page's heading for its first button.
          finalFocus={() => {
            if (!navigated.current) return true
            navigated.current = false
            document.getElementById(CONTENT_ID)?.focus({ preventScroll: true })
            return false
          }}
          onClick={closeOnCurrentRow}
          className={`${PORTAL_TYPE} fixed inset-y-0 left-0 z-50 w-kit-sidebar bg-kit-ground shadow-kit-lifted outline-hidden transition-[translate,opacity] duration-(--kit-duration-enter) ease-kit-out data-ending-style:-translate-x-full data-starting-style:-translate-x-full motion-reduce:data-ending-style:translate-x-0 motion-reduce:data-ending-style:opacity-0 motion-reduce:data-starting-style:translate-x-0 motion-reduce:data-starting-style:opacity-0`}
        >
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/**
 * The first stop for Tab: past a dozen rows straight to the page. Invisible
 * until focused, then a quiet control in the corner.
 */
function SkipLink() {
  return (
    <div className="sr-only focus-within:not-sr-only focus-within:fixed focus-within:top-kit-shell-pad focus-within:left-kit-shell-pad focus-within:z-50">
      <ButtonLink
        href={`#${CONTENT_ID}`}
        variant="quiet"
        // A client-side hash change scrolls but does not move focus; this
        // does, so the next Tab starts inside the page.
        onClick={(event) => {
          const target = document.getElementById(CONTENT_ID)
          if (!target) return
          event.preventDefault()
          target.focus()
        }}
      >
        Skip to the page
      </ButtonLink>
    </div>
  )
}

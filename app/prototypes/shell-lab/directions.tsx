"use client"

import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowDown01Icon,
  Cancel01Icon,
  Menu01Icon,
  MessageMultiple01Icon,
} from "@hugeicons/core-free-icons"

import {
  Avatar,
  IconButton,
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPanel,
  MenuSeparator,
  MenuTrigger,
} from "@/components/kit"
import { QuincyMark } from "@/components/mascot"

import { USER } from "./fixtures"
import {
  ACCOUNT,
  AccountMenu,
  AvatarButton,
  Choices,
  Composer,
  FrameSheet,
  HistoryMenu,
  MAKE,
  PageBody,
  PageColumn,
  QuincyHead,
  SETUP,
  STUDIO,
  StudioColumn,
  TextRow,
  TopLink,
  WAITING,
  current,
  nav,
  type Go,
} from "./parts"

export type Frame = { route: string; go: Go }

export type Reference = "hero" | "held" | "texts"

export type Direction = {
  id: string
  name: string
  /** What it bets on, one sentence. */
  bet: string
  /** What it gives up, one sentence. */
  givesUp: string
  /** What it would change in components/quincy/shell/*, file by file. */
  changes: [file: string, change: string][]
  /** Where the direction opens. */
  home: string
  /** The landing pictures it is judged against, and what to look at. */
  reference: { desktop: Reference; phone: Reference; look: string }
  Desktop: (props: Frame) => React.ReactNode
  Phone: (props: Frame) => React.ReactNode
}

/** A page or the Studio, scrolled in its own box so the shell's bars stay put. */
function Body({
  route,
  go,
  phone = false,
  studioHeader,
}: Frame & { phone?: boolean; studioHeader?: React.ReactNode }) {
  if (current(route, "/studio")) {
    return <StudioColumn go={go} variant={phone ? "phone" : "page"} header={studioHeader} />
  }
  return (
    <div className="h-full overflow-y-auto">
      <PageColumn phone={phone}>
        <PageBody route={route} go={go} />
      </PageColumn>
    </div>
  )
}

/** The account as a row: avatar and name, the sidebar's foot. */
const AccountRow = React.forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<"button">>(
  function AccountRow(props, ref) {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={`Account: ${USER.name}`}
        {...props}
        className="flex h-11 w-full items-center gap-2.5 rounded-kit-control-inner px-2 text-left transition-[background-color] duration-(--kit-duration-state) hover:bg-kit-stage motion-reduce:transition-none"
      >
        <Avatar initials={USER.initials} />
        <span className="min-w-0 flex-1 truncate font-kit-strong">{USER.name}</span>
      </button>
    )
  },
)

/* ── 1. Desk ──────────────────────────────────────────────────────────── */

const DESK_ROWS = [STUDIO, ...MAKE, nav("/sources")]
const DESK_SETUP = SETUP.filter((i) => i.href !== "/sources")

function DeskSidebar({ route, go }: Frame) {
  return (
    <nav aria-label="Quincy" className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center px-5">
        <QuincyMark size="sm" />
      </div>
      <ul className="flex flex-col gap-0.5 px-3">
        {DESK_ROWS.map((item) => (
          <li key={item.href}>
            <TextRow item={item} route={route} go={go} />
          </li>
        ))}
      </ul>
      <div className="flex-1" />
      <div className="px-3 pb-3">
        <AccountMenu go={go} setup={DESK_SETUP} side="top" align="start" trigger={<AccountRow />} />
      </div>
    </nav>
  )
}

function StudioHistory({ go }: { go: Go }) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-kit-strong">The onboarding PR</span>
      <HistoryMenu
        go={go}
        trigger={<IconButton icon={MessageMultiple01Icon} aria-label="Conversations" />}
      />
    </div>
  )
}

const desk: Direction = {
  id: "desk",
  name: "Desk",
  bet: "The picture, taken literally: a quiet sidebar of six text rows on white, the page in the column beside it, Studio as the first row.",
  givesUp: "Setup (Brain, Channels, Rhythm) and the conversation list leave the sidebar: one click deeper, in the account menu and in Studio’s own history control.",
  changes: [
    ["nav.ts", "NAV becomes one flat group: Studio, Ideas, Drafts, Lineup, Numbers, Sources. Brain, Channels and Rhythm move to a SETUP_NAV the menu reads."],
    ["app-sidebar.tsx", "NavRow without icons or group headings; the Conversations group and FOOTER_NAV rows go; the account row is the only thing in the foot."],
    ["account-menu.tsx", "Gains a Setup group and the three account rows (Credits, Billing, Settings) above Why and Sign out."],
    ["app-shell.tsx", "The bar with the toggle goes; the sidebar is 208px on the ground with a hairline. Toggle stays on ⌘/Ctrl+B. MobileSheet unchanged."],
  ],
  home: "/studio",
  reference: {
    desktop: "hero",
    phone: "texts",
    look: "The window in the hero: its five text rows, the grey pill on the current one, white everywhere else, the ink Approve.",
  },
  Desktop: ({ route, go }) => (
    <div className="flex h-full">
      <div className="w-[13rem] shrink-0 border-r border-kit-hairline">
        <DeskSidebar route={route} go={go} />
      </div>
      <div className="min-w-0 flex-1">
        <Body route={route} go={go} studioHeader={<StudioHistory go={go} />} />
      </div>
    </div>
  ),
  Phone: function DeskPhone({ route, go }) {
    const [open, setOpen] = React.useState(false)
    const pick: Go = (href) => {
      go(href)
      setOpen(false)
    }
    return (
      <div className="relative flex h-full flex-col">
        <div className="flex h-12 shrink-0 items-center justify-between px-2">
          <IconButton icon={Menu01Icon} aria-label="Open the menu" aria-expanded={open} onClick={() => setOpen(true)} />
          <span className="font-kit-strong">{nav(route).label}</span>
          <AccountMenu go={go} setup={DESK_SETUP} trigger={<AvatarButton />} />
        </div>
        <div className="min-h-0 flex-1">
          <Body route={route} go={go} phone />
        </div>
        <FrameSheet open={open} onClose={() => setOpen(false)} side="left" label="menu">
          <DeskSidebar route={route} go={pick} />
        </FrameSheet>
      </div>
    )
  },
}

/* ── 2. Masthead ──────────────────────────────────────────────────────── */

const MAST_ROWS = [STUDIO, ...MAKE]

function SetupMenu({ go, route }: Frame) {
  const on = SETUP.some((i) => current(route, i.href))
  return (
    <Menu>
      <MenuTrigger
        render={
          <button
            type="button"
            data-on={on || undefined}
            className="inline-flex h-9 items-center gap-1 rounded-full px-3.5 text-kit-ink-muted transition-[background-color,color] duration-(--kit-duration-state) hover:text-kit-ink data-on:bg-kit-stage data-on:font-kit-strong data-on:text-kit-ink motion-reduce:transition-none"
          >
            Setup
            <HugeiconsIcon icon={ArrowDown01Icon} size={14} strokeWidth={2} aria-hidden />
          </button>
        }
      />
      <MenuPanel align="end">
        {SETUP.map((i) => (
          <MenuItem key={i.href} icon={i.icon} onClick={() => go(i.href)}>
            {i.label}
          </MenuItem>
        ))}
      </MenuPanel>
    </Menu>
  )
}

function TabBar({ route, go }: Frame) {
  return (
    <nav aria-label="Quincy" className="grid shrink-0 grid-cols-5 border-t border-kit-hairline bg-kit-ground pb-7">
      {MAST_ROWS.map((item) => {
        const on = current(route, item.href)
        const waiting = !on && WAITING[item.href]
        return (
          <button
            key={item.href}
            type="button"
            onClick={() => go(item.href)}
            aria-current={on ? "page" : undefined}
            data-on={on || undefined}
            className="flex h-14 flex-col items-center justify-center gap-0.5 text-kit-ink-muted data-on:text-kit-ink"
          >
            <span className="relative">
              <HugeiconsIcon icon={item.icon} size={22} strokeWidth={on ? 2 : 1.7} aria-hidden />
              {waiting ? (
                <span className="absolute -top-0.5 -right-1 size-2 rounded-full bg-kit-ink ring-2 ring-kit-ground" aria-hidden />
              ) : null}
            </span>
            <span className="text-[11px] leading-none font-kit-strong">
              {item.label}
              {waiting ? <span className="sr-only">, {WAITING[item.href]} waiting</span> : null}
            </span>
          </button>
        )
      })}
    </nav>
  )
}

const masthead: Direction = {
  id: "masthead",
  name: "Masthead",
  bet: "The app wears the landing’s own header: mark, five text links, the avatar on the right, and the page alone in a wide white room. On a phone, a tab bar like any app in your pocket.",
  givesUp: "Room to grow: a top bar holds five or six destinations, so Setup is a menu and conversations live behind Studio’s history control. No collapsible sidebar, nothing to toggle.",
  changes: [
    ["app-sidebar.tsx", "Replaced by an app-header.tsx (mark, NAV’s first two groups as text links, Setup menu, account) and a tab-bar.tsx for phones."],
    ["app-shell.tsx", "A column, not a row: header over <main>. The sidebar column, the toggle Bar and MobileSheet go."],
    ["shell-state.tsx, shell-cookie.ts", "Deleted: nothing opens or collapses, so there is no state and no cookie (and no ⌘/Ctrl+B)."],
    ["nav.ts", "Unchanged groups; the header reads Studio + Make, the Setup menu reads Setup, the account menu reads FOOTER_NAV."],
    ["account-menu.tsx", "Trigger becomes the bare avatar; FOOTER_NAV rows move into the menu."],
  ],
  home: "/studio",
  reference: {
    desktop: "held",
    phone: "texts",
    look: "The landing itself: its header over the hero, and the held draft standing alone on white with air on every side.",
  },
  Desktop: ({ route, go }) => (
    <div className="flex h-full flex-col">
      <header className="flex h-16 shrink-0 items-center gap-6 px-8">
        <QuincyMark size="sm" />
        <nav aria-label="Quincy" className="flex items-center gap-0.5">
          {MAST_ROWS.map((item) => (
            <TopLink key={item.href} item={item} route={route} go={go} />
          ))}
        </nav>
        <div className="flex-1" />
        <SetupMenu route={route} go={go} />
        <AccountMenu go={go} trigger={<AvatarButton />} />
      </header>
      <div className="min-h-0 flex-1">
        <Body route={route} go={go} studioHeader={<StudioHistory go={go} />} />
      </div>
    </div>
  ),
  Phone: ({ route, go }) => (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center justify-between pr-2 pl-4">
        <QuincyMark size="sm" />
        <AccountMenu go={go} setup={SETUP} trigger={<AvatarButton />} />
      </div>
      <div className="min-h-0 flex-1">
        <Body route={route} go={go} phone />
      </div>
      <TabBar route={route} go={go} />
    </div>
  ),
}

/* ── 3. Beside ────────────────────────────────────────────────────────── */

const PAGE_ROWS = [...MAKE, nav("/sources")]
/** Studio is the left pane here, so the right pane never shows it. */
const besideRoute = (route: string) => (current(route, "/studio") ? "/drafts" : route)

function PageTabs({ route, go }: Frame) {
  return (
    <nav aria-label="Pages" className="flex items-center gap-0.5">
      {PAGE_ROWS.map((item) => (
        <TopLink key={item.href} item={item} route={route} go={go} />
      ))}
    </nav>
  )
}

const beside: Direction = {
  id: "beside",
  name: "Beside",
  bet: "The desk and the pocket at once: the conversation is pinned on the left and never leaves, and every page opens beside it, so you talk about the thing you are looking at.",
  givesUp: "Width: pages get what is left of 1280 after a 440 thread, and there are two scroll columns. On a phone the page is a sheet over the thread, not a place.",
  changes: [
    ["app-shell.tsx", "Two panes: a fixed thread pane (the Studio chat, lifted out of /studio) and <main> for the page. The Bar goes; on phones <main> is a bottom sheet over the thread."],
    ["app-sidebar.tsx", "Becomes the right pane’s page tabs (Make + Sources) and a Setup menu; conversations move to a history control on the thread."],
    ["nav.ts", "Studio leaves NAV (it is the pane). isActive’s /c/ rule moves to the pane: a thread is open beside any page."],
    ["shell-state.tsx", "Holds which page is open on a phone (the sheet) instead of the sidebar; ⌘/Ctrl+B hides the thread pane. The cookie remembers that."],
    ["account-menu.tsx", "Trigger is the avatar at the thread pane’s top; FOOTER_NAV joins it."],
  ],
  home: "/drafts",
  reference: {
    desktop: "hero",
    phone: "texts",
    look: "The hero’s two objects: the phone’s thread on the left, the window on the right, both on screen at the same time.",
  },
  Desktop: ({ route, go }) => {
    const page = besideRoute(route)
    return (
      <div className="flex h-full">
        <section aria-label="Quincy" className="flex w-[27.5rem] shrink-0 flex-col border-r border-kit-hairline">
          <div className="flex h-14 shrink-0 items-center justify-between pr-3 pl-6">
            <QuincyMark size="sm" />
            <span className="flex items-center gap-1">
              <HistoryMenu go={go} trigger={<IconButton icon={MessageMultiple01Icon} aria-label="Conversations" />} />
              <AccountMenu go={go} setup={SETUP} trigger={<AvatarButton />} />
            </span>
          </div>
          <div className="min-h-0 flex-1">
            <StudioColumn go={go} variant="pane" />
          </div>
        </section>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-14 shrink-0 items-center px-6">
            <PageTabs route={page} go={go} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <PageColumn>
              <PageBody route={page} go={go} />
            </PageColumn>
          </div>
        </div>
      </div>
    )
  },
  Phone: function BesidePhone({ route, go }) {
    const [open, setOpen] = React.useState(false)
    const page = besideRoute(route)
    const openPage: Go = (href) => {
      go(href)
      setOpen(true)
    }
    return (
      <div className="relative flex h-full flex-col">
        <div className="flex h-12 shrink-0 items-center justify-between pr-2 pl-4">
          <QuincyMark size="sm" />
          <span className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-expanded={open}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-kit-control px-3.5 font-kit-strong shadow-kit-control"
            >
              Pages <span className="text-kit-ink-muted">{WAITING["/drafts"]} held</span>
            </button>
            <AccountMenu go={go} setup={SETUP} trigger={<AvatarButton />} />
          </span>
        </div>
        <div className="min-h-0 flex-1">
          <StudioColumn go={openPage} variant="phone" />
        </div>
        <FrameSheet open={open} onClose={() => setOpen(false)} side="bottom" label={nav(page).label}>
          <div className="flex shrink-0 items-center justify-between gap-2 py-2 pr-2 pl-2">
            <div className="min-w-0 overflow-x-auto">
              <PageTabs route={page} go={go} />
            </div>
            <IconButton icon={Cancel01Icon} aria-label="Back to the conversation" onClick={() => setOpen(false)} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <PageColumn phone>
              <PageBody route={page} go={go} />
            </PageColumn>
          </div>
        </FrameSheet>
      </div>
    )
  },
}

/* ── 4. Pocket ────────────────────────────────────────────────────────── */

/** The one place every destination is listed: a menu from the page’s name. */
function Switcher({ route, go }: Frame) {
  return (
    <Menu>
      <MenuTrigger
        render={
          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-full pr-2.5 pl-1 transition-[background-color] duration-(--kit-duration-state) hover:bg-kit-stage motion-reduce:transition-none"
          >
            <QuincyMark size="sm" />
            <span className="text-kit-ink-muted" aria-hidden>
              /
            </span>
            <span className="font-kit-strong">{nav(route).label}</span>
            <HugeiconsIcon icon={ArrowDown01Icon} size={14} strokeWidth={2} aria-hidden />
          </button>
        }
      />
      <MenuPanel align="start">
        <MenuGroup>
          <MenuGroupLabel>Make</MenuGroupLabel>
          {MAKE.map((i) => (
            <MenuItem key={i.href} icon={i.icon} onClick={() => go(i.href)}>
              {i.label}
              {WAITING[i.href] ? ` · ${WAITING[i.href]}` : ""}
            </MenuItem>
          ))}
        </MenuGroup>
        <MenuSeparator />
        <MenuGroup>
          <MenuGroupLabel>Setup</MenuGroupLabel>
          {SETUP.map((i) => (
            <MenuItem key={i.href} icon={i.icon} onClick={() => go(i.href)}>
              {i.label}
            </MenuItem>
          ))}
        </MenuGroup>
        <MenuSeparator />
        {ACCOUNT.map((i) => (
          <MenuItem key={i.href} icon={i.icon} onClick={() => go(i.href)}>
            {i.label}
          </MenuItem>
        ))}
      </MenuPanel>
    </Menu>
  )
}

/** Quincy’s newest note, standing over the composer on every page. */
function LatestNote({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="flex flex-col gap-2 rounded-kit-object bg-kit-object px-4 py-3 shadow-kit-object">
      <span className="flex items-center justify-between gap-4">
        <QuincyHead at="Tue 07:52" />
        <button
          type="button"
          onClick={onOpen}
          className="relative text-kit-ink-muted underline decoration-kit-link-line underline-offset-4 hover:text-kit-ink pointer-coarse:after:absolute pointer-coarse:after:-inset-3"
        >
          Open the thread
        </button>
      </span>
      <span>Draft’s ready. Want it out at 8:30? It’s held for your read.</span>
      <Choices items={["Read it first", "Yes, 8:30"]} />
    </div>
  )
}

function ThreadSheetHead({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex h-14 shrink-0 items-center justify-between pr-3 pl-6">
      <span className="font-kit-strong">The onboarding PR</span>
      <IconButton icon={Cancel01Icon} aria-label="Close the thread" onClick={onClose} />
    </div>
  )
}

const pocket: Direction = {
  id: "pocket",
  name: "Pocket",
  bet: "Quincy comes to you, so the shell is almost nothing: the page’s name is the menu, and the newest note and a composer stand at the foot of every page. The thread opens over the page you are on.",
  givesUp: "A visible map: every destination is behind one menu, and Studio stops being a place. Least like the window in the hero, most like the thread under it.",
  changes: [
    ["app-sidebar.tsx", "Deleted. Its rows become a Switcher menu (Make, Setup, FOOTER_NAV) on the page’s name."],
    ["app-shell.tsx", "A thin top bar (Switcher, account) over <main>, plus a docked composer and the newest note at the foot, and a thread drawer (Base UI Dialog) on the right; a full sheet on phones."],
    ["shell-state.tsx", "Holds the thread drawer’s open state instead of the sidebar’s; ⌘/Ctrl+B becomes ⌘/Ctrl+J for the thread. The cookie goes."],
    ["nav.ts", "Studio leaves NAV; /studio and /c/[id] open the drawer over the last page."],
    ["account-menu.tsx", "Trigger is the bare avatar; nothing else moves into it."],
  ],
  home: "/drafts",
  reference: {
    desktop: "held",
    phone: "texts",
    look: "The thread under the hero: a note that ends in your choice, and the held draft waiting for it.",
  },
  Desktop: function PocketDesktop({ route, go }) {
    const [thread, setThread] = React.useState(false)
    const page = current(route, "/studio") ? "/drafts" : route
    return (
      <div className="relative flex h-full flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between pr-4 pl-5">
          <Switcher route={page} go={go} />
          <AccountMenu go={go} account={false} trigger={<AvatarButton />} />
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="pb-56">
            <PageColumn>
              <PageBody route={page} go={go} />
            </PageColumn>
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center bg-linear-to-t from-kit-ground from-60% to-transparent px-8 pt-16 pb-6">
          <div className="pointer-events-auto flex w-full max-w-[40rem] flex-col gap-2.5">
            <LatestNote onOpen={() => setThread(true)} />
            <Composer placeholder="Ask about this page, or tell Quincy what happened…" />
          </div>
        </div>
        <FrameSheet open={thread} onClose={() => setThread(false)} side="right" label="thread">
          <ThreadSheetHead onClose={() => setThread(false)} />
          <div className="min-h-0 flex-1">
            <StudioColumn go={go} variant="pane" />
          </div>
        </FrameSheet>
      </div>
    )
  },
  Phone: function PocketPhone({ route, go }) {
    const [thread, setThread] = React.useState(false)
    const page = current(route, "/studio") ? "/drafts" : route
    return (
      <div className="relative flex h-full flex-col">
        <div className="flex h-12 shrink-0 items-center justify-between pr-2 pl-3">
          <Switcher route={page} go={go} />
          <AccountMenu go={go} account={false} trigger={<AvatarButton />} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <PageColumn phone>
            <PageBody route={page} go={go} />
          </PageColumn>
        </div>
        <div className="flex shrink-0 flex-col gap-2 border-t border-kit-hairline px-3 pt-3 pb-8">
          <LatestNote onOpen={() => setThread(true)} />
          <Composer placeholder="Tell Quincy…" />
        </div>
        <FrameSheet open={thread} onClose={() => setThread(false)} side="bottom" label="thread">
          <ThreadSheetHead onClose={() => setThread(false)} />
          <div className="min-h-0 flex-1">
            <StudioColumn go={go} variant="phone" />
          </div>
        </FrameSheet>
      </div>
    )
  },
}

export const DIRECTIONS: Direction[] = [desk, masthead, beside, pocket]

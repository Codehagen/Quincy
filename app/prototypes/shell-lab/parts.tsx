"use client"

import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowUp02Icon,
  Attachment01Icon,
  GithubIcon,
  Idea01Icon,
  Logout01Icon,
} from "@hugeicons/core-free-icons"

import {
  Avatar,
  Button,
  Highlight,
  IconButton,
  LiveDot,
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPanel,
  MenuSeparator,
  MenuTrigger,
  Mono,
  Text,
} from "@/components/kit"
import { ACCOUNT_NAV, NAV, SETUP_NAV, isActive, type NavItem } from "@/components/quincy/shell/nav"

import {
  CONVERSATIONS,
  IDEA_GROUPS,
  POST,
  QUIET_PAGES,
  RECEIPT,
  RESULTS,
  SOURCES,
  USER,
  WEEK,
} from "./fixtures"

/** A route in the mock, as nav.ts writes it ("/studio", "/riffs"). */
export type Go = (href: string) => void

/* ── The route model, read from the real nav.ts ───────────────────────── */

const byHref = (href: string) =>
  [...NAV, ...SETUP_NAV, ...ACCOUNT_NAV].find((i) => i.href === href)

// The lab's groups as they stood before Desk shipped (2026-11-16): the real
// nav is flat now, so the old Make and Setup are rebuilt from it.
export const STUDIO = NAV[0]
export const MAKE = NAV.filter((i) => i.href !== "/studio" && i.href !== "/sources")
export const SETUP = [...SETUP_NAV, ...NAV.filter((i) => i.href === "/sources")]
export const ACCOUNT = ACCOUNT_NAV
export const nav = (href: string): NavItem => byHref(href) ?? STUDIO

export const current = (route: string, href: string) => isActive(route, href)

/** Things waiting for the person, by route: the dot the real sidebar keeps a prop for. */
export const WAITING: Record<string, number> = { "/riffs": 5, "/drafts": 2 }

/* ── Small pieces ─────────────────────────────────────────────────────── */

function Check() {
  return (
    <svg aria-hidden width={16} height={16} viewBox="0 0 16 16" className="flex-none">
      <circle cx="8" cy="8" r="8" className="fill-kit-ink" />
      <path
        d="M4.6 8.2 L7 10.5 L11.4 5.8"
        fill="none"
        className="stroke-kit-object"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function QuincyHead({ at }: { at: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="font-kit-strong">Quincy</span>
      <Mono>{at}</Mono>
    </span>
  )
}

function Receipt() {
  return (
    <ul className="flex flex-col">
      {RECEIPT.map(([did, result]) => (
        <li key={did} className="flex items-center gap-2.5">
          <Check />
          <span>
            <span className="font-kit-strong">{did}</span>
            <span className="text-kit-ink-muted tabular-nums"> → {result}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

function PullRequest() {
  return (
    <div className="flex flex-col gap-1 rounded-kit-control bg-kit-well px-3.5 py-2.5">
      <span className="flex items-center gap-1.5 text-kit-ink-muted">
        <HugeiconsIcon icon={GithubIcon} size={14} strokeWidth={1.8} aria-hidden />
        <Mono>GitHub · #212 · merged Mon 16:40</Mono>
      </span>
      <span className="font-kit-strong">Cut onboarding from nine screens to three</span>
      <span className="text-kit-ink-muted">
        Removed the team-size, role, and ‘how did you hear’ steps.{" "}
        <span className="text-kit-ink">
          <Highlight>Finished signup since Monday: 68%. The week before: 41%.</Highlight>
        </span>
      </span>
    </div>
  )
}

/** The held draft, as the landing shows it, with a working Approve. */
export function HeldDraft({ onOpen }: { onOpen?: () => void }) {
  const [approved, setApproved] = React.useState(false)
  return (
    <div className="flex flex-col rounded-kit-object bg-kit-object shadow-kit-object">
      <div className="flex flex-col gap-2 px-5 pt-3.5 pb-3.5">
        <span className="flex items-baseline gap-2">
          <span className="font-kit-strong">Draft for LinkedIn</span>
          <Mono>from #212 · 3 beats</Mono>
        </span>
        <div className="flex flex-col gap-1.5">
          <span>{POST.did}</span>
          <span className="flex flex-col">
            <span>{POST.happened}</span>
            <Text as="span" variant="figure">
              {POST.figure}
            </Text>
          </span>
          <span>{POST.meant}</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-kit-hairline pt-3">
          <span className="text-kit-ink-muted">
            {approved ? "Approved · goes Wed 08:30" : "LinkedIn · Wed 08:30 if you approve"}
          </span>
          <span className="flex items-center gap-kit-controls">
            {approved ? (
              <Button onClick={() => setApproved(false)}>Undo</Button>
            ) : (
              <>
                <Button variant="action" onClick={() => setApproved(true)}>
                  Approve
                </Button>
                <Button onClick={onOpen}>Edit</Button>
              </>
            )}
          </span>
        </div>
      </div>
      <div className="flex items-center justify-between gap-6 border-t border-kit-hairline px-5 py-2 text-kit-ink-muted">
        <span>Same idea, written for X</span>
        <Mono>X · Thu 09:00</Mono>
      </div>
    </div>
  )
}

/** The person's own line in the thread. */
function YouSaid({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <span className="max-w-[80%] rounded-kit-control bg-kit-well px-3.5 py-2">{children}</span>
    </div>
  )
}

/** Every note from Quincy ends in the person's choice. */
export function Choices({ items }: { items: readonly string[] }) {
  return (
    <span className="flex flex-wrap gap-2">
      {items.map((c) => (
        <button
          key={c}
          type="button"
          className="relative h-8 rounded-full bg-kit-control px-3.5 font-kit-strong shadow-kit-control transition-[background-color,scale] duration-(--kit-duration-state) ease-kit-out hover:bg-kit-control-hover active:scale-(--kit-press-scale) motion-reduce:transition-none motion-reduce:active:scale-100 pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:top-1/2 pointer-coarse:after:h-11 pointer-coarse:after:-translate-y-1/2"
        >
          {c}
        </button>
      ))}
    </span>
  )
}

/** The conversation: the morning's work, the draft, one exchange. */
export function Thread({ go }: { go?: Go }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <QuincyHead at="Tue 07:40" />
        <Receipt />
      </div>
      <PullRequest />
      <HeldDraft onOpen={go ? () => go("/drafts") : undefined} />
      <YouSaid>Can the X one go Thursday morning?</YouSaid>
      <div className="flex flex-col gap-2">
        <QuincyHead at="Tue 07:53" />
        <span>Done. X moves to Thu 09:00, still held for your read.</span>
        <Choices items={["Show the X version", "Next idea"]} />
      </div>
    </div>
  )
}

/** Where you talk to Quincy. A real form, so Enter submits. */
export function Composer({ placeholder = "Tell Quincy what happened…" }: { placeholder?: string }) {
  const id = React.useId()
  return (
    <form
      onSubmit={(e) => e.preventDefault()}
      className="flex items-center gap-2 rounded-kit-object bg-kit-object py-2 pr-2 pl-2 shadow-kit-object"
    >
      <IconButton icon={Attachment01Icon} aria-label="Attach a file" />
      <label htmlFor={id} className="sr-only">
        Message Quincy
      </label>
      <input
        id={id}
        placeholder={placeholder}
        autoComplete="off"
        className="min-w-0 flex-1 bg-transparent text-kit-body outline-hidden placeholder:text-kit-ink-muted"
      />
      <button
        type="submit"
        aria-label="Send"
        className="relative inline-grid size-9 shrink-0 place-items-center rounded-full bg-kit-primary text-kit-primary-on transition-[background-color,scale] duration-(--kit-duration-state) ease-kit-out hover:bg-kit-primary-hover active:scale-(--kit-press-scale) motion-reduce:transition-none motion-reduce:active:scale-100 pointer-coarse:after:absolute pointer-coarse:after:-inset-1"
      >
        <HugeiconsIcon icon={ArrowUp02Icon} size={18} strokeWidth={2} aria-hidden />
      </button>
    </form>
  )
}

/* ── Account ──────────────────────────────────────────────────────────── */

/**
 * The account menu each direction opens. What it holds is the direction's
 * choice: `setup` is the setup rows it carries (none, some, all four).
 */
export function AccountMenu({
  go,
  setup = [],
  account = true,
  trigger,
  side = "bottom",
  align = "end",
}: {
  go: Go
  setup?: NavItem[]
  account?: boolean
  trigger: React.ReactElement
  side?: "top" | "bottom"
  align?: "start" | "end"
}) {
  return (
    <Menu>
      <MenuTrigger render={trigger} />
      <MenuPanel side={side} align={align}>
        <MenuGroup>
          <MenuGroupLabel>{USER.email}</MenuGroupLabel>
        </MenuGroup>
        {setup.length ? (
          <>
            <MenuSeparator />
            <MenuGroup>
              <MenuGroupLabel>Setup</MenuGroupLabel>
              {setup.map((i) => (
                <MenuItem key={i.href} icon={i.icon} onClick={() => go(i.href)}>
                  {i.label}
                </MenuItem>
              ))}
            </MenuGroup>
          </>
        ) : null}
        {account ? (
          <>
            <MenuSeparator />
            {ACCOUNT.map((i) => (
              <MenuItem key={i.href} icon={i.icon} onClick={() => go(i.href)}>
                {i.label}
              </MenuItem>
            ))}
          </>
        ) : null}
        <MenuSeparator />
        <MenuItem icon={Idea01Icon}>Why Quincy works this way</MenuItem>
        <MenuItem icon={Logout01Icon}>Sign out</MenuItem>
      </MenuPanel>
    </Menu>
  )
}

/** The avatar alone, as a trigger. 36px, its hit area grown to 44 on touch. */
export const AvatarButton = React.forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<"button">>(
  function AvatarButton(props, ref) {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={`Account: ${USER.name}`}
        {...props}
        className="relative inline-grid size-9 place-items-center rounded-full transition-[background-color] duration-(--kit-duration-state) hover:bg-kit-stage motion-reduce:transition-none pointer-coarse:after:absolute pointer-coarse:after:-inset-1"
      >
        <Avatar initials={USER.initials} />
      </button>
    )
  },
)

/* ── Pages ────────────────────────────────────────────────────────────── */

export function PageHead({ title, summary }: { title: string; summary?: string }) {
  return (
    <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <Text as="h1" weight="strong">
        {title}
      </Text>
      {summary ? (
        <Text variant="small" tone="muted">
          {summary}
        </Text>
      ) : null}
    </header>
  )
}

function Rows({ children }: { children: React.ReactNode }) {
  return (
    <ul className="flex flex-col rounded-kit-object bg-kit-object shadow-kit-object [&>li+li]:border-t [&>li+li]:border-kit-hairline">
      {children}
    </ul>
  )
}

function IdeasPage() {
  return (
    <>
      <PageHead title="Ideas" summary="5 waiting. You usually draft 3 a week." />
      {IDEA_GROUPS.map((g) => (
        <section key={g.source} className="flex flex-col gap-2.5">
          <span className="flex flex-wrap items-baseline justify-between gap-x-4">
            <span className="font-kit-strong">{g.source}</span>
            <Mono>{g.at}</Mono>
          </span>
          <Rows>
            {g.ideas.map((idea) => (
              <li key={idea.title} className="flex items-center justify-between gap-4 px-5 py-3">
                <span className="flex min-w-0 flex-col">
                  <span className="font-kit-strong">{idea.title}</span>
                  <span className="text-kit-ink-muted">{idea.line}</span>
                </span>
                <Button>Draft this idea</Button>
              </li>
            ))}
          </Rows>
        </section>
      ))}
    </>
  )
}

function DraftsPage({ go }: { go: Go }) {
  return (
    <>
      <PageHead title="Drafts" summary="2 held for your read." />
      <HeldDraft onOpen={() => go("/drafts")} />
      <section className="flex flex-col gap-2.5">
        <span className="font-kit-strong">Approved</span>
        <Rows>
          <li className="flex items-center justify-between gap-4 px-5 py-3">
            <span className="flex flex-col">
              <span className="font-kit-strong">Hire for the second year</span>
              <span className="text-kit-ink-muted">From your voice note · Sun walk</span>
            </span>
            <Mono>LinkedIn · Fri 12:00</Mono>
          </li>
        </Rows>
      </section>
    </>
  )
}

function LineupPage() {
  return (
    <>
      <PageHead title="Lineup" summary="This week. 3 going out, 1 out already." />
      <Rows>
        {WEEK.map((d) => (
          <li key={d.day} className="flex gap-5 px-5 py-3">
            <span className="flex w-12 shrink-0 flex-col">
              <span className="font-kit-strong">{d.day}</span>
              <Mono>{d.date} Nov</Mono>
            </span>
            {d.items.length === 0 ? (
              <span className="text-kit-ink-muted">Nothing going out.</span>
            ) : (
              d.items.map((i) => (
                <span key={i.title} className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-4">
                  <span className="flex flex-col">
                    <span className="font-kit-strong">{i.title}</span>
                    <span className="text-kit-ink-muted">{i.state}</span>
                  </span>
                  <Mono>
                    {i.channel} · {i.time}
                  </Mono>
                </span>
              ))
            )}
          </li>
        ))}
      </Rows>
    </>
  )
}

function NumbersPage() {
  return (
    <>
      <PageHead title="Numbers" summary="Each post against your own median, not a follower count." />
      <Rows>
        {RESULTS.map((r) => (
          <li key={r.title} className="flex items-center justify-between gap-4 px-5 py-3">
            <span className="flex min-w-0 flex-col">
              <span className="font-kit-strong">{r.title}</span>
              <span className="text-kit-ink-muted">
                {r.channel} · {r.at} · {r.reads}
              </span>
            </span>
            <Text as="span" variant="figure">
              {r.times}
            </Text>
          </li>
        ))}
      </Rows>
    </>
  )
}

function SourcesPage() {
  return (
    <>
      <PageHead title="Sources" summary="What Quincy reads." />
      <Rows>
        {SOURCES.map((s) => (
          <li key={s.name} className="flex items-center justify-between gap-4 px-5 py-3">
            <span className="flex flex-col">
              <span className="font-kit-strong">{s.name}</span>
              <span className="text-kit-ink-muted">
                {s.state === "live" ? <LiveDot>{s.line}</LiveDot> : s.line}
              </span>
            </span>
            {s.state === "live" ? <Mono>Reading</Mono> : <Button>Connect</Button>}
          </li>
        ))}
      </Rows>
    </>
  )
}

function QuietPage({ route }: { route: string }) {
  const page = QUIET_PAGES[route]
  if (!page) return <PageHead title={nav(route).label} />
  return (
    <>
      <PageHead title={page.title} summary={page.summary} />
      <Rows>
        {page.rows.map(([k, v]) => (
          <li key={k} className="flex items-baseline justify-between gap-4 px-5 py-3">
            <span className="font-kit-strong">{k}</span>
            <span className="text-kit-ink-muted">{v}</span>
          </li>
        ))}
      </Rows>
    </>
  )
}

function ConversationsPage({ go }: { go: Go }) {
  return (
    <>
      <PageHead title="Conversations" summary="Everything you and Quincy have talked about." />
      <Rows>
        {CONVERSATIONS.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => go("/studio")}
              className="flex w-full items-baseline justify-between gap-4 px-5 py-3 text-left transition-[background-color] duration-(--kit-duration-state) hover:bg-kit-stage motion-reduce:transition-none"
            >
              <span className="font-kit-strong">{c.title}</span>
              <Mono>{c.at}</Mono>
            </button>
          </li>
        ))}
      </Rows>
    </>
  )
}

/**
 * A page's body, without its frame: the directions decide the column, the
 * padding and where it scrolls. Studio is not here; each direction places
 * the thread itself, because where the chat lives is the question.
 */
export function PageBody({ route, go }: { route: string; go: Go }) {
  if (current(route, "/riffs")) return <IdeasPage />
  if (current(route, "/drafts")) return <DraftsPage go={go} />
  if (current(route, "/lineup")) return <LineupPage />
  if (current(route, "/numbers")) return <NumbersPage />
  if (current(route, "/sources")) return <SourcesPage />
  if (route === "/conversations") return <ConversationsPage go={go} />
  return <QuietPage route={route} />
}

/** A page column at the kit's page measure. `phone` tightens the gutters. */
export function PageColumn({ children, phone = false }: { children: React.ReactNode; phone?: boolean }) {
  return (
    <div
      className={
        phone
          ? "flex flex-col gap-6 px-4 pt-4 pb-24"
          : "mx-auto flex w-full max-w-kit-page flex-col gap-8 px-8 pt-10 pb-24"
      }
    >
      {children}
    </div>
  )
}

/** The Studio: the thread over a docked composer, both on one column. */
export function StudioColumn({
  go,
  variant = "page",
  header,
}: {
  go: Go
  /** `page` is a centred 640 column; `pane` fills a docked pane; `phone` is a phone's width. */
  variant?: "page" | "pane" | "phone"
  header?: React.ReactNode
}) {
  const column = {
    page: "mx-auto flex w-full max-w-[40rem] flex-col gap-6 px-8 pt-10 pb-8",
    pane: "flex flex-col gap-6 px-6 pt-4 pb-8",
    phone: "flex flex-col gap-5 px-4 pt-4 pb-6",
  }[variant]
  const dock = {
    page: "mx-auto w-full max-w-[40rem] px-8 pb-6",
    pane: "px-4 pb-4",
    phone: "px-3 pb-8",
  }[variant]
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={column}>
          {header}
          <Thread go={go} />
        </div>
      </div>
      <div className={dock}>
        <Composer />
      </div>
    </div>
  )
}

/** A sidebar or menu row as a button: text, maybe a waiting count, no icon. */
export function TextRow({
  item,
  route,
  go,
  icon = false,
  tall = false,
}: {
  item: NavItem
  route: string
  go: Go
  icon?: boolean
  tall?: boolean
}) {
  const on = current(route, item.href)
  const waiting = on ? 0 : (WAITING[item.href] ?? 0)
  return (
    <button
      type="button"
      onClick={() => go(item.href)}
      aria-current={on ? "page" : undefined}
      data-on={on || undefined}
      className={`flex w-full items-center gap-2.5 rounded-kit-control-inner px-2.5 text-left text-kit-ink-muted transition-[background-color,color] duration-(--kit-duration-state) ease-kit-out hover:bg-kit-stage hover:text-kit-ink data-on:bg-kit-stage data-on:font-kit-strong data-on:text-kit-ink motion-reduce:transition-none ${tall ? "h-11" : "h-8 pointer-coarse:h-11"}`}
    >
      {icon ? <HugeiconsIcon icon={item.icon} size={16} strokeWidth={1.8} aria-hidden className="shrink-0" /> : null}
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {waiting ? (
        <span className="tabular-nums">
          <Mono>{waiting}</Mono>
          <span className="sr-only"> waiting</span>
        </span>
      ) : null}
    </button>
  )
}

/** A text link in a top bar: a pill when current, muted ink otherwise. */
export function TopLink({ item, route, go }: { item: NavItem; route: string; go: Go }) {
  const on = current(route, item.href)
  const waiting = on ? 0 : (WAITING[item.href] ?? 0)
  return (
    <button
      type="button"
      onClick={() => go(item.href)}
      aria-current={on ? "page" : undefined}
      data-on={on || undefined}
      className="relative inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-kit-ink-muted transition-[background-color,color] duration-(--kit-duration-state) ease-kit-out hover:text-kit-ink data-on:bg-kit-stage data-on:font-kit-strong data-on:text-kit-ink motion-reduce:transition-none pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:top-1/2 pointer-coarse:after:h-11 pointer-coarse:after:-translate-y-1/2"
    >
      {item.label}
      {waiting ? (
        <span>
          <Mono>{waiting}</Mono>
          <span className="sr-only"> waiting</span>
        </span>
      ) : null}
    </button>
  )
}

/** Past conversations, behind one control rather than a list in the frame. */
export function HistoryMenu({ go, trigger }: { go: Go; trigger: React.ReactElement }) {
  return (
    <Menu>
      <MenuTrigger render={trigger} />
      <MenuPanel align="start">
        <MenuGroup>
          <MenuGroupLabel>Conversations</MenuGroupLabel>
          {CONVERSATIONS.map((c) => (
            <MenuItem key={c.id} onClick={() => go("/studio")}>
              {c.title}
            </MenuItem>
          ))}
        </MenuGroup>
        <MenuSeparator />
        <MenuItem onClick={() => go("/conversations")}>All conversations</MenuItem>
      </MenuPanel>
    </Menu>
  )
}

/**
 * A panel inside a frame (the phone's sheet, the desktop's thread drawer).
 * Positioned in the frame, not portalled, so it stays in the picture. Inert
 * while closed, Escape and the scrim close it. Not a focus trap: this is a
 * picture of the behaviour; the real one is Base UI's Dialog, as the shell's
 * MobileSheet already uses.
 */
export function FrameSheet({
  open,
  onClose,
  side,
  label,
  children,
}: {
  open: boolean
  onClose: () => void
  side: "left" | "right" | "bottom"
  label: string
  children: React.ReactNode
}) {
  const place = {
    left: "inset-y-0 left-0 w-[17rem] data-closed:-translate-x-full",
    right: "inset-y-0 right-0 w-[28rem] border-l border-kit-hairline data-closed:translate-x-full",
    bottom: "inset-x-0 bottom-0 h-[88%] rounded-t-kit-stage data-closed:translate-y-full",
  }[side]
  return (
    <>
      <button
        type="button"
        aria-label={`Close ${label}`}
        tabIndex={-1}
        onClick={onClose}
        data-closed={!open || undefined}
        className="absolute inset-0 z-10 bg-kit-scrim transition-[opacity] duration-(--kit-duration-state) ease-kit-out data-closed:pointer-events-none data-closed:opacity-0 motion-reduce:transition-none"
      />
      <div
        role="dialog"
        aria-label={label}
        inert={!open}
        data-closed={!open || undefined}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose()
        }}
        className={`absolute z-20 flex flex-col bg-kit-ground shadow-kit-lifted transition-[translate] duration-(--kit-duration-enter) ease-kit-out motion-reduce:transition-none ${place}`}
      >
        {children}
      </div>
    </>
  )
}

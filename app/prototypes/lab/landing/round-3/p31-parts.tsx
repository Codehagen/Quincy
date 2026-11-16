"use client"

/*
 * Shared parts for round 3, pieces 31–35: one direction, five variants.
 *
 * Base: 30 "Small and inked", in light, with Pixel friend in place of the ink
 * blob. These parts hold the facts the five pages share (what Quincy reads,
 * where it posts, what it says when it comes to you, the price) so the pages
 * differ only in how they compose them.
 */

import * as React from "react"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import {
  ArrowRight02Icon,
  ClipboardPasteIcon,
  GithubIcon,
  Image01Icon,
  Linkedin01Icon,
  LoomIcon,
  Mail01Icon,
  Mic01Icon,
  NewTwitterIcon,
  NotionIcon,
  RssIcon,
  SlackIcon,
} from "@hugeicons/core-free-icons"

import { PixelFriend, QuincyMark, type MascotState } from "@/components/mascot"
import { useInView, useReducedMotion } from "@/components/kit"

import { LockScreen, Notification, Phone } from "@/components/showcase"

import { Hl, Margin } from "../round-1/a/marks"
import { Pic } from "../round-2/a/parts"
import { Chrome, Cta, DraftActions, PRICE, Receipt, REFUSALS } from "../round-2/b/bits"

export { PRICE, REFUSALS, Cta, DraftActions, Receipt, Chrome }

/* ── Connectors ────────────────────────────────────────────────────────── */

export type Connector = { id: string; label: string; gives: string; icon?: IconSvgElement }

/*
 * Names and "gives" lines mirror SOURCES in lib/sources.ts. That module reads
 * the database, so a client page cannot import it; keep the two in step.
 * An icon only where hugeicons has a glyph for the thing itself; a brand with
 * no glyph (Circleback, Granola, Fathom, Google Calendar) is its name alone.
 */
export const READS_NOW: Connector[] = [
  { id: "voice", label: "Voice notes", gives: "What you said out loud, transcribed", icon: Mic01Icon },
  { id: "github", label: "GitHub", gives: "Pull requests as they merge", icon: GithubIcon },
  { id: "circleback", label: "Circleback", gives: "The moment worth quoting from a call" },
  { id: "paste", label: "Pasted text", gives: "Notes you paste in", icon: ClipboardPasteIcon },
]

export const POSTS_NOW: Connector[] = [
  { id: "x", label: "X", gives: "Posts, at the time you approved", icon: NewTwitterIcon },
  { id: "linkedin", label: "LinkedIn", gives: "Posts, at the time you approved", icon: Linkedin01Icon },
]

export const READS_NEXT: Connector[] = [
  { id: "slack", label: "Slack", gives: "How you already explain things to your team", icon: SlackIcon },
  { id: "loom", label: "Loom", gives: "Demos you narrated", icon: LoomIcon },
  { id: "email", label: "Email", gives: "Replies and threads you already wrote", icon: Mail01Icon },
  { id: "granola", label: "Granola", gives: "Notes and transcripts from calls" },
  { id: "fathom", label: "Fathom", gives: "Recordings and transcripts from calls" },
  { id: "photos", label: "Photos", gives: "Screenshots and camera roll", icon: Image01Icon },
  { id: "notion", label: "Notion", gives: "Docs you already wrote", icon: NotionIcon },
  { id: "calendar", label: "Google Calendar", gives: "What is on this week" },
  { id: "rss", label: "RSS", gives: "Feeds you read", icon: RssIcon },
]

/** One connector as a tile. `quiet` is for the ones that come next. */
export function Tile({ c, quiet = false, size = "md" }: { c: Connector; quiet?: boolean; size?: "sm" | "md" }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-kit-control font-[520] ${
        size === "md" ? "h-10 px-3.5 text-[15px]" : "h-8 px-2.5 text-[13px]"
      } ${quiet ? "text-kit-ink-muted shadow-kit-inset" : "bg-kit-object shadow-kit-control"}`}
    >
      {c.icon ? (
        <HugeiconsIcon icon={c.icon} size={size === "md" ? 17 : 14} strokeWidth={1.8} aria-hidden />
      ) : null}
      {c.label}
    </span>
  )
}

/** A row in a register: the name, what it hands over. */
export function Row({ c, quiet = false }: { c: Connector; quiet?: boolean }) {
  return (
    <div className={`flex items-center gap-3 py-3 ${quiet ? "text-kit-ink-muted" : ""}`}>
      <span
        className={`grid size-9 flex-none place-items-center rounded-kit-control ${quiet ? "shadow-kit-inset" : "bg-kit-object shadow-kit-control"}`}
      >
        {c.icon ? (
          <HugeiconsIcon icon={c.icon} size={17} strokeWidth={1.8} aria-hidden />
        ) : (
          <span className="size-1.5 rounded-full bg-kit-skeleton" aria-hidden />
        )}
      </span>
      <span className="leading-[1.3]">
        <span className={`block text-[15px] font-[560] ${quiet ? "font-[500]" : ""}`}>{c.label}</span>
        <span className="block text-[13px] text-kit-ink-muted">{c.gives}</span>
      </span>
    </div>
  )
}

/**
 * Both sides of the product: what it reads, where it posts. The friend sits
 * between them, reading. What comes next is a quieter line below, labelled
 * as next, never as a tile wall.
 */
export function Connectors({ friend = 48, nextStyle = "tiles" }: { friend?: number; nextStyle?: "tiles" | "line" }) {
  return (
    <div className="w-[960px] text-left">
      <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-10">
        <div className="rounded-kit-stage bg-kit-stage px-7 pt-6 pb-4">
          <div className="text-[13px] font-[560] text-kit-ink-muted">What Quincy reads</div>
          <div className="mt-2 flex flex-col">
            {READS_NOW.map((c) => (
              <Row key={c.id} c={c} />
            ))}
          </div>
        </div>
        <div className="flex flex-col items-center gap-3 self-center text-kit-ink-muted">
          {friend ? <PixelFriend state="reading" size={friend} className="text-kit-ink" /> : null}
          <HugeiconsIcon icon={ArrowRight02Icon} size={22} strokeWidth={1.6} aria-hidden />
        </div>
        <div className="rounded-kit-stage bg-kit-stage px-7 pt-6 pb-4">
          <div className="text-[13px] font-[560] text-kit-ink-muted">Where it posts</div>
          <div className="mt-2 flex flex-col">
            {POSTS_NOW.map((c) => (
              <Row key={c.id} c={c} />
            ))}
          </div>
          <p className="mt-3 border-t border-kit-hairline pt-4 text-[13px] leading-[1.5] text-kit-ink-muted">
            Only these two. A channel goes on this list when it works.
          </p>
        </div>
      </div>
      <div className="mt-8 flex items-center gap-4">
        <span className="flex-none text-[13px] font-[560] text-kit-ink-muted">Next</span>
        {nextStyle === "tiles" ? (
          <div className="flex flex-wrap gap-2">
            {READS_NEXT.map((c) => (
              <Tile key={c.id} c={c} quiet size="sm" />
            ))}
          </div>
        ) : (
          <p className="text-[14px] text-kit-ink-muted">{READS_NEXT.map((c) => c.label).join(", ")}.</p>
        )}
      </div>
    </div>
  )
}

/* ── Quincy comes to you ───────────────────────────────────────────────── */

export type Message = {
  at: string
  text: string
  /** The person's choice. Every message ends in one. */
  choices: string[]
  /** What the person answered, if the picture shows it. */
  reply?: string
}

export const MESSAGES: Message[] = [
  {
    at: "Tue 07:40",
    text: "Morning. 3 ideas from yesterday's merged PR. The second has a number.",
    choices: ["Draft the second", "Show all 3"],
    reply: "Draft the second.",
  },
  {
    at: "Tue 07:52",
    text: "Draft's ready. Want it out at 8:30? It's held for your read.",
    choices: ["Read it", "Not today"],
    reply: "Read it. Yes, 8:30.",
  },
  {
    at: "Wed 10:15",
    text: "Posted at 08:30. 1.6× your median.",
    choices: ["See the post", "Next idea"],
  },
]

/** The app icon: the friend, light, on an ink tile. Frozen: icons do not blink. */
export function AppIcon({ size = 38 }: { size?: number }) {
  return (
    <span
      className="grid flex-none place-items-center bg-kit-ink text-kit-ground"
      style={{ width: size, height: size, borderRadius: size * 0.24 }}
    >
      <PixelFriend size={size >= 44 ? 32 : 16} frozenAt={0} />
    </span>
  )
}

/** A notification from Quincy, as a phone or a desktop shows it. */
export function Notice({
  m,
  width = 420,
  showChoices = false,
  icon = true,
}: {
  m: Message
  width?: number
  showChoices?: boolean
  icon?: boolean
}) {
  return (
    <div style={{ width }} className="rounded-[22px] bg-kit-object px-4 py-3.5 text-left shadow-kit-object">
      <div className="flex gap-3">
        {icon ? <AppIcon /> : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between text-[13px]">
            <span className="font-[600]">Quincy</span>
            <span className="text-kit-ink-muted">{m.at}</span>
          </div>
          <p className="mt-0.5 text-[15px] leading-[1.4]">{m.text}</p>
        </div>
      </div>
      {showChoices ? (
        <div className={`mt-3 flex gap-1.5 ${icon ? "pl-[50px]" : ""}`}>
          {m.choices.map((c) => (
            <span
              key={c}
              className="inline-flex h-8 items-center rounded-full bg-kit-control px-3.5 text-[13px] font-[560] shadow-kit-control"
            >
              {c}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/* ── The product, as pictures ──────────────────────────────────────────── */

/**
 * Something with the friend sitting on its top edge, half behind it: only
 * the lower body (below the sash) is hidden, so the eyes and the yellow sash
 * read. `at` is px from the object's left edge.
 */
export function Perch({
  state,
  size = 48,
  at,
  children,
  className,
}: {
  state: MascotState
  size?: number
  at: number
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`relative ${className ?? ""}`}>
      <span className="absolute" style={{ left: at, top: -(size * 13) / 16 }}>
        <PixelFriend state={state} size={size} className="text-kit-ink" />
      </span>
      <div className="relative text-left">{children}</div>
    </div>
  )
}

/** The PR as Quincy read it, with the one line marked. */
export function PrExcerpt({ marked = true, note = true }: { marked?: boolean; note?: boolean }) {
  const line = "Currency tickets since Monday: 2. The week before: 27."
  const body = (
    <p className="w-[440px] text-[15px] leading-[1.6] text-kit-ink-muted">
      Every invoice went out in USD, wherever the customer was.{" "}
      <span className="text-kit-ink">{marked ? <Hl sweep>{line}</Hl> : line}</span>
    </p>
  )
  return (
    <div>
      <div className="flex items-center gap-2 font-kit-mono text-[12px] text-kit-ink-muted">
        <HugeiconsIcon icon={GithubIcon} size={14} strokeWidth={1.8} aria-hidden />
        #212 · merged Monday 16:40
      </div>
      <div className="mt-2 text-[18px] font-[600] tracking-[-0.01em]">Send invoices in the customer&apos;s own currency</div>
      <div className="mt-3">
        {note ? (
          <Margin note="the post is in here" gap={28} width={170}>
            {body}
          </Margin>
        ) : (
          body
        )}
      </div>
    </div>
  )
}

/** The three ideas from one merge, the second picked. */
export const IDEAS = [
  { title: "Why old invoices stay in dollars", from: "#212" },
  { title: "Nobody was upset about the price.", from: "#212 · has a number" },
  { title: "What a support queue tells you about copy", from: "#212" },
] as const

export function IdeaList({ picked = 1, width = 520 }: { picked?: number; width?: number }) {
  return (
    <div style={{ width }} className="flex flex-col gap-1 text-[15px] leading-[1.4]">
      {IDEAS.map((idea, i) => (
        <div
          key={idea.title}
          data-on={i === picked || undefined}
          className="flex items-center justify-between rounded-kit-control px-4 py-3 data-on:bg-kit-well"
        >
          <span>
            <span className={`block ${i === picked ? "font-[560]" : "text-kit-ink-muted"}`}>{idea.title}</span>
            <span className="block text-[12px] text-kit-ink-muted">{idea.from}</span>
          </span>
          {i === picked ? (
            <span className="rounded-kit-control bg-kit-control px-3 py-1.5 text-[13px] font-[560] shadow-kit-control">
              Draft this idea
            </span>
          ) : null}
        </div>
      ))}
    </div>
  )
}

/** The draft in three beats: did, happened, meant. Plain: no marks. */
export function DraftBeats({ size = 15, width = 380 }: { size?: number; width?: number }) {
  return (
    <div style={{ width, fontSize: size }} className="flex flex-col gap-3.5 leading-[1.5]">
      <p>We started sending invoices in our customers&apos; own currency.</p>
      <div>
        <p>Currency tickets the next week:</p>
        <p className="mt-0.5 text-[1.7em] leading-[1.2] font-[600] tracking-[-0.02em] tabular-nums">27 → 2</p>
      </div>
      <p>Nobody was upset about the price. They could not read the bill.</p>
    </div>
  )
}

/** The beats named in plain grey type, beside the draft. No pen. */
export function BeatLabels() {
  return (
    <div className="flex flex-col gap-3.5 text-[12px] leading-[1.5] text-kit-ink-muted">
      <span className="h-[45px]">did</span>
      <span className="h-[68px]">happened</span>
      <span>meant</span>
    </div>
  )
}

/** The draft as a card with its decision on it. */
export function DraftCard({ when = "LinkedIn · Wed 08:30 if you approve" }: { when?: string }) {
  return (
    <div className="flex items-center justify-between gap-6 rounded-kit-object bg-kit-object py-4 pr-4 pl-5 shadow-kit-object">
      <div className="text-[14px] leading-[1.4]">
        <div className="font-[560]">Nobody was upset about the price.</div>
        <div className="text-kit-ink-muted">{when}</div>
      </div>
      <DraftActions />
    </div>
  )
}

/** The work receipt, always ending on the same line. */
export const RECEIPT = [
  ["Read #212", "4 paragraphs"],
  ["Found the number", "27 tickets to 2"],
  ["Drafted", "2 posts, held for your read"],
] as const

/** The week: what is approved, what waits. */
export const WEEK = [
  { day: "Mon", what: "Why old invoices stay in dollars", where: "X", state: "posted" },
  { day: "Wed", what: "Nobody was upset about the price.", where: "LinkedIn", state: "approved" },
  { day: "Thu", what: "Held for your read", where: "X", state: "waiting" },
  { day: "Fri", what: "Open", where: "", state: "open" },
] as const

export function Week({ width = 520 }: { width?: number }) {
  return (
    <div style={{ width }} className="flex flex-col text-[14px]">
      {WEEK.map((d) => (
        <div key={d.day} className="grid grid-cols-[48px_1fr_auto] items-center gap-3 border-b border-kit-hairline py-3 last:border-0">
          <span className="font-kit-mono text-[12px] text-kit-ink-muted">{d.day}</span>
          <span className={d.state === "open" ? "text-kit-ink-muted" : d.state === "waiting" ? "text-kit-ink-muted" : "font-[520]"}>
            {d.what}
          </span>
          <span className="text-[12px] text-kit-ink-muted">
            {d.state === "posted" ? `Posted · ${d.where}` : d.state === "approved" ? `08:30 · ${d.where}` : d.state === "waiting" ? "Waiting for you" : ""}
          </span>
        </div>
      ))}
    </div>
  )
}

/* ── Numbers against your own median ───────────────────────────────────── */

/** Replies per post, for the last ten. The last is the invoice post. */
const POSTS = [0.7, 1.1, 0.9, 1.0, 0.6, 1.3, 0.8, 1.0, 1.2, 1.6]

/**
 * The last ten posts against the person's own median: a dashed line at 1×,
 * bars in grey, the newest in ink. `note` puts the editor's margin note on
 * the number (one of the page's few marks).
 */
export function MedianStrip({ width = 460, note = false }: { width?: number; note?: boolean }) {
  const h = 120
  const max = 1.8
  const figure = (
    <div className="flex items-baseline gap-3">
      <span className="text-[44px] leading-[1] font-[600] tracking-[-0.04em] tabular-nums">1.6×</span>
      <span className="text-[15px] text-kit-ink-muted">your median replies</span>
    </div>
  )
  return (
    <div style={{ width }}>
      {note ? (
        <div className="w-fit">
          <Margin note="against you, not the crowd" gap={20} width={150}>
            {figure}
          </Margin>
        </div>
      ) : (
        figure
      )}
      <div className="relative mt-6" style={{ height: h }} aria-hidden>
        <div
          className="absolute inset-x-0 border-t border-dashed border-kit-ink-muted"
          style={{ bottom: (1 / max) * h }}
        />
        <span
          className="absolute -right-1 translate-x-full bg-kit-object px-1 font-kit-mono text-[11px] text-kit-ink-muted"
          style={{ bottom: (1 / max) * h - 7 }}
        >
          1× you
        </span>
        <div className="absolute inset-0 flex items-end gap-2 pr-10">
          {POSTS.map((v, i) => (
            <span
              key={i}
              className={`flex-1 rounded-t-[3px] ${i === POSTS.length - 1 ? "bg-kit-ink" : "bg-kit-skeleton"}`}
              style={{ height: (v / max) * h }}
            />
          ))}
        </div>
      </div>
      <div className="mt-2 flex justify-between pr-10 font-kit-mono text-[11px] text-kit-ink-muted">
        <span>10 posts ago</span>
        <span>the invoice post</span>
      </div>
    </div>
  )
}

/* ── Page chrome ───────────────────────────────────────────────────────── */

export function TopBar({ right }: { right?: React.ReactNode }) {
  return (
    <div className="flex h-[84px] items-center justify-between px-16 text-[15px]">
      <QuincyMark size="sm" />
      <span className="flex items-center gap-6 text-kit-ink-muted">
        {right ?? (
          <>
            <span>How it works</span>
            <span>Pricing</span>
            <span className="text-kit-ink">Join the waitlist</span>
          </>
        )}
      </span>
    </div>
  )
}

/** The waitlist: the one field and the one button. A picture, so spans. */
export function Waitlist() {
  return (
    <div className="flex w-[460px] items-center gap-2 rounded-full bg-kit-object p-1.5 pl-5 shadow-kit-object">
      <span className="flex-1 text-left text-[15px] text-kit-ink-muted">you@company.com</span>
      <Cta size="md" />
    </div>
  )
}

export function Footer() {
  return (
    <footer className="flex items-center justify-between border-t border-kit-hairline px-16 py-8 text-[14px] text-kit-ink-muted">
      <span className="font-[600] text-kit-ink">Quincy</span>
      <span className="flex items-center gap-6">
        <span>Pricing</span>
        <span>Changelog</span>
        <span>Privacy</span>
        <span>Terms</span>
      </span>
    </footer>
  )
}

/** The price and the never lines, as a list. */
export function Nevers({ width = 640 }: { width?: number }) {
  return (
    <ul style={{ width }} className="flex flex-col text-left">
      {REFUSALS.map((r) => (
        <li key={r.never} className="grid grid-cols-[1fr_1.3fr] gap-8 border-t border-kit-hairline py-5">
          <span className="text-[16px] font-[560]">{r.never}</span>
          <span className="text-[14px] leading-[1.55] text-kit-ink-muted">{r.because}</span>
        </li>
      ))}
    </ul>
  )
}

/** The desk window: Quincy's Studio, cropped. Sidebar names it in words. */
export function Desk({
  children,
  width = 960,
  active = "Studio",
}: {
  children: React.ReactNode
  width?: number
  active?: string
}) {
  return (
    <div style={{ width }} className="flex h-full flex-col overflow-hidden rounded-kit-object bg-kit-object text-left shadow-kit-object">
      <Chrome url="quincy / studio" />
      <div className="flex min-h-0 flex-1">
        <nav className="w-[176px] flex-none border-r border-kit-hairline px-3.5 pt-5 text-[14px]">
          <div className="px-2 font-[600]">Quincy</div>
          <div className="mt-5 flex flex-col gap-0.5">
            {["Studio", "Ideas", "Week", "Numbers", "Sources"].map((x) => (
              <div
                key={x}
                data-on={x === active || undefined}
                className="rounded-kit-control-inner px-2.5 py-1.5 text-kit-ink-muted data-on:bg-kit-stage data-on:font-[560] data-on:text-kit-ink"
              >
                {x}
              </div>
            ))}
          </div>
        </nav>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  )
}

/** A grey stage that crops what stands on it. Objects inside are absolute. */
export function StageBox({
  width = 960,
  height,
  children,
  className,
}: {
  width?: number
  height: number
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      style={{ width, height }}
      className={`relative mx-auto overflow-hidden rounded-kit-stage bg-kit-stage text-left ${className ?? ""}`}
    >
      {children}
    </div>
  )
}

/** The lock screen's wallpaper: a quiet grey, dark enough for white type. */
export const WALLPAPER = "linear-gradient(170deg, var(--kit-gray-450), var(--kit-gray-300))"

/** One of Quincy's messages as the phone's own lock-screen notification. */
export function LockNotice({ m }: { m: Message }) {
  return <Notification icon={<AppIcon size={38} />} title="Quincy" body={m.text} time={m.at.split(" ")[1]} />
}

/** A phone at true iOS size, on its own little stage so the frame resolves. */
export function PhoneShot({
  width = 360,
  height = 760,
  time = "07:41",
  date = "Tuesday 17 November",
  children,
}: {
  width?: number
  height?: number
  time?: string
  date?: string
  children: React.ReactNode
}) {
  return (
    <Pic width={width} height={height}>
      <Phone width={width} time={time} wallpaper={WALLPAPER} dark>
        <LockScreen date={date} time={time} stack="top" controls={false}>
          {children}
        </LockScreen>
      </Phone>
    </Pic>
  )
}

/**
 * Quincy's messages arriving one by one, as a text thread: the friend is
 * the sender's avatar, beside the newest message only (one face on view),
 * and each note ends in the person's choice. Starts when seen; reduced
 * motion shows the finished thread at once.
 */
export function ArrivingThread({
  messages = MESSAGES,
  width = 460,
  gapMs = 1400,
  avatar = 32,
  state = "idle",
  size = 16,
  onStage = false,
}: {
  messages?: Message[]
  width?: number
  gapMs?: number
  avatar?: number
  state?: MascotState
  size?: number
  /** On a grey stage Quincy's bubbles are white objects, not grey wells. */
  onStage?: boolean
}) {
  // Each message and each reply is one step.
  const steps = messages.reduce((n, m) => n + (m.reply ? 2 : 1), 0)
  const [ref, arrived] = useArrival<HTMLDivElement>(steps, gapMs)
  // The first note is already there, so the picture is never an empty stage.
  const visible = Math.max(1, arrived)

  // The step at which each message arrives; its reply is the step after.
  const starts = messages.map((_, i) => messages.slice(0, i).reduce((n, m) => n + (m.reply ? 2 : 1), 0))
  const lastQuincy = starts.reduce((last, at, i) => (at < visible ? i : last), -1)

  return (
    <div ref={ref} style={{ width, fontSize: size }} className="flex flex-col gap-2 text-left">
      {messages.map((m, i) => {
        const qOn = starts[i] < visible
        const rOn = starts[i] + 1 < visible
        return (
          <React.Fragment key={m.at}>
            <div
              data-on={qOn || undefined}
              className="flex translate-y-2 flex-col gap-2 opacity-0 transition-[opacity,translate] duration-(--kit-duration-enter) ease-kit-out data-on:translate-y-0 data-on:opacity-100 motion-reduce:transition-none"
            >
              <div className="mt-2 text-center font-kit-mono text-[11px] text-kit-ink-muted">{m.at}</div>
              <div className="flex items-end gap-2.5">
                <span className="flex-none" style={{ width: avatar, height: avatar }}>
                  {i === lastQuincy ? (
                    <span className="grid size-full place-items-center rounded-full bg-kit-ink text-kit-ground">
                      <PixelFriend state={state} size={avatar >= 40 ? 32 : 16} />
                    </span>
                  ) : null}
                </span>
                <div
                  className={`max-w-[82%] rounded-[20px] rounded-bl-[6px] px-4 py-2.5 leading-[1.4] ${onStage ? "bg-kit-object shadow-kit-object" : "bg-kit-stage"}`}
                >
                  {m.text}
                </div>
              </div>
              <div className="flex gap-1.5" style={{ paddingLeft: avatar + 10 }}>
                {m.choices.map((c) => (
                  <span
                    key={c}
                    className="inline-flex h-8 items-center rounded-full bg-kit-object px-3.5 text-[13px] font-[560] shadow-kit-control"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
            {m.reply ? (
              <div
                data-on={rOn || undefined}
                className="max-w-[70%] translate-y-2 self-end rounded-[20px] rounded-br-[6px] bg-kit-ink px-4 py-2.5 leading-[1.4] text-kit-ground opacity-0 transition-[opacity,translate] duration-(--kit-duration-enter) ease-kit-out data-on:translate-y-0 data-on:opacity-100 motion-reduce:transition-none"
              >
                {m.reply}
              </div>
            ) : null}
          </React.Fragment>
        )
      })}
    </div>
  )
}

/** The thread on a phone: Quincy's messages arriving, the friend as avatar. */
export function PhoneThread({
  width = 380,
  height = 820,
  time = "07:52",
  state = "waiting",
  messages = MESSAGES,
}: {
  width?: number
  height?: number
  time?: string
  state?: MascotState
  messages?: Message[]
}) {
  return (
    <Pic width={width} height={height}>
      <Phone width={width} time={time} wallpaper="var(--kit-object)">
        <div className="flex flex-col px-4 pt-[62px]">
          <div className="border-b border-kit-hairline pb-3 text-center text-[15px] font-[600]">Quincy</div>
          <div className="pt-2">
            <ArrivingThread messages={messages} width={402 - 32} avatar={30} state={state} size={17} />
          </div>
        </div>
      </Phone>
    </Pic>
  )
}

/**
 * How many of `count` things have arrived: one more every `gapMs` once the
 * element is seen. Reduced motion: all of them at once.
 */
export function useArrival<T extends Element>(count: number, gapMs = 1400): [React.RefObject<T | null>, number] {
  const [ref, seen] = useInView<T>()
  const reduced = useReducedMotion()
  const [shown, setShown] = React.useState(0)
  React.useEffect(() => {
    if (!seen || reduced || shown >= count) return
    const t = window.setTimeout(() => setShown((s) => s + 1), shown === 0 ? 300 : gapMs)
    return () => window.clearTimeout(t)
  }, [seen, reduced, shown, count, gapMs])
  return [ref, reduced ? count : shown]
}

/** One arriving thing: rises a few px and fades in when `on`. */
export function Arrives({ on, children, className }: { on: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div
      data-on={on || undefined}
      className={`translate-y-2 opacity-0 transition-[opacity,translate] duration-(--kit-duration-enter) ease-kit-out data-on:translate-y-0 data-on:opacity-100 motion-reduce:transition-none ${className ?? ""}`}
    >
      {children}
    </div>
  )
}

/*
 * Both sides of Quincy, as a still: what it reads, where it posts.
 *
 * Story, in one frame:
 * 1. Left, the material that works today, each row saying what it hands
 *    over. GitHub is connected and reading (the live dot: this is running).
 * 2. Between them the friend, reading.
 * 3. Right, the two channels. X is connected; LinkedIn waits for Connect.
 * 4. Under both, quieter, what comes next, labelled as next.
 *
 * The rows are passed in, so a page can feed them straight from
 * lib/sources.ts and lib/channels.ts and the picture cannot promise a
 * source or a channel that does not work. A brand gets its glyph only where
 * hugeicons has one; the rest are their name alone.
 */

import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import {
  ArrowDown02Icon,
  ArrowRight02Icon,
  CheckmarkCircle02Icon,
  ClipboardPasteIcon,
  GithubIcon,
  Image01Icon,
  InstagramIcon,
  Linkedin01Icon,
  LoomIcon,
  Mail01Icon,
  Mic01Icon,
  NewTwitterIcon,
  NotionIcon,
  RssIcon,
  SlackIcon,
} from "@hugeicons/core-free-icons"

import { LiveDot } from "@/components/kit"
import { Friend } from "@/components/mascot"

export type Connector = { id: string; label: string; gives: string }

const ICONS: Record<string, IconSvgElement> = {
  voice: Mic01Icon,
  github: GithubIcon,
  paste: ClipboardPasteIcon,
  x: NewTwitterIcon,
  linkedin: Linkedin01Icon,
  instagram: InstagramIcon,
  slack: SlackIcon,
  loom: LoomIcon,
  email: Mail01Icon,
  photos: Image01Icon,
  notion: NotionIcon,
  rss: RssIcon,
}

/** What each row is doing in the picture. Anything not listed shows Connect. */
const STATUS: Record<string, "connected" | "reading" | { note: string }> = {
  voice: { note: "Record in Quincy" },
  github: "reading",
  paste: { note: "Paste anything" },
  x: "connected",
}

function Glyph({ id, quiet = false }: { id: string; quiet?: boolean }) {
  const icon = ICONS[id]
  return (
    <span
      aria-hidden
      className={`grid size-9 flex-none place-items-center rounded-kit-control text-kit-ink ${quiet ? "shadow-kit-inset" : "bg-kit-object shadow-kit-control"}`}
    >
      {icon ? (
        <HugeiconsIcon icon={icon} size={17} strokeWidth={1.8} />
      ) : (
        <span className="size-1.5 rounded-full bg-kit-mark" />
      )}
    </span>
  )
}

function Status({ id }: { id: string }) {
  const s = STATUS[id]
  if (s === "reading") {
    return (
      <span className="text-kit-small text-kit-ink-muted">
        <LiveDot>Reading #212</LiveDot>
      </span>
    )
  }
  if (s === "connected") {
    return (
      <span className="inline-flex items-center gap-1 text-kit-small text-kit-ink-muted">
        <HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} strokeWidth={2} aria-hidden />
        Connected
      </span>
    )
  }
  if (s) return <span className="text-kit-small text-kit-ink-muted">{s.note}</span>
  return (
    <span className="inline-flex h-7 items-center rounded-kit-control-inner bg-kit-control px-2.5 text-kit-small font-kit-strong text-kit-ink shadow-kit-control">
      Connect
    </span>
  )
}

function Row({ c }: { c: Connector }) {
  return (
    <li className="flex items-center gap-kit-related py-2.5">
      <Glyph id={c.id} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-kit-body font-kit-strong">{c.label}</span>
        <span className="text-kit-small text-kit-ink-muted">{c.gives}</span>
      </span>
      <span className="flex-none">
        <Status id={c.id} />
      </span>
    </li>
  )
}

function Panel({ title, rows, children }: { title: string; rows: readonly Connector[]; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col rounded-kit-stage bg-kit-stage px-5 pt-5 pb-3 sm:px-7 sm:pt-6">
      <h3 className="text-kit-body font-kit-strong text-kit-ink-muted">{title}</h3>
      <ul className="mt-2 flex flex-col">
        {rows.map((c) => (
          <Row key={c.id} c={c} />
        ))}
      </ul>
      {children}
    </div>
  )
}

export function ReadsAndPosts({
  reads,
  posts,
  next,
}: {
  reads: readonly Connector[]
  posts: readonly Connector[]
  next: readonly Connector[]
}) {
  return (
    <div className="flex flex-col gap-8 text-left">
      <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-stretch md:gap-8">
        <Panel title="What Quincy reads" rows={reads} />
        <div className="pointer-events-none flex items-center justify-center gap-3 text-kit-ink-muted select-none md:flex-col" aria-hidden>
          <Friend state="reading" size={48} className="text-kit-ink" />
          <HugeiconsIcon icon={ArrowRight02Icon} size={22} strokeWidth={1.6} className="hidden md:block" />
          <HugeiconsIcon icon={ArrowDown02Icon} size={22} strokeWidth={1.6} className="md:hidden" />
        </div>
        <Panel title="Where it posts" rows={posts}>
          <p className="mt-auto border-t border-kit-hairline pt-4 pb-2 text-kit-small text-kit-ink-muted">
            Only these two. A channel goes on this list when it works.
          </p>
        </Panel>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
        <h3 className="flex-none pt-1.5 text-kit-body font-kit-strong text-kit-ink-muted">Next</h3>
        <ul className="flex flex-wrap gap-kit-controls" aria-label="Sources coming next">
          {next.map((c) => {
            const icon = ICONS[c.id]
            return (
              <li
                key={c.id}
                className="inline-flex h-8 items-center gap-1.5 rounded-kit-control px-2.5 text-kit-small text-kit-ink-muted shadow-kit-inset"
              >
                {icon ? <HugeiconsIcon icon={icon} size={14} strokeWidth={1.8} aria-hidden /> : null}
                {c.label}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

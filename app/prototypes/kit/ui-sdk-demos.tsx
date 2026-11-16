"use client"

import * as React from "react"
import {
  BrainIcon,
  Calendar03Icon,
  File01Icon,
  Home01Icon,
  Idea01Icon,
  Mic01Icon,
  Note01Icon,
  PencilEdit02Icon,
  Settings01Icon,
  UserIcon,
} from "@hugeicons/core-free-icons"

import {
  Calendar,
  Card,
  CommandPalette,
  DateTimePicker,
  List,
  Mono,
  Reorderable,
  Segmented,
  Tag,
  Text,
  TokenInput,
  Tree,
  type CommandPaletteGroup,
  type CommandPaletteStatus,
  type DateTimeValue,
  type TreeNode,
} from "@/components/kit"

/*
 * Lab demos for the ui-sdk components (sections/ui-sdk.tsx). Fixed dates
 * (today is Mon 16 Nov 2026) so the pictures do not move.
 */

const TODAY = "2026-11-16"

// ── Command palette ─────────────────────────────────────────────────────

const PALETTE: CommandPaletteGroup[] = [
  {
    label: "Pages",
    items: [
      { value: "/today", label: "Today", icon: Home01Icon },
      { value: "/ideas", label: "Ideas", icon: Idea01Icon, keywords: ["riffs", "angles"] },
      { value: "/drafts", label: "Drafts", icon: PencilEdit02Icon },
      { value: "/lineup", label: "Lineup", icon: Calendar03Icon, keywords: ["schedule", "week", "calendar"] },
      { value: "/brain", label: "Brain", icon: BrainIcon, keywords: ["memory", "voice"] },
      { value: "/settings", label: "Settings", icon: Settings01Icon, keywords: ["account", "billing"] },
    ],
  },
  {
    label: "Recent drafts",
    items: [
      { value: "draft:1", label: "We cut onboarding from 9 steps to 3", icon: Note01Icon, meta: "2h" },
      { value: "draft:2", label: "The pricing page nobody read", icon: Note01Icon, meta: "Yesterday" },
      { value: "draft:3", label: "What a 40-minute call taught me about churn", icon: Mic01Icon, meta: "Fri" },
    ],
  },
]

const PALETTE_PAGES_ONLY: CommandPaletteGroup[] = [PALETTE[0]]

export function CommandPaletteDemo() {
  const [last, setLast] = React.useState<string | null>(null)
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <CommandPalette
        groups={PALETTE}
        onAction={(v) => setLast(`Opened ${v}`)}
        onAsk={(q) => setLast(q ? `Asked Quincy: “${q}”` : "Opened the chat")}
      />
      <Text variant="small" tone="muted" aria-live="polite">
        {last ?? "Press the pill, or ⌘K / Ctrl+K anywhere on this page."}
      </Text>
    </div>
  )
}

const STATUSES = [
  { value: "loading", label: "Loading" },
  { value: "error", label: "Error" },
] as const

export function CommandPaletteStates() {
  const [status, setStatus] = React.useState<CommandPaletteStatus>("loading")
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <Segmented
        aria-label="Drafts status"
        options={STATUSES}
        value={status === "idle" ? "loading" : status}
        onValueChange={(v) => setStatus(v)}
      />
      <CommandPalette
        hotkey={false}
        groups={PALETTE_PAGES_ONLY}
        status={status}
        onRetry={() => setStatus("loading")}
        onAction={() => {}}
        onAsk={() => {}}
        triggerLabel="Open with drafts loading"
      />
    </div>
  )
}

// ── Token input ─────────────────────────────────────────────────────────

const CHANNEL_NAMES = new Map(
  ["LinkedIn", "X", "Threads", "Bluesky", "Instagram", "TikTok", "YouTube"].map((c) => [c.toLowerCase(), c]),
)

const channel = (text: string) => CHANNEL_NAMES.get(text.trim().toLowerCase()) ?? null

export function TokenInputDemo() {
  const [channels, setChannels] = React.useState<string[]>(["LinkedIn", "X"])
  return (
    <Card>
      <form className="flex flex-col gap-kit-group" onSubmit={(e) => e.preventDefault()}>
        <TokenInput
          label="Channels"
          kind="channel"
          values={channels}
          onValuesChange={setChannels}
          normalize={channel}
          description="Type a channel and a comma. Paste “Threads, Bluesky” for two."
          placeholder="LinkedIn, X, Threads…"
        />
        <TokenInput
          label="Tags"
          kind="tag"
          defaultValues={["pricing", "build-in-public"]}
          normalize={(t) => t.trim().replace(/^#/, "").toLowerCase().replace(/\s+/g, "-") || null}
          max={5}
          description="Up to five. Quincy files ideas under them."
        />
        <Text variant="small" tone="muted">
          Channels: <Mono>{channels.join(", ") || "none"}</Mono>
        </Text>
      </form>
    </Card>
  )
}

export function TokenInputStates() {
  return (
    <Card>
      <div className="flex flex-col gap-kit-group">
        <TokenInput label="Sources" kind="source" placeholder="Add a feed, a folder or a repo" />
        <TokenInput
          label="Channels"
          kind="channel"
          defaultValues={["Instagram"]}
          error="Instagram isn’t connected. Connect it in Settings, or remove it."
        />
        <TokenInput label="Channels" kind="channel" defaultValues={["LinkedIn", "X"]} readOnly description="Set by your workspace." />
        <TokenInput label="Channels" kind="channel" defaultValues={["LinkedIn"]} disabled />
      </div>
    </Card>
  )
}

// ── Calendar ────────────────────────────────────────────────────────────

const SLOTS = {
  "2026-11-17": 1,
  "2026-11-18": 2,
  "2026-11-20": 1,
  "2026-11-23": 3,
  "2026-11-25": 1,
} as const

const DAY_FMT = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })

export function CalendarDemo() {
  const [day, setDay] = React.useState<string | null>("2026-11-18")
  return (
    <Card width="full">
      <div className="flex flex-col items-center gap-3">
        <Calendar value={day} onValueChange={setDay} slots={SLOTS} today={TODAY} min={TODAY} />
        <Text variant="small" tone="muted">
          {day ? DAY_FMT.format(new Date(`${day}T00:00:00Z`)) : "No day picked"}
          {day && SLOTS[day as keyof typeof SLOTS]
            ? ` · ${SLOTS[day as keyof typeof SLOTS]} scheduled`
            : ""}
        </Text>
      </div>
    </Card>
  )
}

export function CalendarStates() {
  return (
    <div className="flex w-full flex-col items-center gap-4">
      <Card>
        <Calendar today={TODAY} status="loading" aria-label="Schedule, loading" />
      </Card>
      <Card>
        <Calendar today={TODAY} status="error" aria-label="Schedule, failed" />
      </Card>
      <Card>
        <Calendar
          today={TODAY}
          min={TODAY}
          unavailable={[{ weekday: [0, 6] }]}
          slots={SLOTS}
          aria-label="Weekdays only"
        />
      </Card>
      <Card>
        <Calendar today={TODAY} defaultValue="2026-11-19" disabled aria-label="Schedule, disabled" />
      </Card>
    </div>
  )
}

// ── Date and time ───────────────────────────────────────────────────────

const TIMES = ["08:30", "12:00", "17:30", "20:00"] as const

const TAKEN = {
  "2026-11-17": ["08:30"],
  "2026-11-18": ["08:30", "17:30"],
  "2026-11-20": ["12:00"],
  "2026-11-23": ["08:30", "12:00", "17:30", "20:00"],
} as const

export function DateTimeDemo() {
  const [when, setWhen] = React.useState<DateTimeValue | null>(null)
  return (
    <Card>
      <form className="flex flex-col gap-kit-group" onSubmit={(e) => e.preventDefault()}>
        <DateTimePicker
          label="Publish on"
          times={TIMES}
          taken={TAKEN}
          min={TODAY}
          today={TODAY}
          value={when}
          onValueChange={setWhen}
        />
        <Text variant="small" tone="muted">
          {when ? (
            <>
              Goes out <Mono>{when.date}</Mono> at <Mono>{when.time}</Mono>
            </>
          ) : (
            "Not scheduled yet."
          )}
        </Text>
      </form>
    </Card>
  )
}

export function DateTimeStates() {
  return (
    <Card>
      <div className="flex flex-col gap-kit-group">
        <DateTimePicker
          label="Publish on"
          times={TIMES}
          taken={TAKEN}
          min={TODAY}
          today={TODAY}
          defaultValue={{ date: "2026-11-19", time: "12:00" }}
        />
        <DateTimePicker
          label="Publish on"
          times={TIMES}
          today={TODAY}
          defaultValue={{ date: "2026-11-18", time: "17:30" }}
          error="Another post took 17:30 on Wed 18 Nov. Pick another time."
        />
        <DateTimePicker label="Publish on" times={[]} today={TODAY} />
        <DateTimePicker
          label="Publish on"
          times={TIMES}
          today={TODAY}
          defaultValue={{ date: "2026-11-17", time: "20:00" }}
          disabled
        />
      </div>
    </Card>
  )
}

// ── Reorderable ─────────────────────────────────────────────────────────

type Slot = { id: string; day: string; hook: string; channel: string }

const LINEUP: Slot[] = [
  { id: "a", day: "Mon", hook: "We cut onboarding from 9 steps to 3", channel: "LinkedIn" },
  { id: "b", day: "Tue", hook: "The pricing page nobody read", channel: "X" },
  { id: "c", day: "Wed", hook: "What a 40-minute call taught me about churn", channel: "LinkedIn" },
  { id: "d", day: "Thu", hook: "Three things I stopped doing in standups", channel: "Threads" },
  { id: "e", day: "Fri", hook: "Our first refund, and why I was glad", channel: "X" },
]

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"]

export function ReorderDemo() {
  const [items, setItems] = React.useState(LINEUP)
  return (
    <List width="full">
      <Reorderable
        aria-label="Lineup for this week"
        items={items}
        itemKey={(s) => s.id}
        itemLabel={(s) => s.hook}
        onReorder={setItems}
      >
        {(slot, { position }) => (
          <>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-kit-strong">{slot.hook}</span>
              {/* The day belongs to the slot: it stands still while posts slide. */}
              <span data-reorder-slot="" className="text-kit-small text-kit-ink-muted">
                {DAYS[position - 1]}
              </span>
            </span>
            <span className="hidden sm:inline-flex">
              <Tag>{slot.channel}</Tag>
            </span>
          </>
        )}
      </Reorderable>
    </List>
  )
}

export function ReorderStates() {
  return (
    <div className="grid w-full grid-cols-1 gap-4 items-start sm:grid-cols-2">
      <List>
        <Reorderable
          aria-label="Empty lineup"
          items={[] as Slot[]}
          itemKey={(s) => s.id}
          itemLabel={(s) => s.hook}
          onReorder={() => {}}
        >
          {(s) => s.hook}
        </Reorderable>
      </List>
      <List>
        <Reorderable
          aria-label="Lineup, locked"
          items={LINEUP.slice(0, 3)}
          itemKey={(s) => s.id}
          itemLabel={(s) => s.hook}
          onReorder={() => {}}
          disabled
        >
          {(s) => <span className="truncate">{s.hook}</span>}
        </Reorderable>
      </List>
    </div>
  )
}

// ── Tree ────────────────────────────────────────────────────────────────

const BRAIN: TreeNode[] = [
  {
    value: "you",
    label: "You",
    icon: UserIcon,
    children: [
      { value: "you/voice", label: "Voice", icon: File01Icon, meta: "2d" },
      { value: "you/positioning", label: "Positioning", icon: File01Icon, meta: "1w" },
      { value: "you/off-limits", label: "Off limits", icon: File01Icon },
    ],
  },
  {
    value: "topics",
    label: "Topics",
    icon: Idea01Icon,
    meta: "4",
    children: [
      { value: "topics/pricing", label: "Pricing", icon: File01Icon, meta: "today" },
      { value: "topics/onboarding", label: "Onboarding", icon: File01Icon },
      {
        value: "topics/hiring",
        label: "Hiring",
        icon: File01Icon,
        children: [
          { value: "topics/hiring/first-engineer", label: "The first engineer", icon: File01Icon },
          { value: "topics/hiring/interviews", label: "How we interview", icon: File01Icon },
        ],
      },
      { value: "topics/build-in-public", label: "Building in public", icon: File01Icon },
    ],
  },
  {
    value: "people",
    label: "People",
    icon: UserIcon,
    meta: "12",
    children: [
      { value: "people/ines", label: "Inès Moreau", icon: File01Icon },
      { value: "people/kofi", label: "Kofi Mensah", icon: File01Icon },
    ],
  },
  { value: "sources", label: "Sources", icon: Mic01Icon, meta: "7" },
]

export function TreeDemo() {
  const [page, setPage] = React.useState<string | null>("topics/pricing")
  return (
    <div className="flex w-full flex-col gap-3">
      <List width="full">
        <Tree
          aria-label="Brain pages"
          items={BRAIN}
          value={page}
          onValueChange={setPage}
          defaultExpanded={["topics"]}
        />
      </List>
      <Text variant="small" tone="muted">
        Open: <Mono>{page ?? "none"}</Mono>
      </Text>
    </div>
  )
}

export function TreeStates() {
  const [failed, setFailed] = React.useState(true)
  return (
    <div className="grid w-full grid-cols-1 items-start gap-4 sm:grid-cols-3">
      <List>
        <Tree aria-label="Brain pages, loading" items={[]} status="loading" />
      </List>
      <List>
        <Tree
          aria-label="Brain pages, failed"
          items={[]}
          status={failed ? "error" : "loading"}
          onRetry={() => setFailed(false)}
        />
      </List>
      <List>
        <Tree aria-label="Brain pages, empty" items={[]} />
      </List>
    </div>
  )
}

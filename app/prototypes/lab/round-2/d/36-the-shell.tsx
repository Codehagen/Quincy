"use client"

import * as React from "react"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import {
  BrainIcon,
  BulbIcon,
  Calendar03Icon,
  ChartLineData01Icon,
  Megaphone01Icon,
  Message01Icon,
  Plug01Icon,
  QuillWrite01Icon,
  RepeatIcon,
} from "@hugeicons/core-free-icons"

import { Mono, SkeletonLines, Stage, Text, Window, u } from "../kit"
import { color, motion, radius, type } from "../tokens"

/**
 * 36 — The shell.
 *
 * The frame every page lives in. The sidebar is the real route model (Studio,
 * Make, Setup, then history), and the accent is spent on one thing only: a dot
 * on the rows where something waits for you. Opening that page is what clears
 * the dot, so the sidebar reads as "where am I needed", not a feature list.
 */

type Item = {
  id: string
  label: string
  icon: IconSvgElement
  /** What Quincy is doing on that page, in one line. */
  line: string
  /** Something waits for the person here. */
  waiting?: number
}

const GROUPS: { label?: string; items: Item[] }[] = [
  {
    items: [
      {
        id: "studio",
        label: "Studio",
        icon: Message01Icon,
        line: "Morning, Christer. Two drafts wait for your yes.",
      },
    ],
  },
  {
    label: "Make",
    items: [
      {
        id: "riffs",
        label: "Riffs",
        icon: BulbIcon,
        line: "Twelve riffs are ready. I would start with the deploy one.",
        waiting: 12,
      },
      {
        id: "drafts",
        label: "Drafts",
        icon: QuillWrite01Icon,
        line: "Two drafts wait for you. Nothing goes out until you approve.",
        waiting: 2,
      },
      {
        id: "lineup",
        label: "Lineup",
        icon: Calendar03Icon,
        line: "Four of five slots are booked. Wednesday 09:00 is open.",
      },
      {
        id: "numbers",
        label: "Numbers",
        icon: ChartLineData01Icon,
        line: "Last week ran 1.4× your own median.",
      },
    ],
  },
  {
    label: "Setup",
    items: [
      {
        id: "brain",
        label: "Brain",
        icon: BrainIcon,
        line: "I took three rules from your edits this week.",
      },
      {
        id: "channels",
        label: "Channels",
        icon: Megaphone01Icon,
        line: "X and LinkedIn are connected.",
      },
      {
        id: "rhythm",
        label: "Rhythm",
        icon: RepeatIcon,
        line: "Three posts a week, mornings.",
      },
      {
        id: "sources",
        label: "Sources",
        icon: Plug01Icon,
        line: "Watching two repos and your call recorder.",
      },
    ],
  },
]

const ALL = GROUPS.flatMap((g) => g.items)

const SKELETON: Record<string, readonly (number | `${number}%`)[]> = {
  studio: ["86%", "64%", "78%", "40%"],
  riffs: ["72%", "88%", "60%", "80%"],
  drafts: ["90%", "70%", "84%"],
  lineup: ["66%", "80%", "58%", "74%"],
  numbers: ["50%", "82%", "68%"],
  brain: ["80%", "62%", "88%", "54%"],
  channels: ["58%", "76%"],
  rhythm: ["64%", "48%", "70%"],
  sources: ["74%", "60%", "82%"],
}

const css = `
.d36-shell {
  display: grid; grid-template-columns: ${u(156)} 1fr;
  /* The Window body pads; the shell owns its own edges. */
  margin: calc(-1 * var(--k2-pad));
  min-height: ${u(420)};
}
.d36-side {
  padding: ${u(12)} ${u(8)};
  border-right: 1px solid ${color.hairline};
  display: flex; flex-direction: column; gap: ${u(1)};
}
.d36-mark {
  display: flex; align-items: center; gap: ${u(8)};
  height: ${u(28)}; padding: 0 ${u(8)}; margin-bottom: ${u(6)};
  font-weight: ${type.strongWeight};
}
.d36-q {
  display: grid; place-items: center;
  width: ${u(18)}; height: ${u(18)}; border-radius: ${u(4)};
  background: ${color.ink}; color: ${color.surface};
  font-size: ${u(10.5)}; font-weight: 600; letter-spacing: 0;
}
.d36-label {
  padding: ${u(12)} ${u(8)} ${u(4)};
  font-size: ${u(11.5)}; color: ${color.faint}; font-weight: ${type.strongWeight};
}
.d36-row {
  position: relative;
  display: flex; align-items: center; gap: ${u(8)};
  width: 100%; height: ${u(28)}; padding: 0 ${u(8)};
  border: 0; border-radius: ${u(radius.chip)};
  background: transparent; color: ${color.muted};
  font-size: ${u(type.small.size)}; text-align: left;
  cursor: pointer;
  transition-property: background-color, color;
  transition-duration: ${motion.state}ms;
  transition-timing-function: ${motion.easeOut};
}
.d36-row[aria-current="page"] { background: ${color.hairline}; color: ${color.ink}; font-weight: ${type.strongWeight}; }
@media (hover: hover) {
  .d36-row:hover:not([aria-current="page"]) { color: ${color.ink}; }
}
@media (pointer: coarse) {
  .d36-row::after { content: ""; position: absolute; left: 0; right: 0; top: 50%; height: 44px; translate: 0 -50%; }
}
.d36-icon { width: ${u(15)}; height: ${u(15)}; flex: none; }
.d36-dot {
  margin-left: auto; width: ${u(6)}; height: ${u(6)}; border-radius: 50%;
  background: var(--k2-accent);
  transition-property: opacity, scale;
  transition-duration: ${motion.enter}ms;
  transition-timing-function: ${motion.easeOut};
}
.d36-dot[data-seen] { opacity: 0; scale: 0.4; }
.d36-history { padding: ${u(2)} ${u(8)}; height: ${u(26)}; display: flex; align-items: center; }

.d36-main { padding: ${u(18)} ${u(22)}; min-width: 0; }
.d36-page { display: flex; flex-direction: column; gap: ${u(4)}; max-width: ${u(300)}; }
.d36-body { margin-top: ${u(22)}; }
@media (prefers-reduced-motion: reduce) {
  .d36-row, .d36-dot { transition-duration: 0ms; }
  .d36-dot[data-seen] { scale: 1; }
}
`

export default function TheShell() {
  const [current, setCurrent] = React.useState("studio")
  const [seen, setSeen] = React.useState<Set<string>>(() => new Set())
  const page = ALL.find((i) => i.id === current) ?? ALL[0]

  const open = (id: string) => {
    setCurrent(id)
    setSeen((prev) => (prev.has(id) ? prev : new Set(prev).add(id)))
  }

  return (
    <Stage
      lead="Every page opens on what Quincy is doing."
      rest="A dot means something waits for you. Open the page and the dot goes."
      label="Quincy's app shell with its sidebar"
    >
      <style href="lab-r2-d36" precedence="default">
        {css}
      </style>
      <Window address={`hirequincy.com/${page.id}`} crop="corner">
        <div className="d36-shell">
          <nav className="d36-side" aria-label="Quincy">
            <div className="d36-mark">
              <span className="d36-q" aria-hidden>
                Q
              </span>
              Quincy
            </div>
            {GROUPS.map((g, gi) => (
              <React.Fragment key={g.label ?? gi}>
                {g.label ? <div className="d36-label">{g.label}</div> : null}
                {g.items.map((item) => {
                  const waiting = item.waiting !== undefined
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="d36-row"
                      aria-current={current === item.id ? "page" : undefined}
                      aria-label={
                        waiting && !seen.has(item.id)
                          ? `${item.label}, ${item.waiting} waiting`
                          : undefined
                      }
                      onClick={() => open(item.id)}
                    >
                      <HugeiconsIcon
                        icon={item.icon}
                        strokeWidth={1.8}
                        className="d36-icon"
                        aria-hidden
                      />
                      {item.label}
                      {waiting ? (
                        <span
                          className="d36-dot"
                          aria-hidden
                          data-seen={seen.has(item.id) || undefined}
                        />
                      ) : null}
                    </button>
                  )
                })}
              </React.Fragment>
            ))}
            <div className="d36-label">Conversations</div>
            <div className="d36-history">
              <Text size="small" tone="muted" as="span">
                The deploy call
              </Text>
            </div>
            <div className="d36-history">
              <Text size="small" tone="muted" as="span">
                Changelog page
              </Text>
            </div>
          </nav>

          <div className="d36-main" aria-live="polite">
            <div className="d36-page">
              <div style={{ display: "flex", alignItems: "baseline", gap: u(8) }}>
                <Text weight="strong" as="h2">
                  {page.label}
                </Text>
                {page.waiting !== undefined ? <Mono>{page.waiting}</Mono> : null}
              </div>
              <Text tone="muted">{page.line}</Text>
            </div>
            <div className="d36-body">
              <SkeletonLines widths={SKELETON[page.id] ?? ["70%"]} />
            </div>
          </div>
        </div>
      </Window>
    </Stage>
  )
}

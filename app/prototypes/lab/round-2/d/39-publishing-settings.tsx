"use client"

import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { MinusSignIcon, PlusSignIcon } from "@hugeicons/core-free-icons"

import {
  Card,
  Count,
  MarginNote,
  Mono,
  Rule,
  Skeleton,
  Stage,
  Text,
  u,
} from "../kit"
import { color, motion, radius, type } from "../tokens"

/**
 * 39 — Publishing, in Settings.
 *
 * A settings section in the editor's register. Each row is a label, one grey
 * line saying what it does in plain words, and the control. The number is
 * stated against your own median week, and the margin note answers the number
 * you set rather than repeating the label. Turning off "ask me first" is
 * allowed, but the line under it says exactly what you just agreed to.
 *
 * Local: a Switch and a Stepper. The kit has neither.
 */

const MIN = 1
const MAX = 7
const MEDIAN = 3

function noteFor(n: number) {
  if (n <= 2) return "fine. fewer, and better"
  if (n === 3) return "about what you have to say"
  if (n === 4) return "doable if you record twice"
  return "you'll run dry by thursday"
}

const css = `
.d39-row {
  display: grid; grid-template-columns: 1fr auto; align-items: start;
  column-gap: ${u(14)};
}
.d39-sub { grid-column: 1; margin-top: ${u(2)}; }

.d39-switch {
  position: relative; flex: none;
  width: ${u(30)}; height: ${u(18)}; margin-top: ${u(1)};
  padding: 0; border: 0; border-radius: 999px;
  background: ${color.skeleton};
  cursor: pointer;
  transition-property: background-color;
  transition-duration: ${motion.state}ms;
  transition-timing-function: ${motion.easeOut};
}
.d39-switch[data-checked] { background: var(--k2-accent); }
.d39-switch:focus-visible { outline-color: var(--k2-accent); }
.d39-thumb {
  position: absolute; top: ${u(2)}; left: ${u(2)};
  width: ${u(14)}; height: ${u(14)}; border-radius: 50%;
  background: ${color.surface};
  box-shadow: 0 1px 2px rgba(18, 18, 18, 0.2);
  transition-property: translate;
  transition-duration: ${motion.state}ms;
  transition-timing-function: ${motion.easeOut};
}
.d39-switch[data-checked] .d39-thumb { translate: ${u(12)} 0; }

.d39-stepper {
  display: inline-flex; align-items: center; gap: ${u(2)};
  height: ${u(28)}; padding: ${u(2)};
  border-radius: ${u(radius.control)};
  box-shadow: 0 0 0 1px ${color.hairline};
}
.d39-step {
  position: relative; display: grid; place-items: center;
  width: ${u(24)}; height: ${u(24)};
  padding: 0; border: 0; border-radius: ${u(radius.control - 2)};
  background: transparent; color: ${color.muted};
  cursor: pointer;
  transition-property: background-color, color, transform;
  transition-duration: ${motion.state}ms, ${motion.state}ms, ${motion.press}ms;
  transition-timing-function: ${motion.easeOut};
}
.d39-step:disabled { color: ${color.faint}; cursor: default; }
.d39-step:active:not(:disabled) { transform: scale(0.92); }
@media (hover: hover) {
  .d39-step:hover:not(:disabled) { background: ${color.well}; color: ${color.ink}; }
}
.d39-value {
  min-width: ${u(18)}; text-align: center;
  font-weight: ${type.strongWeight}; font-variant-numeric: tabular-nums;
}
.d39-icon { width: ${u(13)}; height: ${u(13)}; }

@media (pointer: coarse) {
  .d39-switch::after, .d39-step::after {
    content: ""; position: absolute; left: 50%; top: 50%;
    width: 44px; height: 44px; translate: -50% -50%;
  }
}
@media (prefers-reduced-motion: reduce) {
  .d39-switch, .d39-thumb, .d39-step { transition-duration: 0ms; }
  .d39-step:active:not(:disabled) { transform: none; }
}
`

function Switch({
  checked,
  onChange,
  labelledBy,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  labelledBy: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      data-checked={checked || undefined}
      data-unchecked={!checked || undefined}
      className="d39-switch"
      onClick={() => onChange(!checked)}
    >
      <span className="d39-thumb" aria-hidden />
    </button>
  )
}

export default function PublishingSettings() {
  const [ask, setAsk] = React.useState(true)
  const [perWeek, setPerWeek] = React.useState(MEDIAN)
  const ids = React.useId()

  return (
    <Stage
      lead="Settings, in plain words."
      rest="Each row says what it does to your week, and the number sits against your own median."
    >
      <style href="lab-r2-d39" precedence="default">
        {css}
      </style>
      <Card width={330}>
        <Text weight="strong" as="h2">
          Publishing
        </Text>
        <Text tone="muted">How posts leave Quincy, and how often.</Text>
        <Rule />

        <div className="d39-row">
          <Text weight="strong" as="span">
            <span id={`${ids}-ask`}>Ask me before anything goes out</span>
          </Text>
          <Switch checked={ask} onChange={setAsk} labelledBy={`${ids}-ask`} />
          <div className="d39-sub" aria-live="polite">
            <Text size="small" tone="muted">
              {ask
                ? "Every post waits for your Approve. Nothing goes out in your name without it."
                : "Drafts go out at their slot without asking. You can still pull one until then."}
            </Text>
          </div>
        </div>

        <Rule />

        <MarginNote note={noteFor(perWeek)}>
          <div className="d39-row">
            <Text weight="strong" as="span">
              <span id={`${ids}-week`}>Posts a week</span>
            </Text>
            <div className="d39-stepper" role="group" aria-labelledby={`${ids}-week`}>
              <button
                type="button"
                className="d39-step"
                aria-label="One fewer a week"
                disabled={perWeek <= MIN}
                onClick={() => setPerWeek((n) => Math.max(MIN, n - 1))}
              >
                <HugeiconsIcon icon={MinusSignIcon} strokeWidth={2} className="d39-icon" aria-hidden />
              </button>
              <span className="d39-value" aria-live="polite">
                <Count value={perWeek} />
              </span>
              <button
                type="button"
                className="d39-step"
                aria-label="One more a week"
                disabled={perWeek >= MAX}
                onClick={() => setPerWeek((n) => Math.min(MAX, n + 1))}
              >
                <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} className="d39-icon" aria-hidden />
              </button>
            </div>
            <div className="d39-sub">
              <Text size="small" tone="muted">
                Your median week is {MEDIAN}. Most weeks you have two or three things worth saying.
              </Text>
            </div>
          </div>
        </MarginNote>

        <Rule />

        <div className="d39-row">
          <Text weight="strong" as="span">
            Quiet hours
          </Text>
          <Mono>22:00 – 07:00</Mono>
          <div className="d39-sub">
            <Text size="small" tone="muted">
              Nothing is scheduled while you sleep.
            </Text>
          </div>
        </div>

        <Rule />

        <div className="d39-row">
          <Skeleton width={120} />
          <Skeleton width={30} />
        </div>
      </Card>
    </Stage>
  )
}

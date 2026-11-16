"use client"

import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { GitMergeIcon } from "@hugeicons/core-free-icons"

import {
  ActionButton,
  BeatBracket,
  Beats,
  Card,
  Mono,
  QuietButton,
  Rule,
  Stage,
  Text,
  u,
} from "../kit"
import { color, motion } from "../tokens"

/**
 * 33 — A merged pull request becomes a riff.
 *
 * The source sits at the top as what it is (a PR, its number, its diff),
 * and under it the riff Quincy found, already in the three beats with the
 * blue pen naming them. The number on its own line is the one the PR made.
 * "Draft it" is the only accent; it hands the riff to Studio and says,
 * once more, that nothing goes out from there without you.
 */

/** Pretend drafting time, so the pending label reads. */
const DRAFT_MS = 700

type Phase = "found" | "drafting" | "drafted" | "passed"

export default function ShippedWork() {
  const [phase, setPhase] = React.useState<Phase>("found")
  const timer = React.useRef<number | undefined>(undefined)
  React.useEffect(() => () => window.clearTimeout(timer.current), [])

  const draft = () => {
    setPhase("drafting")
    timer.current = window.setTimeout(() => setPhase("drafted"), DRAFT_MS)
  }

  const settled = phase === "drafted" || phase === "passed"

  return (
    <Stage
      lead="You merged it. That was the hard part."
      rest="Quincy reads what you shipped and finds the post in it."
    >
      <Card width={330}>
        <div style={{ display: "flex", alignItems: "center", gap: u(8) }}>
          <HugeiconsIcon
            icon={GitMergeIcon}
            strokeWidth={2}
            aria-hidden
            style={{ width: u(15), height: u(15), color: color.muted, flex: "none" }}
          />
          <Text size="small" weight="strong" as="span">
            Move the build cache to its own disk
          </Text>
        </div>
        <div style={{ display: "flex", gap: u(10), marginTop: u(3), paddingLeft: u(23) }}>
          <Mono>#412</Mono>
          <Mono tone="faint">merged 14:02 · +38 −112 · 4 files</Mono>
        </div>

        <Rule />

        <div className="c33-riff" data-passed={phase === "passed" || undefined}>
          <Beats>
            <div style={{ display: "flex", flexDirection: "column", gap: u(10) }}>
              <BeatBracket beat="did">
                <Text>I moved our build cache onto its own disk.</Text>
              </BeatBracket>
              <BeatBracket beat="happened">
                <Text>Deploys went from</Text>
                <Text size="figure">11 min → 2:40</Text>
              </BeatBracket>
              <BeatBracket beat="meant">
                <Text>
                  Nobody asked for it. It is the first thing the team noticed.
                </Text>
              </BeatBracket>
            </div>
          </Beats>
        </div>

        <div style={{ position: "relative", height: u(34), marginTop: u(18) }}>
          <div className="c33-layer" data-on={!settled || undefined} inert={settled}>
            <ActionButton
              onClick={draft}
              pending={phase === "drafting"}
              pendingLabel="Drafting"
            >
              Draft it
            </ActionButton>
            <QuietButton onClick={() => setPhase("passed")}>Not this one</QuietButton>
          </div>
          <div
            className="c33-layer"
            data-on={settled || undefined}
            inert={!settled}
            aria-live="polite"
            style={{ justifyContent: "space-between" }}
          >
            <Text tone="muted" size="small" as="span">
              {phase === "passed"
                ? "Kept with the PR. It will not come back."
                : phase === "drafted"
                  ? "In Studio for X. Nothing goes out until you approve."
                  : ""}
            </Text>
            <QuietButton onClick={() => setPhase("found")}>Undo</QuietButton>
          </div>
        </div>
      </Card>
      <style>{css}</style>
    </Stage>
  )
}

const css = `
.c33-riff, .c33-layer {
  transition-property: opacity;
  transition-duration: ${motion.state}ms;
  transition-timing-function: ${motion.easeOut};
}
.c33-riff[data-passed] { opacity: 0.4; }
.c33-layer {
  position: absolute; inset: 0;
  display: flex; align-items: center; gap: ${u(6)};
  opacity: 0;
}
.c33-layer[data-on] { opacity: 1; }
@media (prefers-reduced-motion: reduce) { .c33-riff, .c33-layer { transition-duration: 0ms; } }
`

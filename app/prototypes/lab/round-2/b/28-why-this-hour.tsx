"use client"

import * as React from "react"

import {
  Card,
  Count,
  Highlight,
  MarginNote,
  Mono,
  Rule,
  SkeletonLines,
  Stage,
  Text,
  u,
} from "../kit"
import { Segmented } from "./local"

/**
 * 28 — Why this hour. One slot opened up: the draft it holds, the hour, and
 * the reason for the hour, read off your own last posts at that time. Pick
 * another hour and the number counts to what you actually get there, and
 * Quincy's note in the margin changes its mind with it.
 */

type Hour = "07:45" | "12:30" | "17:00"

const WEEK_MEDIAN = 1210

const HOURS: Record<Hour, { posts: number; median: number; say: string; note: string }> = {
  "07:45": {
    posts: 9,
    median: 1700,
    say: "That is 1.4× your usual week.",
    note: "read before standup. your best hour",
  },
  "12:30": {
    posts: 6,
    median: 1260,
    say: "About what you usually get.",
    note: "fine. the lunch scroll is crowded",
  },
  "17:00": {
    posts: 4,
    median: 710,
    say: "A little over half your usual.",
    note: "they've gone home. I wouldn't",
  },
}

const OPTIONS = (Object.keys(HOURS) as Hour[]).map((h) => ({ value: h, label: h }))

export default function WhyThisHour() {
  const [hour, setHour] = React.useState<Hour>("07:45")
  const h = HOURS[hour]

  return (
    <Stage
      accent="green"
      lead="Every slot says why it is there."
      rest="The hour comes from your own posts, not a best-time chart."
    >
      <Card width={322}>
        <div style={{ display: "flex", alignItems: "baseline", gap: u(8) }}>
          <Text as="span" weight="strong">
            Thursday
          </Text>
          <Mono>Nov 19 · LinkedIn</Mono>
        </div>

        <div style={{ marginTop: u(12), display: "flex", flexDirection: "column", gap: u(10) }}>
          <Text>The call that changed our pricing page.</Text>
          <SkeletonLines widths={["92%", "74%", "84%"]} />
        </div>

        <Rule />

        <div style={{ display: "flex", alignItems: "center", gap: u(10) }}>
          <Text as="span" tone="muted">
            Goes out at
          </Text>
          <Segmented label="Hour" options={OPTIONS} value={hour} onChange={setHour} />
        </div>

        <div style={{ marginTop: u(14), display: "flex", flexDirection: "column", gap: u(4) }}>
          <Text tone="muted">
            Your last {h.posts} LinkedIn posts at {hour}:
          </Text>
          <MarginNote note={h.note}>
            <Text size="figure">
              <Count value={h.median} /> views
            </Text>
          </MarginNote>
          <div aria-live="polite">
          <Text>
            <Highlight>{h.say}</Highlight>{" "}
            <span style={{ whiteSpace: "nowrap" }}>
              <Mono>{WEEK_MEDIAN.toLocaleString("en-US")}</Mono>
              <Text as="span" tone="muted">
                {" "}
                is your median.
              </Text>
            </span>
          </Text>
          </div>
        </div>
      </Card>
    </Stage>
  )
}

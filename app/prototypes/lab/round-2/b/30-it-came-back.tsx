"use client"

import * as React from "react"

import {
  Avatar,
  BeatBracket,
  Beats,
  Card,
  Count,
  Highlight,
  Mono,
  Stage,
  Text,
  u,
} from "../kit"
import { Segmented } from "./local"

/**
 * 30 — It came back. A published post returns as three beats instead of a
 * chart: what I did, what happened (the number on its own line, against my
 * own median at the same age), what it meant. Switch how long it has been out
 * and the number counts to that window's figure; the median moves with it,
 * because a post at six hours is compared to your posts at six hours.
 */

type Age = "6h" | "48h" | "7d"

const READS: Record<
  Age,
  { label: string; views: number; median: number; replies: string; fresh: string }
> = {
  "6h": {
    label: "six hours",
    views: 1140,
    median: 610,
    replies: "Two people replied.",
    fresh: "Both of them reply to everything I post.",
  },
  "48h": {
    label: "48 hours",
    views: 3940,
    median: 1210,
    replies: "Six people replied.",
    fresh: "Two of them had never written to me before.",
  },
  "7d": {
    label: "a week",
    views: 5320,
    median: 1580,
    replies: "Nine people replied.",
    fresh: "Three of them had never written to me before.",
  },
}

const OPTIONS = [
  { value: "6h", label: "6 h" },
  { value: "48h", label: "48 h" },
  { value: "7d", label: "7 d" },
] as const satisfies readonly { value: Age; label: string }[]

export default function ItCameBack() {
  const [win, setWin] = React.useState<Age>("48h")
  const r = READS[win]
  const ratio = r.views / r.median

  return (
    <Stage
      lead="Every post comes back as a story."
      rest="What I did, what happened, what it meant. Against my own median, never followers."
    >
      <Card width={322}>
        <div style={{ display: "flex", alignItems: "center", gap: u(8) }}>
          <Avatar initials="C" />
          <Text as="span" weight="strong">
            Published
          </Text>
          <Mono>X · Tue 08:10</Mono>
        </div>

        <div style={{ marginTop: u(12), marginBottom: u(14) }}>
          <Segmented label="Since it went out" options={OPTIONS} value={win} onChange={setWin} />
        </div>

        <Beats>
          <div style={{ display: "flex", flexDirection: "column", gap: u(12) }}>
            <BeatBracket beat="did">
              <Text>I gave our changelog its own page and posted it on Tuesday at 08:10.</Text>
            </BeatBracket>
            <BeatBracket beat="happened">
              <Text>In {r.label} it reached</Text>
              <Text size="figure">
                <Count value={r.views} /> views
              </Text>
              <Text tone="muted">
                <Count value={ratio} format={(n) => `${n.toFixed(1)}×`} /> my median at {r.label}.
              </Text>
            </BeatBracket>
            <BeatBracket beat="meant">
              <Text>
                {r.replies} <Highlight>{r.fresh}</Highlight>
              </Text>
            </BeatBracket>
          </div>
        </Beats>
      </Card>
    </Stage>
  )
}

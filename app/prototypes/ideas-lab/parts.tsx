"use client"

import * as React from "react"
import { Mic01Icon } from "@hugeicons/core-free-icons"

import { CHANNELS_FOR_SHAPE, type Angle, type Riff } from "@/lib/riffs"
import { Button, ButtonLink, Card, Count, EmptyState, Text } from "@/components/kit"
import { Friend } from "@/components/mascot"

import { totalWaiting } from "./queue"

/**
 * Pieces every direction shares, so a difference between two directions is
 * the direction and not a copy that drifted.
 */

/** What each direction's sliders and switches hold. One object, so it copies as one line. */
export type Controls = {
  frame: number
  queue: number
  /* Beside */
  listRem: number
  splitRem: number
  rowCap: number
  titleLines: "1" | "2"
  /* One at a time */
  measureRem: number
  peek: number
  material: "sentence" | "whole" | "none"
  /* From the source */
  sourceRem: number
  perSource: number
  why: "picked" | "always"
  /* Marked up */
  marginRem: number
  scrapRem: number
  others: "underlined" | "unmarked"
}

export const DEFAULTS: Controls = {
  frame: 1440,
  queue: 11,
  listRem: 24,
  splitRem: 66,
  rowCap: 6,
  titleLines: "2",
  measureRem: 38,
  peek: 2,
  material: "sentence",
  sourceRem: 41,
  perSource: 3,
  why: "picked",
  marginRem: 15,
  scrapRem: 34,
  others: "underlined",
}

/** "X and LinkedIn". */
export function destinations(angle: Angle): string {
  const labels = (CHANNELS_FOR_SHAPE[angle.shape] ?? []).map((c) => c.label)
  if (labels.length <= 1) return labels.join("")
  return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`
}

/** The page summary, against nothing but what is waiting (the shipped sentence). */
export function summaryFor(riffs: Riff[]): React.ReactNode {
  if (riffs.length === 0) return undefined
  const waiting = totalWaiting(riffs)
  if (waiting === 0) return "Nothing is waiting on you."
  return (
    <>
      <Count value={waiting} /> {waiting === 1 ? "idea" : "ideas"} waiting on you.
    </>
  )
}

/**
 * The recorder and the paste box stand in for RecordBox and AdaptBox, which
 * open the microphone and call server actions. Pressing either says so
 * instead of doing nothing.
 */
export function Capture({ isAction, compact = false }: { isAction: boolean; compact?: boolean }) {
  const [said, setSaid] = React.useState(false)
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-kit-controls">
        <Button variant={isAction ? "action" : "quiet"} icon={Mic01Icon} onClick={() => setSaid(true)}>
          Record a thought
        </Button>
        <Button onClick={() => setSaid(true)}>Paste a post</Button>
      </div>
      {!compact || said ? (
        <div className="mt-kit-related">
          <Text variant="small" tone="muted" role={said ? "status" : undefined}>
            {said
              ? "The lab does not open the recorder. On /ideas this is RecordBox and AdaptBox, unchanged."
              : "You hear the take back before anything is sent. Or paste a post you saw, and I find what you could take from it."}
          </Text>
        </div>
      ) : null}
    </Card>
  )
}

export function NothingYet() {
  return (
    <EmptyState
      media={<Friend size={40} state="idle" className="text-kit-ink" />}
      bold="Nothing to work on yet."
      rest="Say a half-thought above, or add a source and I'll bring you the material: your merges, your meetings, the posts you save."
    >
      <ButtonLink href="#" onClick={(e) => e.preventDefault()}>
        Add a source
      </ButtonLink>
    </EmptyState>
  )
}

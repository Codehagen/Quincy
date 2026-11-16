"use client"

import * as React from "react"

import { Bracket, Hand, MARGIN_SLOT } from "./bracket"

/** A draft's three beats. There is no fourth. */
export type Beat = "did" | "happened" | "meant"

const LABEL: Record<Beat, string> = {
  did: "what I did",
  happened: "what happened",
  meant: "what it meant",
}

const BeatFocus = React.createContext<{
  active: Beat | null
  set: (b: Beat | null) => void
} | null>(null)

/**
 * Optional wrapper around a draft's three BeatBrackets. Pointing at one beat
 * with a mouse quiets the other two. Hover enhances and never hides: all
 * three read at rest, and touch and keyboard see them all, always.
 */
export function Beats({ children }: { children: React.ReactNode }) {
  const [active, set] = React.useState<Beat | null>(null)
  const value = React.useMemo(() => ({ active, set }), [active])
  return (
    <BeatFocus value={value}>
      <div onPointerLeave={() => set(null)}>{children}</div>
    </BeatFocus>
  )
}

/**
 * The blue-pen bracket naming one beat: what I did / what happened / what it
 * meant. One beat per bracket. Needs the margin column, like MarginNote.
 */
export function BeatBracket({
  beat,
  children,
}: {
  beat: Beat
  children: React.ReactNode
}) {
  const focus = React.useContext(BeatFocus)
  const dim = focus?.active != null && focus.active !== beat
  return (
    <div
      data-dim={dim || undefined}
      className="group/beat relative"
      onPointerEnter={(e) => {
        if (focus && e.pointerType === "mouse") focus.set(beat)
      }}
    >
      <div className="transition-[opacity] duration-(--kit-duration-state) ease-kit-out group-data-dim/beat:opacity-26 motion-reduce:transition-none">
        {children}
      </div>
      <span
        className={`${MARGIN_SLOT} transition-[opacity] duration-(--kit-duration-state) ease-kit-out group-data-dim/beat:opacity-30 motion-reduce:transition-none`}
      >
        <Bracket tone="pen" />
        <Hand tone="pen">{LABEL[beat]}</Hand>
      </span>
    </div>
  )
}

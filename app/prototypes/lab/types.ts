import type { ComponentType } from "react"

/**
 * One visual in the lab.
 *
 * `n` is the number the person says out loud ("keep 04 and 17"), so it never
 * changes once a piece is published, and a discarded number is never reused.
 */
export type Piece = {
  n: number
  title: string
  /** What it took from the references, and where it pushed. One sentence. */
  take: string
  /** Rendered inside a fixed 4:3 frame. Owns everything inside it. */
  Component: ComponentType
}

export type Round = {
  id: string
  title: string
  /** The brief this round answered, so a later round can say what changed. */
  note: string
  pieces: Piece[]
}

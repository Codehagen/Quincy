"use client"

/*
 * After Stageshow (MIT, Copyright (c) 2026 Benji Taylor):
 * examples/static-card and examples/opposite-corners, framing.md
 * ("Pinned, bottom bleed"). See components/showcase/NOTICE.md.
 *
 * A feature card is one tile on its own: the claim as page type above, the
 * product pinned to the bottom edge and cropped by it. The copy is never
 * inside the Stage, so it stays page text at page size.
 */

import type { ReactNode } from "react"

import { Tile } from "./bento"
import "./bento.css"

export function FeatureCard({
  lead,
  rest,
  height = 420,
  children,
}: {
  /** The claim, one sentence. */
  lead: string
  rest?: string
  /** The card's height in px; the picture takes what the copy leaves. */
  height?: number
  /** The picture: a Stage, sized to the card's width. */
  children: ReactNode
}) {
  return (
    <div className="qs-bento qs-feature" style={{ height }}>
      <div className="qs-bento__grid" style={{ height: "100%" }}>
        <Tile area="auto" lead={lead} rest={rest} picture={children} />
      </div>
    </div>
  )
}

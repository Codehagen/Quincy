"use client"

/*
 * Ported from Stageshow (MIT, Copyright (c) 2026 Benji Taylor):
 * examples/bento/index.tsx (Tile, usePictureWidth) and references/bento.md.
 * See components/showcase/NOTICE.md. Restyled with the --kit-* tokens.
 *
 * A bento grid is one picture made of tiles. The grid and its copy are page
 * HTML; each picture is its own Stage at 1:1, pinned to its tile's bottom
 * and cropped by the tile (bento.md rule 12). Never one Stage around the
 * whole grid: it would scale every tile's type down with the grid.
 */

import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react"

import "./bento.css"

/** The grid. Its areas and rows are the demo's: pass a class that sets them. */
export function Bento({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <div className={`qs-bento${className ? ` ${className}` : ""}`}>
      <div className="qs-bento__grid">{children}</div>
    </div>
  )
}

/**
 * One tile: run-in copy at the top (a bold lead, a grey continuation, at page
 * size), then the picture pinned to the bottom edge. A tile with no picture
 * is a type tile (a stat or a statement): pass the type as children.
 */
export function Tile({
  area,
  lead,
  rest,
  picture,
  pictureFit = "edge",
  children,
}: {
  /** The grid-area name the demo's grid template uses. */
  area: string
  lead?: string
  rest?: string
  picture?: ReactNode
  /**
   * `edge`: the picture slot spans the tile, so a measured Stage reaches the
   * edge where the crop belongs. `center`: a fixed design canvas, centered,
   * wider than the tile so its sides crop only empty ground.
   */
  pictureFit?: "edge" | "center"
  children?: ReactNode
}) {
  return (
    <section className="qs-tile" style={{ gridArea: area } as CSSProperties}>
      {lead ? (
        <div className="qs-tile__copy">
          <b>{lead}</b>
          {rest ? ` ${rest}` : null}
        </div>
      ) : null}
      {children}
      {picture ? (
        <div className="qs-tile__picture" data-fit={pictureFit}>
          {picture}
        </div>
      ) : null}
    </section>
  )
}

/**
 * The tile owns the crop. Match the picture slot's current width so an inner
 * Stage never slices a window short of the tile edge (bento.md rule 8).
 */
export function usePictureWidth(fallback = 340) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(fallback)
  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    const measure = () =>
      setWidth(Math.max(1, Math.round(node.getBoundingClientRect().width)))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

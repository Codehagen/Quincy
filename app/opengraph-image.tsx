import { ImageResponse } from "next/og"

import { GRID, HEX, MARK } from "@/components/mascot/engine"

/**
 * The card every shared Quincy link unfurls into: the friend, the
 * homepage's h1, the address. Generated rather than committed, so it moves
 * with the headline.
 *
 * **The colours are hex here on purpose, and this is the only page-level file
 * where that is allowed.** Satori never sees `app/globals.css` and does not
 * parse `oklch()`. The friend's colours come from HEX in
 * components/mascot/engine.ts (the sRGB values of the kit primitives); MUTED
 * is `--kit-gray-530` converted. If a primitive moves, it moves here too.
 *
 * The friend is the 16×16 MARK bitmap drawn as one div per pixel: Satori
 * renders flex boxes, and a square box per cell keeps every pixel crisp. The
 * eyes are empty cells, so they show the ground, as in every other drawing.
 *
 * One weight: `@vercel/og` bundles Geist Regular and Satori does not
 * synthesise a bold. The card is type and space, which is what the page is.
 */

export const alt = "Quincy. It finds the post. It brings it to you."

export const size = { width: 1200, height: 630 }

export const contentType = "image/png"

const MUTED = "#6C6C6A" // --kit-gray-530, oklch(0.53 0.0013 106)

/** Device pixels per grid pixel: a 96px friend. */
const CELL = 6

const FILL: Record<string, string | undefined> = { "#": HEX.ink, y: HEX.sash, k: HEX.ink }

function Friend() {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: GRID * CELL, height: GRID * CELL }}>
      {MARK.map((row, y) => (
        <div key={y} style={{ display: "flex", height: CELL }}>
          {[...row].map((c, x) => (
            <div key={x} style={{ width: CELL, height: CELL, background: FILL[c] ?? "transparent" }} />
          ))}
        </div>
      ))}
    </div>
  )
}

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: HEX.paper,
        padding: 80,
      }}
    >
      <Friend />

      {/* Two explicit lines, so the break is ours and the card can never
          strand a word: the page's pair of claims, one per line. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          fontSize: 84,
          lineHeight: 1.04,
          letterSpacing: "-0.04em",
          color: HEX.ink,
        }}
      >
        <div style={{ display: "flex" }}>It finds the post.</div>
        <div style={{ display: "flex" }}>It brings it to you.</div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 28, color: MUTED }}>
        <div style={{ display: "flex", color: HEX.ink }}>Quincy</div>
        <div style={{ display: "flex" }}>hirequincy.com</div>
      </div>
    </div>,
    size
  )
}

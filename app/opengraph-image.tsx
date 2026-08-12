import { ImageResponse } from "next/og"

/**
 * The card every shared Quincy link unfurls into.
 *
 * Generated rather than committed as a JPG, because the positioning line will
 * change and a committed image will not change with it.
 *
 * **The colours are hardcoded here on purpose, and this is the only file in the
 * repo where that is allowed.** This route renders through satori, which never
 * sees `app/globals.css` and does not parse `oklch()`. The values below are the
 * sRGB conversions of the ramp steps named in each comment — if a step moves in
 * `@theme`, it moves here too, in the same commit.
 *
 * One weight, because `@vercel/og` bundles Geist Regular as its default font
 * and satori does not synthesise a bold. That constraint is doing the design a
 * favour: the card is type and space, which is what the landing page is.
 */

export const alt = "Quincy — it writes like you, and never speaks for you"

export const size = { width: 1200, height: 630 }

export const contentType = "image/png"

const SAND_50 = "#f7f5f2" // oklch(0.97 0.004 70)
const SAND_200 = "#d8cfc6" // oklch(0.86 0.016 70)
const SAND_700 = "#5e5a55" // oklch(0.47 0.009 70)
const SAND_950 = "#211d1a" // oklch(0.235 0.008 70)
const BRASS_400 = "#cf8f3d" // oklch(0.70 0.124 70)

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: SAND_50,
        padding: 80,
      }}
    >
      {/* The wordmark, at the same proportions as the site header: a filled
            square carrying the Q, then the name. */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 44,
            height: 44,
            borderRadius: 10,
            background: SAND_950,
            color: SAND_50,
            fontSize: 26,
          }}
        >
          Q
        </div>
        <div style={{ fontSize: 30, color: SAND_950 }}>Quincy</div>
      </div>

      {/* One claim. A card read at thumbnail size in a feed has room for a
            sentence, and a second sentence is what makes the first unreadable.
            The same sentence the landing page leads with, so a visitor who
            clicks does not arrive at different words.

            Two explicit lines rather than one string left to wrap: the break is
            then ours, and the card can never re-wrap into a stranded word — the
            `text-balance` problem, in a surface that has no CSS to fix it with.

            Known and unresolved: the word gaps on line two look wider than on
            line one. Still present with the lines explicit and
            `alignItems: "flex-start"`, so it is not satori justifying a wrapped
            line to a container width — that was the first guess and it was
            wrong. The cause has not been established; the next thing to try is
            the tracking, since negative letter-spacing tightens glyphs without
            touching the space advance. Left as is: it is legible, and a card is
            read at thumbnail size. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          fontSize: 76,
          lineHeight: 1.12,
          // Matches --text-display--letter-spacing in globals.css.
          letterSpacing: "-0.015em",
          color: SAND_950,
        }}
      >
        <div style={{ display: "flex" }}>It writes like you.</div>
        <div style={{ display: "flex" }}>It never speaks for you.</div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 20,
          fontSize: 26,
          color: SAND_700,
        }}
      >
        {/* The one brass mark on the card. Brass means live, and this is the
              only thing on the surface that gets a fill. */}
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: 5,
            background: BRASS_400,
          }}
        />
        <div style={{ display: "flex" }}>hirequincy.com</div>
        <div style={{ display: "flex", color: SAND_200 }}>/</div>
        <div style={{ display: "flex" }}>You approve. It ships.</div>
      </div>
    </div>,
    size
  )
}

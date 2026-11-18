import { decode } from "jpeg-js"
import { describe, expect, it } from "vitest"

import {
  cardLines,
  CARD_HEIGHT,
  CARD_WIDTH,
  renderCaptionCard,
} from "./instagram-card"
import { GLYPH_HEIGHT, hasGlyph } from "./instagram-font"

const BEATS = [
  "I shipped the connect flow.",
  "The first post waited for approve.",
  "12",
  "A draft is not a post until you say so.",
].join("\n\n")

describe("card lines", () => {
  it("keeps the three beats and the number on its own line", () => {
    const lines = cardLines(BEATS)
    expect(lines.filter((line) => line === "12")).toEqual(["12"])
    expect(lines.some((line) => line.includes("shipped"))).toBe(true)
    expect(lines.some((line) => line === "")).toBe(true)
  })

  it("leaves a hashtag block off the picture", () => {
    const lines = cardLines("I shipped it.\n\n#buildinpublic #quincy")
    expect(lines.join(" ")).not.toContain("#buildinpublic")
    expect(lines.join(" ")).toContain("shipped")
  })

  it("draws a hashtag-only caption rather than an empty card", () => {
    expect(cardLines("#only").join("")).toContain("#only")
  })
})

describe("the JPEG", () => {
  it("is a 4:5 baseline JPEG under the size ceiling, with ink on it", () => {
    const jpeg = renderCaptionCard(BEATS)
    expect(jpeg[0]).toBe(0xff)
    expect(jpeg[1]).toBe(0xd8)
    expect(jpeg.byteLength).toBeLessThan(8_000_000)

    const image = decode(jpeg, { useTArray: true, formatAsRGBA: true })
    expect(image.width).toBe(CARD_WIDTH)
    expect(image.height).toBe(CARD_HEIGHT)
    expect(CARD_WIDTH / CARD_HEIGHT).toBeCloseTo(0.8, 5)

    let ink = 0
    for (let i = 0; i < image.data.length; i += 4) {
      if (image.data[i]! < 200) ink++
    }
    expect(ink).toBeGreaterThan(GLYPH_HEIGHT)
  })

  it("draws a different picture for a different caption", () => {
    const a = renderCaptionCard("Alpha")
    const b = renderCaptionCard("Beta")
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false)
  })
})

describe("the face", () => {
  it("has a glyph for the letters and digits a caption is made of", () => {
    for (const ch of "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789") {
      expect(hasGlyph(ch)).toBe(true)
    }
  })
})

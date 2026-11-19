import { describe, expect, it } from "vitest"

import { captionStyleFor, describeCutStyle, validCutStyle } from "./cut-style"

describe("validCutStyle", () => {
  it("keeps a sensible style", () => {
    const style = validCutStyle({
      captions: {
        wordsPerSegment: 4,
        textTransform: "uppercase",
        background: true,
      },
      looks: [{ type: "contrast", amount: 1.1 }],
      pauses: { minSilenceMs: 400, paddingMs: 100 },
      voice: "clean",
    })
    expect(style).not.toBeNull()
    expect(describeCutStyle(style!)).toHaveLength(4)
    expect(captionStyleFor(style).textTransform).toBe("uppercase")
  })

  it("refuses what would make a cut no one asked for", () => {
    expect(
      validCutStyle({ pauses: { minSilenceMs: 50, paddingMs: 0 } })
    ).toBeNull()
    expect(validCutStyle({ looks: [{ type: "zoom", amount: 2 }] })).toBeNull()
    expect(
      validCutStyle({
        captions: {
          wordsPerSegment: 0,
          textTransform: "none",
          background: false,
        },
      })
    ).toBeNull()
    expect(validCutStyle("bold")).toBeNull()
  })
})

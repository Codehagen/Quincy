import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { modeFor } from "./lineup-layout"

/**
 * The layout is drawn by lineup.css and read back by script. This holds the
 * container queries there to `modeFor`, the rule they stand for.
 */
describe("the lineup layout in CSS", () => {
  const css = readFileSync(fileURLToPath(new URL("./lineup.css", import.meta.url)), "utf8")

  it("switches where modeFor does", () => {
    expect(modeFor(859, false)).toBe("feed")
    expect(modeFor(860, false)).toBe("day")
    expect(modeFor(1019, false)).toBe("day")
    expect(modeFor(1020, false)).toBe("week")
    expect(modeFor(1600, true)).toBe("feed")
  })

  it("says the same widths in lineup.css", () => {
    expect(css).toContain("@container kit-workspace (width >= 860px)")
    expect(css).toContain("@container kit-workspace (width >= 1020px)")
    expect(css).toContain("@container kit-workspace (width >= 1200px)")
    expect(css).toContain("@media (pointer: coarse)")
  })
})

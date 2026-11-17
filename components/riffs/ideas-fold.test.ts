import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { FOLD_CSS, shouldFold } from "./ideas-fold"

/**
 * The fold is drawn by ideas.css and read back by script. This holds the
 * container queries there to `shouldFold`, the rule they stand for,
 * including the narrow window where the Source column folds it again.
 */
describe("the ideas fold in CSS", () => {
  const { unfoldAt, refoldFrom, refoldTo } = FOLD_CSS
  const css = readFileSync(fileURLToPath(new URL("./ideas.css", import.meta.url)), "utf8")

  it("switches where shouldFold does", () => {
    for (let w = 320; w < 2400; w++) {
      const folded = w < unfoldAt || (w >= refoldFrom && w < refoldTo)
      expect(shouldFold(w), `at ${w}px`).toBe(folded)
    }
  })

  it("says the same widths in ideas.css", () => {
    expect(css).toContain(`(width >= ${unfoldAt}px)`)
    expect(css).toContain(`(${refoldFrom}px <= width < ${refoldTo}px)`)
  })
})

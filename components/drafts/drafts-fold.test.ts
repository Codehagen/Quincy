import { describe, expect, it } from "vitest"

import { FOLD_AT, FOLD_PROBE, FOLDED, UNFOLDED, shouldFold } from "./drafts-fold"

/**
 * The fold is drawn by CSS (a container query in literal class names, so
 * Tailwind sees them) and read back by script. This holds the number in the
 * classes to `shouldFold`, the rule it stands for.
 */
describe("the drafts fold in CSS", () => {
  it("switches where shouldFold does", () => {
    expect(shouldFold(FOLD_AT - 1)).toBe(true)
    expect(shouldFold(FOLD_AT)).toBe(false)
    for (let w = 320; w < 2400; w++) expect(shouldFold(w)).toBe(w < FOLD_AT)
  })

  it("names the same width in every class", () => {
    for (const c of [FOLDED, UNFOLDED, FOLD_PROBE]) expect(c).toContain(`@[${FOLD_AT}px]/kit-workspace:`)
  })
})

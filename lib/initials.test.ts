import { describe, expect, it } from "vitest"

import { initialsOf } from "./initials"

describe("initialsOf", () => {
  it("takes the first two words of the name", () => {
    expect(initialsOf({ name: "Christer Hagen", email: "c@x.no" })).toBe("CH")
  })
  it("falls back to the address when there is no name", () => {
    expect(initialsOf({ name: "  ", email: "ada@example.com" })).toBe("AE")
  })
})

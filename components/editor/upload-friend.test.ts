import { describe, expect, it } from "vitest"

import { friendForPhase } from "./upload-friend"

describe("friendForPhase", () => {
  it("reads while the file is read, sent and prepared", () => {
    for (const phase of ["hashing", "requesting", "uploading", "processing"] as const) {
      expect(friendForPhase(phase)).toBe("reading")
    }
  })

  it("has found something once the editor opens", () => {
    expect(friendForPhase("opening")).toBe("found")
    expect(friendForPhase("done")).toBe("found")
  })
})

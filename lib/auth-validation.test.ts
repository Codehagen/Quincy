import { describe, expect, it } from "vitest"

import { safeNextPath } from "./auth-validation"

/**
 * The open-redirect guard on /login's `?next=`. Every hostile case below
 * defeats `value.startsWith("/")`, the guard this function used to be.
 */
describe("safeNextPath", () => {
  it("keeps a same-origin path with its query and hash", () => {
    expect(safeNextPath("/drafts")).toBe("/drafts")
    expect(safeNextPath("/c/abc?x=1#end")).toBe("/c/abc?x=1#end")
    expect(safeNextPath("/settings?tab=voice%20notes")).toBe("/settings?tab=voice%20notes")
  })

  it("falls back to Studio when there is nothing", () => {
    expect(safeNextPath(undefined)).toBe("/studio")
    expect(safeNextPath("")).toBe("/studio")
  })

  it("refuses absolute and scheme URLs", () => {
    expect(safeNextPath("https://evil.example")).toBe("/studio")
    expect(safeNextPath("javascript:alert(1)")).toBe("/studio")
    expect(safeNextPath("evil.example")).toBe("/studio")
  })

  it("refuses protocol-relative URLs in every spelling a browser accepts", () => {
    expect(safeNextPath("//evil.example")).toBe("/studio")
    expect(safeNextPath("/\\evil.example")).toBe("/studio")
    expect(safeNextPath("/\\/evil.example")).toBe("/studio")
    expect(safeNextPath("/\t/evil.example")).toBe("/studio")
    expect(safeNextPath("/\n/evil.example")).toBe("/studio")
  })

  it("normalises dot segments instead of passing them through", () => {
    expect(safeNextPath("/a/../drafts")).toBe("/drafts")
  })
})

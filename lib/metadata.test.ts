import { describe, expect, it } from "vitest"

import { constructMetadata } from "./metadata"

/**
 * Page titles are always `${title} · Quincy`, never an em dash: a page title
 * is visible copy, and visible copy carries no em dashes
 * (docs/design/README.md, "Copy").
 */
describe("constructMetadata titles", () => {
  const meta = constructMetadata({ title: "X" })
  const titles = [meta.title, meta.openGraph?.title, meta.twitter?.title]

  it("ends every title in ' · Quincy'", () => {
    for (const title of titles) {
      expect(typeof title).toBe("string")
      expect(title as string).toMatch(/ · Quincy$/)
    }
    expect(meta.title).toBe("X · Quincy")
  })

  it("never puts an em dash in a title", () => {
    for (const title of titles) expect(title as string).not.toContain(" — ")
    expect(constructMetadata().title as string).not.toContain("—")
  })
})

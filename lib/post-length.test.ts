import { describe, expect, it } from "vitest"

import {
  containsUrl,
  countGraphemes,
  measurePost,
  splitAtFold,
} from "./post-length"

describe("containsUrl", () => {
  it("finds an ordinary link", () => {
    expect(containsUrl("les mer på https://hirequincy.com")).toBe(true)
  })

  it("finds a www link with no scheme", () => {
    expect(containsUrl("les mer på www.hirequincy.com")).toBe(true)
  })

  it("says no when there is no link", () => {
    expect(containsUrl("ingen lenke her")).toBe(false)
  })

  it("answers the same on a repeated call", () => {
    // The regex is global, so it carries lastIndex between calls. Without a
    // reset the second call resumes mid-string and answers false — which on
    // this path would bill an X post at $0.015 instead of $0.200.
    const text = "https://hirequincy.com"
    expect(containsUrl(text)).toBe(true)
    expect(containsUrl(text)).toBe(true)
  })
})

describe("countGraphemes", () => {
  it("counts plain text the same as String.length", () => {
    expect(countGraphemes("hei")).toBe(3)
  })

  it("counts a regional-indicator flag as one character", () => {
    // The bug this whole module exists for: "🇳🇴".length is 4.
    expect("🇳🇴".length).toBe(4)
    expect(countGraphemes("🇳🇴")).toBe(1)
  })

  it("counts a ZWJ sequence as one character", () => {
    expect("👨‍👩‍👦".length).toBe(8)
    expect(countGraphemes("👨‍👩‍👦")).toBe(1)
  })

  it("counts a combining accent as one character", () => {
    expect(countGraphemes("é")).toBe(1)
  })
})

describe("measurePost", () => {
  it("charges X a flat 23 for a link regardless of its length", () => {
    const short = "se " + "https://a.co"
    const long = "se " + "https://example.com/" + "x".repeat(300)

    expect(measurePost(short, "x").used).toBe(measurePost(long, "x").used)
    expect(measurePost(short, "x").used).toBe(3 + 23)
  })

  it("counts links literally where the channel has no shortener", () => {
    const text = "se https://example.com/veldig-lang-url"
    expect(measurePost(text, "linkedin").used).toBe(countGraphemes(text))
  })

  it("charges each link separately", () => {
    const text = "https://a.co https://b.co"
    // Two links at 23, plus the single space between them.
    expect(measurePost(text, "x").used).toBe(23 + 1 + 23)
  })

  it("reports how far over the ceiling a post is", () => {
    const text = "a".repeat(300)
    expect(measurePost(text, "x")).toMatchObject({ limit: 280, over: 20 })
  })

  it("reports no ceiling for long-form channels", () => {
    const m = measurePost("a".repeat(10_000), "substack")
    expect(m.limit).toBeNull()
    expect(m.over).toBe(0)
  })

  it("does not count a flag as four characters against the limit", () => {
    // 280 flags is 280 characters to a platform and 1120 to String.length.
    const text = "🇳🇴".repeat(280)
    expect(measurePost(text, "x").over).toBe(0)
  })

  it("falls back to literal counting for an unknown channel", () => {
    expect(measurePost("hei", "mastodon").used).toBe(3)
    expect(measurePost("hei", "mastodon").limit).toBeNull()
  })

  it("counts a scheme-less link the same as one with a scheme", () => {
    // The bug: the `www.` alternative used to swallow the space in front of
    // the link, so this measured 34 while X counts 35 — and a post shown as
    // exactly 280 was refused on send, after X had already billed for the
    // attempt.
    const withScheme = measurePost("hello https://example.com there", "x").used
    const withoutScheme = measurePost("hello www.example.com there", "x").used
    expect(withoutScheme).toBe(withScheme)
    expect(withoutScheme).toBe(35)
  })

  it("counts a scheme-less link at the start of a post", () => {
    // The `^` branch of the alternation has no leading space to eat, so this
    // case was already correct — pinned so a fix for the other branch cannot
    // regress it.
    expect(measurePost("www.example.com ok", "x").used).toBe(23 + 1 + 2)
  })
})

describe("splitAtFold", () => {
  it("splits LinkedIn at the fold", () => {
    const text = "a".repeat(200)
    const { visible, hidden } = splitAtFold(text, "linkedin")
    expect(visible).toHaveLength(140)
    expect(hidden).toHaveLength(60)
  })

  it("hides nothing when the post is shorter than the fold", () => {
    const { visible, hidden } = splitAtFold("kort", "linkedin")
    expect(visible).toBe("kort")
    expect(hidden).toBe("")
  })

  it("hides nothing on a channel with no fold", () => {
    const text = "a".repeat(280)
    expect(splitAtFold(text, "x").hidden).toBe("")
  })

  it("never cuts through a multi-code-unit character", () => {
    // 139 plain characters then a flag: the fold falls at index 140, which is
    // mid-flag if you slice by code unit.
    const text = "a".repeat(139) + "🇳🇴" + "b".repeat(50)
    const { visible } = splitAtFold(text, "linkedin")
    expect(visible).toBe("a".repeat(139) + "🇳🇴")
    expect(countGraphemes(visible)).toBe(140)
  })
})

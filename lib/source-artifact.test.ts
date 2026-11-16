import { describe, expect, it } from "vitest"

import { revealDuration } from "./reveal-text"
import {
  excerptOf,
  hostnameOf,
  isSourceArtifactOutput,
  looksLikeUrl,
  sourceArtifactFromProse,
} from "./source-artifact"

describe("excerptOf", () => {
  it("leaves a short string alone", () => {
    expect(excerptOf("A morning run costs nothing.")).toBe(
      "A morning run costs nothing."
    )
  })

  it("cuts on a word, with an ellipsis", () => {
    const long =
      "The morning run costs nothing now because the feeds that used to charge are gone. " +
      "A second sentence keeps going so the clip has to land somewhere in the middle of this paragraph about free reads."
    const out = excerptOf(long, 80)
    expect(out.endsWith("…")).toBe(true)
    expect(out.length).toBeLessThanOrEqual(81)
    expect(out).toMatch(/ \S+\u2026$/)
  })
})

describe("hostnameOf", () => {
  it("returns the host of an https url", () => {
    expect(hostnameOf("https://github.com/acme/app/pull/282")).toBe(
      "github.com"
    )
  })

  it("returns null for junk", () => {
    expect(hostnameOf("not a url")).toBeNull()
    expect(hostnameOf(null)).toBeNull()
  })
})

describe("looksLikeUrl", () => {
  it("accepts http(s) only", () => {
    expect(looksLikeUrl("https://github.com/acme/app/pull/282")).toBe(true)
    expect(looksLikeUrl("javascript:alert(1)")).toBe(false)
    expect(looksLikeUrl("#282")).toBe(false)
  })
})

describe("sourceArtifactFromProse", () => {
  it("recovers a card from a stored string result", () => {
    const prose = [
      "#282 Trend Alerts reads where reading is free",
      "github · acme/app · merged 2026-08-26 14:24 UTC",
      "https://github.com/acme/app/pull/282",
      "Source id: src_1",
      "",
      "In plain words:",
      "Trend Alerts now reads the two feeds that do not charge.",
    ].join("\n")

    expect(sourceArtifactFromProse(prose)).toEqual({
      ok: true,
      url: "https://github.com/acme/app/pull/282",
      title: "#282 Trend Alerts reads where reading is free",
      excerpt: "Trend Alerts now reads the two feeds that do not charge.",
      message: prose,
    })
  })

  it("does not dress a refusal up as a page", () => {
    expect(
      sourceArtifactFromProse("Nothing of theirs matches “#999”.")
    ).toBeNull()
  })
})

describe("isSourceArtifactOutput", () => {
  it("accepts a live tool result", () => {
    expect(
      isSourceArtifactOutput({
        ok: true,
        url: "https://github.com/acme/app/pull/282",
        title: "#282 Trend Alerts",
        excerpt: "A morning run costs nothing.",
        message: "full",
      })
    ).toBe(true)
  })

  it("rejects a failure", () => {
    expect(
      isSourceArtifactOutput({ ok: false, message: "Nothing of theirs matches." })
    ).toBe(false)
  })
})

describe("revealDuration", () => {
  it("floors a one-liner and caps a newsletter", () => {
    expect(revealDuration(12)).toBe(180)
    expect(revealDuration(100)).toBe(600)
    expect(revealDuration(2000)).toBe(800)
    expect(revealDuration(0)).toBe(0)
  })
})

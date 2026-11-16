import { describe, expect, it } from "vitest"

import { describeUserAgent } from "@/lib/user-agent"

/**
 * These are real strings, taken from the `session` table rather than written to
 * fit the parser. The Chromium-lineage ones are the point: every one of them
 * contains "Safari/" and most contain "Chrome/", so a parser that tested in the
 * wrong order would call an Edge session Safari and nobody would notice until a
 * row in /settings named the wrong browser.
 */
describe("describeUserAgent", () => {
  it("names browser and system together", () => {
    expect(
      describeUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36"
      )
    ).toBe("Chrome on macOS")

    expect(
      describeUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5.2 Mobile/15E148 Safari/604.1"
      )
    ).toBe("Safari on iPhone")
  })

  it("prefers the specific name over the ones Chromium borrows", () => {
    // Contains Chrome/ and Safari/ as well as Edg/.
    expect(
      describeUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0"
      )
    ).toBe("Edge on Windows")

    expect(
      describeUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 OPR/120.0.0.0"
      )
    ).toBe("Opera on macOS")

    // Chrome on iOS is WebKit and calls itself CriOS, never Chrome/.
    expect(
      describeUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/151.0.0.0 Mobile/15E148 Safari/604.1"
      )
    ).toBe("Chrome on iPhone")
  })

  it("reads an iPad as an iPad even when it claims to be a Macintosh", () => {
    // Desktop-mode Safari on iPadOS. The Macintosh token comes first; the iPad
    // token is the true one.
    expect(
      describeUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15 iPad"
      )
    ).toBe("Safari on iPad")
  })

  it("says Unknown browser rather than inventing one", () => {
    // All three are real rows in the table, written by tooling rather than by a
    // person, and a settings page that named them would be lying about them.
    expect(describeUserAgent("curl/8.7.1")).toBe("Unknown browser")
    expect(describeUserAgent("node")).toBe("Unknown browser")
    expect(describeUserAgent("Python-urllib/3.11")).toBe("Unknown browser")

    expect(describeUserAgent(null)).toBe("Unknown browser")
    expect(describeUserAgent(undefined)).toBe("Unknown browser")
    expect(describeUserAgent("")).toBe("Unknown browser")
  })

  it("falls back to whichever half it recognised", () => {
    expect(describeUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(
      "Windows"
    )
    expect(describeUserAgent("Firefox/143.0")).toBe("Firefox")
  })
})

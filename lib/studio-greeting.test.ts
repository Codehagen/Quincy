import { describe, expect, it } from "vitest"

import { composeStudioGreeting } from "./studio-greeting"

const riff = (
  over: Partial<{
    scrap: string
    capturedAt: string
    state: string
    stuck: boolean
  }> = {}
) => ({
  scrap: "I dont know, you tell me",
  capturedAt: "Yesterday",
  state: "working",
  ...over,
})

describe("composeStudioGreeting", () => {
  it("greets a quiet desk by first name and asks for material", () => {
    const greeting = composeStudioGreeting({
      name: "Christer Hagen",
      riffs: [],
      typed: true,
    })

    expect(greeting.opening[0]).toBe("Christer. The desk is quiet.")
    expect(greeting.opening[1]).toMatch(/shipped this week/)
    expect(greeting.chips).not.toContain("Draft from that riff")
    expect(greeting.typed).toBe(true)
  })

  it("names the one riff on the desk, quoted, with its day folded into the sentence", () => {
    const greeting = composeStudioGreeting({
      name: "Christer",
      riffs: [riff()],
      typed: false,
    })

    expect(greeting.opening[0]).toBe("Christer. There is material on the desk.")
    expect(greeting.opening[1]).toContain(
      "“I dont know, you tell me” yesterday"
    )
    expect(greeting.chips[0]).toBe("Draft from that riff")
    expect(greeting.typed).toBe(false)
  })

  it("counts multiple riffs and quotes only the newest", () => {
    const greeting = composeStudioGreeting({
      name: "Christer",
      riffs: [
        riff({ scrap: "newest scrap", capturedAt: "Today" }),
        riff({ scrap: "older scrap", capturedAt: "3 days ago" }),
      ],
      typed: false,
    })

    expect(greeting.opening[1]).toContain(
      "2 riffs — the newest today: “newest scrap”"
    )
    expect(greeting.opening[1]).not.toContain("older scrap")
  })

  it("treats a desk holding only failed riffs as quiet", () => {
    const greeting = composeStudioGreeting({
      name: "Christer",
      riffs: [riff({ state: "failed" })],
      typed: false,
    })

    expect(greeting.opening[0]).toBe("Christer. The desk is quiet.")
  })

  it("clips a long scrap on a word boundary", () => {
    const greeting = composeStudioGreeting({
      name: "Christer",
      riffs: [riff({ scrap: `${"word ".repeat(40)}end` })],
      typed: false,
    })

    const quoted = greeting.opening[1].match(/“([^”]+)”/)?.[1]
    expect(quoted).toBeDefined()
    expect(quoted!.length).toBeLessThanOrEqual(91)
    expect(quoted).toMatch(/…$/)
    expect(quoted).not.toMatch(/wor…$/)
  })

  it("speaks calendar dates with a preposition and keeps relative ones bare", () => {
    const onDate = composeStudioGreeting({
      name: "Christer",
      riffs: [riff({ capturedAt: "12 Aug" })],
      typed: false,
    })
    expect(onDate.opening[1]).toContain("on 12 Aug")

    const ago = composeStudioGreeting({
      name: "Christer",
      riffs: [riff({ capturedAt: "3 days ago" })],
      typed: false,
    })
    expect(ago.opening[1]).toContain("3 days ago")
    expect(ago.opening[1]).not.toContain("on 3 days ago")
  })

  it("stands the greeting up even without a name", () => {
    const greeting = composeStudioGreeting({ name: "", riffs: [], typed: true })
    expect(greeting.opening[0]).toBe("The desk is quiet.")
  })

  /**
   * The 2026-08-13 reading of the real account.
   *
   * One riff, `working` since 2026-08-11, and the greeting was still offering
   * to draft from it 42 hours later. `working` means "not finished reading it
   * yet", which is true for four minutes and a lie after that.
   */
  it("does not offer a riff Quincy has lost", () => {
    const greeting = composeStudioGreeting({
      name: "Christer",
      riffs: [riff({ stuck: true })],
      typed: false,
    })

    expect(greeting.opening[0]).toBe("Christer. The desk is quiet.")
    expect(greeting.opening[1]).not.toContain("I dont know, you tell me")
    // The offer is the part that could not be kept: there is no angle to draft.
    expect(greeting.chips).not.toContain("Draft from that riff")
  })

  it("still offers the newest riff that is not stuck", () => {
    const greeting = composeStudioGreeting({
      name: "Christer",
      riffs: [
        riff({ scrap: "lost one", stuck: true }),
        riff({ scrap: "good one", capturedAt: "Today" }),
      ],
      typed: false,
    })

    // A stuck riff must not consume the slot, and must not be counted either.
    expect(greeting.opening[1]).toContain("“good one”")
    expect(greeting.opening[1]).not.toContain("2 riffs")
    expect(greeting.chips[0]).toBe("Draft from that riff")
  })

  it("treats an absent stuck flag as not stuck", () => {
    // The field is derived, not stored, so a caller may not supply it. The
    // default must never hide material that is really there.
    const greeting = composeStudioGreeting({
      name: "Christer",
      riffs: [riff()],
      typed: false,
    })

    expect(greeting.opening[0]).toBe("Christer. There is material on the desk.")
  })
})

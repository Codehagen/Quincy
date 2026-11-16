import { describe, expect, it } from "vitest"

import { composeStudioGreeting, offerLine } from "./studio-greeting"
import type { WaitingWork } from "./waiting-work"

/**
 * The offer in the shape a real account produced it: a merged pull
 * request read on 26 August, beats extracted, three angles nobody has drafted,
 * fourteen days on the desk.
 */
const waitingRiff = (
  over: Partial<Extract<WaitingWork, { kind: "riff" }>> = {}
): WaitingWork => ({
  kind: "riff",
  id: "rif_gh_si-fixture-001",
  hook: "I fixed the action row breaking button labels in narrow detail panels.",
  source: "pull request",
  waitingSince: "26 Aug",
  waitedDays: 14,
  beats: true,
  openAngles: 3,
  href: "/ideas",
  ...over,
})

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
    expect(greeting.chips).not.toContain("Draft from that idea")
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
    expect(greeting.chips[0]).toBe("Draft from that idea")
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
      "2 ideas — the newest today: “newest scrap”"
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
    expect(greeting.chips).not.toContain("Draft from that idea")
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
    expect(greeting.chips[0]).toBe("Draft from that idea")
  })

  /**
   * Plan 028, item 2a. Twelve riffs sat `ready` with their beats extracted
   * from 26–31 August and produced no draft, because the greeting reported a
   * count and never made an offer.
   */
  it("offers the waiting riff instead of counting the desk", () => {
    const greeting = composeStudioGreeting({
      name: "Christer",
      riffs: [riff({ scrap: "newest scrap", capturedAt: "Today" }), riff()],
      offer: waitingRiff(),
      typed: false,
    })

    expect(greeting.opening[0]).toBe("Christer. There is material on the desk.")
    expect(greeting.opening[1]).toBe(
      "The pull request I read on 26 Aug — “I fixed the action row breaking button labels in narrow detail panels.” — has had its three beats ready for 14 days, and I never asked. Not fresh, but finished: want me to write it?"
    )
    // The count is the chore this replaces; it must not survive alongside it.
    expect(greeting.opening[1]).not.toContain("You left me")
    expect(greeting.opening).toHaveLength(2)
  })

  it("gives the offer somewhere to open and a chip that names it", () => {
    const greeting = composeStudioGreeting({
      name: "Christer",
      riffs: [riff()],
      offer: waitingRiff(),
      typed: false,
    })

    expect(greeting.link).toEqual({
      href: "/ideas",
      label: "Open it on /ideas",
    })
    expect(greeting.chips[0]).toBe("Draft the pull request from 26 Aug")
  })

  it("says how long it waited, and stops saying it once the work is fresh", () => {
    const stale = offerLine(waitingRiff())
    expect(stale).toContain("ready for 14 days, and I never asked")
    expect(stale).toContain("Not fresh, but finished")

    const yesterday = offerLine(
      waitingRiff({ waitingSince: "Yesterday", waitedDays: 1 })
    )
    expect(yesterday).toBe(
      "The pull request I read yesterday — “I fixed the action row breaking button labels in narrow detail panels.” — already has its three beats. Want me to write it?"
    )
    expect(yesterday).not.toContain("days")
    expect(yesterday).not.toContain("Not fresh")
  })

  /**
   * Seven days is `formatConversationDate`'s own boundary — the day it stops
   * counting back and starts printing a date. The wording turns there too.
   */
  it("turns honest about age on the seventh day, not the sixth", () => {
    expect(
      offerLine(waitingRiff({ waitingSince: "6 days ago", waitedDays: 6 }))
    ).not.toContain("I never asked")
    expect(
      offerLine(waitingRiff({ waitingSince: "3 Sep", waitedDays: 7 }))
    ).toContain("ready for 7 days, and I never asked")
  })

  it("never claims beats a riff does not have", () => {
    const line = offerLine(
      waitingRiff({ source: "voice note", beats: false, waitedDays: 9 })
    )

    expect(line).toContain("has had its angles ready for 9 days")
    expect(line).not.toContain("beats")
  })

  it("clips a long hook rather than pasting a paragraph into the greeting", () => {
    const line = offerLine(waitingRiff({ hook: `${"word ".repeat(40)}end` }))
    const quoted = line.match(/“([^”]+)”/)?.[1]

    expect(quoted).toBeDefined()
    expect(quoted!.length).toBeLessThanOrEqual(91)
    expect(quoted).toMatch(/…$/)
  })

  it("stands the offer up on a desk the riff read cannot see", () => {
    // The two reads can disagree for a moment — one is a formatted list, the
    // other a fresh query. An offer is still material on the desk.
    const greeting = composeStudioGreeting({
      name: "Christer",
      riffs: [],
      offer: waitingRiff(),
      typed: false,
    })

    expect(greeting.opening[0]).toBe("Christer. There is material on the desk.")
  })

  it("asks the widest story gap when nothing is waiting to be written", () => {
    const greeting = composeStudioGreeting({
      name: "Christer",
      riffs: [],
      offer: {
        kind: "gap",
        theme: "pricing",
        posts: 7,
        question:
          "You mention pricing in 7 posts and have no story about it. What happened the last time you changed a price?",
      },
      typed: false,
    })

    expect(greeting.opening[0]).toBe("Christer. The desk is quiet.")
    expect(greeting.opening[1]).toBe(
      "Nothing is waiting to be written, so here is the one I would ask: You mention pricing in 7 posts and have no story about it. What happened the last time you changed a price?"
    )
    expect(greeting.link).toBeNull()
  })

  it("keeps a gap quiet while there is material in front of it", () => {
    const greeting = composeStudioGreeting({
      name: "Christer",
      riffs: [riff()],
      offer: { kind: "gap", theme: "pricing", posts: 7, question: "Ask this." },
      typed: false,
    })

    expect(greeting.opening[1]).toContain("You left me")
    expect(greeting.opening[1]).not.toContain("Ask this.")
  })

  it("greets exactly as before when the waiting read came back empty", () => {
    const withNull = composeStudioGreeting({
      name: "Christer",
      riffs: [riff()],
      offer: null,
      typed: false,
    })
    const without = composeStudioGreeting({
      name: "Christer",
      riffs: [riff()],
      typed: false,
    })

    expect(withNull).toEqual(without)
    expect(withNull.opening[1]).toContain("Say the word and I draft from it")
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

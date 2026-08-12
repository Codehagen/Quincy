import { afterEach, describe, expect, it, vi } from "vitest"

/**
 * The chat's tools, tested for the two things that can go wrong quietly.
 *
 * **What they say about what they did.** The output of a tool is not a value a
 * program reads — it is a sentence a model repeats to a person. So the strings
 * are the interface, and "drafted, waiting for you" versus "scheduled" is not a
 * wording preference: it is the difference between the product's one invariant
 * holding and the user believing something went out.
 *
 * **What they say when there is nothing.** An empty account is the common case
 * for a new user, and an empty answer that does not say where riffs come from
 * is how a chat-first product reads as broken.
 *
 * The database reads are mocked. Whether `getRiffs` returns the right rows is
 * its own concern and is covered where it lives; what is unproven without this
 * file is the rendering, and that is all this asserts.
 */

const getRiffs = vi.hoisted(() => vi.fn())
const getDrafts = vi.hoisted(() => vi.fn())
const getLineup = vi.hoisted(() => vi.fn())
const listConnections = vi.hoisted(() => vi.fn())
const getSourceConnections = vi.hoisted(() => vi.fn())
const draftAngle = vi.hoisted(() => vi.fn())

vi.mock("./riffs", () => ({ getRiffs }))
vi.mock("./drafts", async () => {
  const actual = await vi.importActual<typeof import("./drafts")>("./drafts")
  return { ...actual, getDrafts }
})
vi.mock("./lineup", async () => {
  const actual = await vi.importActual<typeof import("./lineup")>("./lineup")
  return { ...actual, getLineup }
})
vi.mock("./channels", () => ({ listConnections }))
vi.mock("./sources", () => ({ getSourceConnections }))
vi.mock("@/app/(app)/riffs/actions", () => ({ draftAngle }))

const { chatTools } = await import("./chat-tools")

const USER = {
  id: "usr_1",
  email: "someone@example.com",
  timezone: "Europe/Oslo",
}

afterEach(() => {
  vi.clearAllMocks()
})

/** Run one tool and return whatever string it produced. */
async function run(name: string, input: unknown = {}) {
  const tools = chatTools(USER)
  const execute = tools[name]?.execute
  if (!execute) throw new Error(`no tool named ${name}`)
  // The second argument is the AI SDK's tool-call context; nothing here reads
  // it, so an empty object is honest rather than a stub pretending otherwise.
  return (await execute(input, {} as never)) as string
}

describe("read_riffs", () => {
  it("says where riffs come from when there are none", async () => {
    getRiffs.mockResolvedValue([])

    const out = await run("read_riffs")

    // An empty account is the first thing a new user sees. "Nothing" alone
    // reads as broken; naming the four doors reads as not started yet.
    expect(out).toMatch(/voice note/)
    expect(out).toMatch(/sources/)
  })

  it("names the angle ids, because draft_angle needs one", async () => {
    getRiffs.mockResolvedValue([
      {
        id: "rif_1",
        scrap: "Per-seat pricing is wrong for us.",
        sourceId: "voice",
        sourceLabel: "Voice notes",
        capturedAt: "2 hours ago",
        state: "ready",
        failure: "",
        stuck: false,
        adaptedFrom: null,
        angles: [
          {
            id: "ang_abc",
            hook: "We dropped per-seat pricing.",
            shape: "Short post",
            why: "A decision with a number attached.",
          },
        ],
      },
    ])

    const out = await run("read_riffs")

    // Without the id in the output the write tool is unreachable: the model
    // would have nothing to pass but the hook text, which the action refuses.
    expect(out).toContain("ang_abc")
    expect(out).toContain("We dropped per-seat pricing.")
  })

  it("marks an angle that has already been written", async () => {
    getRiffs.mockResolvedValue([
      {
        id: "rif_1",
        scrap: "x",
        sourceId: "voice",
        sourceLabel: "Voice notes",
        capturedAt: "today",
        state: "ready",
        failure: "",
        stuck: false,
        adaptedFrom: null,
        angles: [
          {
            id: "ang_1",
            hook: "h",
            shape: "Thread",
            why: "w",
            status: "drafted",
          },
        ],
      },
    ])

    // Otherwise the model offers to write something that exists, and the user
    // pays for a draft they already have.
    expect(await run("read_riffs")).toMatch(/already drafted/)
  })
})

describe("read_drafts", () => {
  it("counts pieces and versions separately", async () => {
    getDrafts.mockResolvedValue([
      {
        id: "drf_1",
        idea: "Why we dropped per-seat pricing",
        versions: [
          { channel: "x", label: "X", text: "a", state: "writing" },
          {
            channel: "linkedin",
            label: "LinkedIn",
            text: "b",
            state: "approved",
            goingOut: "Tomorrow 08:00",
          },
        ],
      },
    ])

    const out = await run("read_drafts")

    // "How many need me" and "how many decisions is that" are different
    // questions, and a half-approved piece is where one number would lie.
    expect(out).toContain("1 piece")
    expect(out).toMatch(/1 version in total/)
    expect(out).toMatch(/going out Tomorrow 08:00/)
    expect(out).toMatch(/waiting for you/)
  })
})

describe("read_lineup", () => {
  it("distinguishes no slots from empty slots", async () => {
    getLineup.mockResolvedValue({ days: [], slots: [] })
    expect(await run("read_lineup")).toMatch(/no standing slots/)

    getLineup.mockResolvedValue({
      days: [],
      slots: [{ id: "slt_1", dayId: "d1" }],
    })
    // Two different next steps: one is "set a slot", the other is "approve
    // something". A single "nothing scheduled" would hide which.
    expect(await run("read_lineup")).toMatch(/1 standing slot/)
  })
})

describe("read_channels", () => {
  it("says plainly that a revoked channel cannot publish", async () => {
    listConnections.mockResolvedValue([
      { channel: "x", handle: "codehagen", state: "active" },
      { channel: "linkedin", handle: null, state: "needs_reauth" },
    ])

    const out = await run("read_channels")

    expect(out).toContain("@codehagen")
    // The consequence, not the state name — "needs_reauth" means nothing to
    // the person being told about it.
    expect(out).toMatch(/cannot publish until it is/)
  })
})

describe("draft_angle", () => {
  it("never claims a draft went out", async () => {
    draftAngle.mockResolvedValue({
      ok: true,
      draftId: "drf_1",
      channels: ["X", "LinkedIn"],
      written: true,
      fellBack: [],
      overLimit: [],
      existing: false,
    })

    const out = await run("draft_angle", { angleId: "ang_1" })

    // docs/vision.md's one invariant: Quincy drafts, you send. This is the
    // tool that writes, so this is where the wording has to hold.
    expect(out).toMatch(/waiting for you to approve/)
    expect(out).toMatch(/Nothing goes out until you do/)
    expect(out).not.toMatch(/scheduled|published|posted/i)
  })

  it("names the channels that fell back to the hook", async () => {
    draftAngle.mockResolvedValue({
      ok: true,
      draftId: "drf_1",
      channels: ["X", "Substack"],
      written: false,
      fellBack: ["Substack"],
      overLimit: [],
      existing: false,
    })

    const out = await run("draft_angle", { angleId: "ang_1" })

    // A draft can fall back on one channel and succeed on another, so a
    // boolean would be wrong about one of them. This is the 2026-08-08 case.
    expect(out).toContain("Substack")
    expect(out).toMatch(/need your rewrite/)
  })

  it("says nothing was charged when the draft already existed", async () => {
    draftAngle.mockResolvedValue({
      ok: true,
      draftId: "drf_1",
      channels: [],
      written: true,
      fellBack: [],
      overLimit: [],
      existing: true,
    })

    expect(await run("draft_angle", { angleId: "ang_1" })).toMatch(
      /nothing was charged/i
    )
  })

  it("passes the action's own refusal through rather than paraphrasing it", async () => {
    draftAngle.mockResolvedValue({
      ok: false,
      reason: "entitlement",
      message: "Your trial has ended.",
    })

    // The action knows whether this was a lapsed trial, a cooldown or a
    // missing angle, and each wants a different response from the user. A
    // generic "could not draft" throws that away.
    expect(await run("draft_angle", { angleId: "ang_1" })).toContain(
      "Your trial has ended."
    )
  })
})

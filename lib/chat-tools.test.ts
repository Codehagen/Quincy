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
const corpusSummary = vi.hoisted(() => vi.fn())
const draftAngleFor = vi.hoisted(() => vi.fn())
const captureToRiffFor = vi.hoisted(() => vi.fn())
const readSourceByRef = vi.hoisted(() => vi.fn())
const getStory = vi.hoisted(() => vi.fn())
const getNumbers = vi.hoisted(() => vi.fn())

vi.mock("./riffs", () => ({ getRiffs, readSourceByRef }))
vi.mock("./drafts", async () => {
  const actual = await vi.importActual<typeof import("./drafts")>("./drafts")
  return { ...actual, getDrafts }
})
vi.mock("./lineup", async () => {
  const actual = await vi.importActual<typeof import("./lineup")>("./lineup")
  return { ...actual, getLineup }
})
// Partial, like the mocks below it. `./numbers` is loaded for real here, and
// it now reads `post_metric` — which reaches `getAccessToken` on this module
// while building its live deps. A replacement mock makes every export this
// file does not name a throw at import time, in a module it never calls.
vi.mock("./channels", async () => {
  const actual = await vi.importActual<typeof import("./channels")>("./channels")
  return { ...actual, listConnections }
})
vi.mock("./sources", () => ({ getSourceConnections }))
vi.mock("./corpus-x", () => ({ corpusSummary }))
// `renderStory` and the number formatters stay real: they are the rendering,
// and the rendering is what this file exists to assert.
vi.mock("./brain", async () => {
  const actual = await vi.importActual<typeof import("./brain")>("./brain")
  return { ...actual, getStory }
})
vi.mock("./numbers", async () => {
  const actual = await vi.importActual<typeof import("./numbers")>("./numbers")
  return { ...actual, getNumbers }
})
// The shared write path, not the server actions. `chatTools` calls
// `lib/riff-writes.ts` directly and passes `user.id` — there is no session to
// resolve on either route that uses this factory.
vi.mock("./riff-writes", () => ({ draftAngleFor, captureToRiffFor }))

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

it("says a lost riff is lost instead of offering it", async () => {
  getRiffs.mockResolvedValue([
    {
      id: "rif_1",
      scrap: "I dont know, you tell me",
      sourceId: "voice",
      sourceLabel: "Voice notes",
      capturedAt: "2 days ago",
      state: "working",
      failure: "",
      stuck: true,
      adaptedFrom: null,
      angles: [],
    },
  ])

  const out = await run("read_riffs")

  // A stuck riff has no angles and never will, so draft_angle has no id to
  // take. Without this the model offers to write from it and cannot.
  expect(out).toMatch(/lost this one/)
  expect(out).toMatch(/recording again/)
  expect(out).not.toMatch(/No angles yet/)
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
      { channel: "x", handle: "@codehagen", state: "active" },
      { channel: "linkedin", handle: null, state: "needs_reauth" },
    ])

    const out = await run("read_channels")

    expect(out).toContain("@codehagen")
    // The consequence, not the state name — "needs_reauth" means nothing to
    // the person being told about it.
    expect(out).toMatch(/cannot publish until it is/)
  })
})

describe("capture_riff", () => {
  it("points at the next step rather than stopping at 'done'", async () => {
    captureToRiffFor.mockResolvedValue({
      ok: true,
      riffId: "rif_1",
      angles: 3,
      groundedIn: "a post about pricing",
    })

    const out = await run("capture_riff", { text: "Episode 02 script..." })

    // The tool that captures is useless on its own: the ids it created live in
    // read_riffs, and the model has to go and get them.
    expect(out).toMatch(/3 angles/)
    expect(out).toMatch(/read_riffs/)
    expect(out).toMatch(/draft_angle/)
    // Still the invariant: capturing is not writing.
    expect(out).toMatch(/Nothing is written until they choose/)
  })

  it("passes a refusal through with the reason intact", async () => {
    // The ceiling is MAX_TRANSCRIPT_CHARS in lib/riffs.ts. A model that
    // reports "could not capture" leaves the user with no idea that trimming
    // the text is the fix.
    captureToRiffFor.mockResolvedValue({
      ok: false,
      message:
        "That is 9214 characters. Send at most 5760 — the transferable idea is never in the last thousand.",
    })

    expect(await run("capture_riff", { text: "x".repeat(9214) })).toContain(
      "Send at most 5760"
    )
  })

  it("sends the words on unchanged", async () => {
    captureToRiffFor.mockResolvedValue({
      ok: true,
      riffId: "rif_1",
      angles: 1,
      groundedIn: "",
    })

    await run("capture_riff", {
      text: "  their exact words  ",
      note: "keep it short",
    })

    // Their material, not a summary of it. A model that paraphrases here would
    // put its own writing into the riff and ground every later draft on it.
    expect(captureToRiffFor).toHaveBeenCalledWith(
      USER.id,
      "  their exact words  "
    )
  })
})

describe("read_channels and read_sources", () => {
  it("does not double the @ on a handle that already has one", async () => {
    listConnections.mockResolvedValue([
      { channel: "x", handle: "@CodeHagen", state: "active" },
    ])

    // "@@CodeHagen" reached a real conversation. The one sentence whose job is
    // to name the account correctly must name it correctly.
    const out = await run("read_channels")
    expect(out).toContain("@CodeHagen")
    expect(out).not.toContain("@@")
  })

  it("says the corpus is empty and what fills it", async () => {
    getSourceConnections.mockResolvedValue({})
    corpusSummary.mockResolvedValue({ items: 0, newestPostedAt: null })

    const out = await run("read_sources")

    // Asked what it could see, Quincy said "the connected X account" and
    // stopped — true and useless. Connecting a channel and reading the corpus
    // are two different things, and only one of them teaches it a voice.
    expect(out).toMatch(/read none of your own published posts/)
    expect(out).toMatch(/Read my posts/)
    expect(out).toMatch(/sources/)
  })

  it("reports how much it has read once there is a corpus", async () => {
    getSourceConnections.mockResolvedValue({})
    corpusSummary.mockResolvedValue({
      items: 200,
      newestPostedAt: new Date("2026-08-01T10:00:00Z"),
    })

    const out = await run("read_sources")

    expect(out).toMatch(/200 of your own posts/)
    expect(out).toContain("2026-08-01")
  })
})

describe("draft_angle", () => {
  it("never claims a draft went out", async () => {
    draftAngleFor.mockResolvedValue({
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
    draftAngleFor.mockResolvedValue({
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
    draftAngleFor.mockResolvedValue({
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
    draftAngleFor.mockResolvedValue({
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

/**
 * One merged pull request as `readSourceByRef` hands it over, carrying every
 * optional field the ingest may have written. Individual tests strip what they
 * are not about — a fixture that always has everything proves nothing about the
 * row that has half of it.
 */
const MERGE = {
  id: "src_1",
  source: "github",
  url: "https://github.com/acme/app/pull/282",
  externalId: "PR_kwabc",
  postedAt: new Date("2026-08-26T14:24:00Z"),
  createdAt: new Date("2026-08-26T14:25:00Z"),
  body: "Trend Alerts used to pay for every read.\n\nIt now reads the two feeds that charge nothing, and keeps nothing most mornings.",
  meta: {
    number: 282,
    title: "Trend Alerts reads where reading is free",
    repository: "acme/app",
    private: true,
    additions: 120,
    deletions: 8,
    changedFiles: 4,
    commits: 3,
    labels: ["ship"],
    brief:
      "Trend Alerts now reads the two feeds that do not charge, so a morning run costs nothing.",
    material: {
      commits: ["Read the free feeds first", "Drop the paid read"],
      files: [{ name: "lib/signals.ts", additions: 90, deletions: 4 }],
      issues: [{ number: 271, title: "Trend Alerts costs too much" }],
      patches: [{ name: "lib/signals.ts", patch: "@@ -1 +1 @@\n-paid\n+free" }],
      truncated: ["lib/signals.ts"],
    },
  },
  riffs: [
    {
      id: "rif_1",
      state: "ready",
      failure: "",
      scrap: "Trend Alerts used to pay for every read.",
      context: {
        forUser: "A morning run costs nothing now.",
        beats: {
          did: "I moved Trend Alerts onto the free feeds.",
          happened: "The run cost dropped to zero.",
          learned: "Most mornings there is nothing worth keeping.",
        },
        facts: { repository: "acme/app", private: true, labels: ["ship"] },
      },
      angles: [
        {
          id: "ang_free",
          hook: "I stopped paying to read the internet.",
          shape: "Short post",
          why: "A decision with a number attached.",
          drafted: false,
        },
      ],
    },
  ],
}

describe("read_source", () => {
  it("reads a pull request number, with or without the hash", async () => {
    readSourceByRef.mockResolvedValue(MERGE)

    await run("read_source", { ref: "#282" })
    expect(readSourceByRef).toHaveBeenCalledWith({
      userId: USER.id,
      ref: { by: "number", number: 282 },
    })

    await run("read_source", { ref: "282" })
    // The model types it both ways in the same conversation. A ref that only
    // works with the hash is a tool that fails half the time it is called.
    expect(readSourceByRef).toHaveBeenLastCalledWith({
      userId: USER.id,
      ref: { by: "number", number: 282 },
    })
  })

  it("reads a pasted URL, and keeps the number as a fallback", async () => {
    readSourceByRef.mockResolvedValue(MERGE)

    await run("read_source", {
      ref: "https://github.com/acme/app/pull/282/files#discussion_r1",
    })

    // The stored url is GitHub's own html_url. What a person copies out of the
    // address bar carries a tab and an anchor, and matching on that string
    // alone would miss the row that is sitting right there.
    expect(readSourceByRef).toHaveBeenCalledWith({
      userId: USER.id,
      ref: {
        by: "url",
        url: "https://github.com/acme/app/pull/282",
        number: 282,
      },
    })
  })

  it("reads a source id", async () => {
    readSourceByRef.mockResolvedValue(MERGE)

    await run("read_source", { ref: "src_1" })

    expect(readSourceByRef).toHaveBeenCalledWith({
      userId: USER.id,
      ref: { by: "id", id: "src_1" },
    })
  })

  it("cannot reach another account's merge", async () => {
    // The fake stands in for the query's own predicate: the ownership filter is
    // `and`-ed with the ref in every branch, so a number — which is guessable,
    // #282 exists in every repository on earth — resolves to nothing unless the
    // row belongs to the caller.
    readSourceByRef.mockImplementation(
      async ({ userId }: { userId: string }) =>
        userId === "usr_other" ? MERGE : null
    )

    const out = await run("read_source", { ref: "#282" })

    expect(out).toMatch(/Nothing of theirs matches/)
    expect(out).not.toContain("Trend Alerts reads where reading is free")
    expect(readSourceByRef).toHaveBeenCalledWith({
      userId: USER.id,
      ref: { by: "number", number: 282 },
    })
  })

  it("gives the whole description, the brief and the angle ids", async () => {
    readSourceByRef.mockResolvedValue(MERGE)

    const out = await run("read_source", { ref: "#282" })

    expect(out).toContain("#282 Trend Alerts reads where reading is free")
    // The brief is what removes the repository's own vocabulary from a draft.
    expect(out).toContain("so a morning run costs nothing")
    // The description whole, not the first paragraph of it.
    expect(out).toContain("keeps nothing most mornings")
    // Without the angle id the write tool is unreachable from here.
    expect(out).toContain("ang_free")
    // The beats, in the order the post goes in.
    expect(out).toMatch(/What you did: I moved Trend Alerts/)
    expect(out).toMatch(/What happened: The run cost dropped/)
    expect(out).toMatch(/What it meant: Most mornings/)
    // The material, which the writer never saw before this.
    expect(out).toContain("lib/signals.ts +90 −4")
    expect(out).toContain("Read the free feeds first")
    expect(out).toContain("#271 Trend Alerts costs too much")
    expect(out).toMatch(/Private repository/)
  })

  it("keeps the patch samples out until they are asked for", async () => {
    readSourceByRef.mockResolvedValue(MERGE)

    const without = await run("read_source", { ref: "#282" })
    expect(without).not.toContain("+free")
    expect(without).toMatch(/includePatches/)

    const withPatches = await run("read_source", {
      ref: "#282",
      includePatches: true,
    })
    expect(withPatches).toContain("+free")
  })

  it("says why a merge was refused, in either shape the column has held", async () => {
    readSourceByRef.mockResolvedValue({
      ...MERGE,
      riffs: [],
      // What `recordShippedRefusal` writes today: two flat keys.
      meta: {
        ...MERGE.meta,
        refusal: "nothing-worth-keeping",
        refusalWhy: "A dependency bump with no consequence anybody would read.",
      },
    })

    const flat = await run("read_source", { ref: "#282" })
    expect(flat).toContain("nothing-worth-keeping")
    expect(flat).toContain("A dependency bump")
    expect(flat).toMatch(/no angle id/)

    readSourceByRef.mockResolvedValue({
      ...MERGE,
      riffs: [],
      meta: {
        ...MERGE.meta,
        refusal: {
          reason: "nothing-worth-keeping",
          at: "2026-08-26T14:30:00Z",
        },
      },
    })

    // The nested shape the ingest is moving to. A reader that understood only
    // one of them would report "no refusal recorded" about a recorded refusal.
    const nested = await run("read_source", { ref: "#282" })
    expect(nested).toContain("nothing-worth-keeping")
    expect(nested).toContain("2026-08-26")
  })

  it("carries the open question, and the answer when there is one", async () => {
    readSourceByRef.mockResolvedValue({
      ...MERGE,
      meta: {
        ...MERGE.meta,
        question: {
          text: "You merged 282 at 14:24. What made you do it?",
          askedAt: "2026-08-26T14:31:00Z",
        },
      },
    })

    expect(await run("read_source", { ref: "#282" })).toMatch(
      /has had no answer yet/
    )

    readSourceByRef.mockResolvedValue({
      ...MERGE,
      meta: {
        ...MERGE.meta,
        question: {
          text: "You merged 282 at 14:24. What made you do it?",
          askedAt: "2026-08-26T14:31:00Z",
          answer: "The bill for reading was larger than the product.",
          answeredAt: "2026-08-26T18:00:00Z",
        },
      },
    })

    const answered = await run("read_source", { ref: "#282" })
    // The answer is the missing beat. Saying so is the whole point of asking.
    expect(answered).toContain("The bill for reading was larger")
    expect(answered).toMatch(/missing beat/)
  })

  it("survives a meta that is the wrong shape throughout", async () => {
    // jsonb, written by a webhook and by an ingest that will change. Every
    // reader here has to degrade to a shorter answer rather than throw inside
    // a tool call somebody is watching stream.
    readSourceByRef.mockResolvedValue({
      ...MERGE,
      meta: {
        number: "282",
        brief: 12,
        material: { commits: "one", files: [null, { name: 4 }], issues: 7 },
        refusal: [],
        question: "ask me",
      },
      riffs: [{ ...MERGE.riffs[0], context: "not an object" }],
    })

    const out = await run("read_source", { ref: "#282" })
    expect(out).toContain("ang_free")
    expect(out).not.toMatch(/undefined|NaN|\[object Object\]/)
  })

  it("says plainly when nothing matches", async () => {
    readSourceByRef.mockResolvedValue(null)

    const out = await run("read_source", { ref: "#999" })

    // Not "no data". The next move is a different ref or a look at /sources.
    expect(out).toMatch(/Nothing of theirs matches/)
    expect(out).toMatch(/sources/)
  })
})

describe("read_riffs, on material longer than a tweet", () => {
  it("does not cut the scrap at 400 characters", async () => {
    const scrap = `Opening line.\n${"x".repeat(1_200)}\nThe number is 41 percent.`

    getRiffs.mockResolvedValue([
      {
        id: "rif_1",
        scrap,
        sourceId: "github",
        sourceLabel: "GitHub",
        capturedAt: "today",
        state: "ready",
        failure: "",
        stuck: false,
        adaptedFrom: null,
        angles: [],
      },
    ])

    const out = await run("read_riffs")

    // Every live GitHub scrap is longer than 400 characters, so the old cut
    // removed the sentence with the number in it from every merge.
    expect(out).toContain("The number is 41 percent.")
    expect(out).not.toContain("[cut")
  })

  it("cuts a very long scrap and says it cut it", async () => {
    getRiffs.mockResolvedValue([
      {
        id: "rif_1",
        scrap: "y".repeat(9_000),
        sourceId: "github",
        sourceLabel: "GitHub",
        capturedAt: "today",
        state: "ready",
        failure: "",
        stuck: false,
        adaptedFrom: null,
        angles: [],
      },
    ])

    const out = await run("read_riffs")

    // A silent truncation reads to a model as a sentence that ended.
    expect(out).toMatch(/\[cut — \d+ more characters not shown\]/)
  })

  it("renders the context the writer is given", async () => {
    getRiffs.mockResolvedValue([
      {
        id: "rif_1",
        scrap: "Trend Alerts used to pay for every read.",
        sourceId: "github",
        sourceLabel: "GitHub",
        capturedAt: "today",
        state: "ready",
        failure: "",
        stuck: false,
        adaptedFrom: null,
        sourceItemId: "src_1",
        context: MERGE.riffs[0].context,
        angles: [
          {
            id: "ang_free",
            hook: "I stopped paying to read the internet.",
            shape: "Short post",
            why: "A decision with a number attached.",
          },
        ],
      },
    ])

    const out = await run("read_riffs")

    // Twelve angles from four merges produced zero drafts on 2026-08-24, and
    // part of the reason is that the chat could see the scrap and none of this.
    expect(out).toMatch(/What changed for a user: A morning run costs nothing/)
    expect(out).toMatch(/What you did: I moved Trend Alerts/)
    expect(out).toMatch(/What happened: The run cost dropped/)
    expect(out).toMatch(/What it meant: Most mornings/)
    expect(out).toMatch(/Private repository/)
  })

  it("prints no context lines for a riff that has none", async () => {
    getRiffs.mockResolvedValue([
      {
        id: "rif_1",
        scrap: "A voice note.",
        sourceId: "voice",
        sourceLabel: "Voice notes",
        capturedAt: "today",
        state: "ready",
        failure: "",
        stuck: false,
        adaptedFrom: null,
        context: {},
        angles: [{ id: "ang_1", hook: "h", shape: "Thread", why: "w" }],
      },
    ])

    const out = await run("read_riffs")

    // `describeFacts` answers an empty object with a sentence about "a
    // repository", which on a voice note is a fact about nothing.
    expect(out).not.toMatch(/repository/i)
    expect(out).not.toMatch(/What you did/)
  })
})

describe("read_story", () => {
  const STORY = {
    id: "bp_1",
    userId: USER.id,
    slug: "story/the-first-invite",
    kind: "story",
    title: "The first invite",
    body: "It went out on a Tuesday and the link pointed at localhost.",
    data: {
      point: "Shipping is the only test.",
      hook: "I mailed twelve people a broken link.",
      quotes: ["I mailed twelve people a broken link."],
      proof: ["https://example.com/p/1"],
      useFor: ["launch stories"],
      theme: "shipping",
    },
    provenance: "user",
    createdAt: new Date("2026-08-01T00:00:00Z"),
    updatedAt: new Date("2026-08-01T00:00:00Z"),
  }

  it("returns one story in full, by title", async () => {
    getStory.mockResolvedValue({ page: STORY, titles: [STORY.title] })

    const out = await run("read_story", { title: "The first invite" })

    expect(getStory).toHaveBeenCalledWith(USER.id, "The first invite")
    expect(out).toContain("Shipping is the only test.")
    // The narrative, which the index form deliberately leaves out. A caller
    // that named a title wants the prose — that is why it asked.
    expect(out).toContain("the link pointed at localhost")
    expect(out).toContain("https://example.com/p/1")
  })

  it("returns one story by id", async () => {
    getStory.mockResolvedValue({ page: STORY, titles: [STORY.title] })

    const out = await run("read_story", { id: "bp_1" })

    expect(getStory).toHaveBeenCalledWith(USER.id, "bp_1")
    expect(out).toContain("The first invite")
  })

  it("names the stories that do exist when the title is wrong", async () => {
    getStory.mockResolvedValue({
      page: null,
      titles: ["The first invite", "The week nothing shipped"],
    })

    const out = await run("read_story", { title: "The second invite" })

    // An unknown title with no list beside it is how a model starts guessing
    // at a detail it was told never to invent.
    expect(out).toContain("No story called “The second invite”")
    expect(out).toContain("The week nothing shipped")
  })

  it("says the brain has no stories rather than naming none", async () => {
    getStory.mockResolvedValue({ page: null, titles: [] })

    expect(await run("read_story", { title: "Anything" })).toMatch(
      /no stories in this brain yet/
    )
  })

  it("asks for a title when it was given neither", async () => {
    expect(await run("read_story", {})).toMatch(/Which story/)
    expect(getStory).not.toHaveBeenCalled()
  })
})

describe("read_numbers", () => {
  it("says what fills an empty corpus, not that there is no data", async () => {
    getNumbers.mockResolvedValue({
      scored: 0,
      skipped: 0,
      median: 0,
      mean: 0,
      from: null,
      to: null,
      fromAxis: null,
      toAxis: null,
      byDate: [],
      outliers: 0,
      below: 0,
      best: 0,
      linkRepliesBelow: 0,
      rows: [],
      inferred: true,
    })

    const out = await run("read_numbers")

    // The one step that fills it, named. "No data" is a sentence a model
    // repeats and a person cannot act on.
    expect(out).toMatch(/Read my posts/)
    expect(out).toMatch(/sources/)
    expect(out).toMatch(/their own median/)
  })

  it("tells an unscorable corpus apart from an empty one", async () => {
    getNumbers.mockResolvedValue({
      scored: 0,
      skipped: 57,
      median: 0,
      mean: 0,
      from: null,
      to: null,
      fromAxis: null,
      toAxis: null,
      byDate: [],
      outliers: 0,
      below: 0,
      best: 0,
      linkRepliesBelow: 0,
      rows: [],
      inferred: true,
    })

    const out = await run("read_numbers")

    // Sending somebody to connect an account they already connected is the
    // worse of the two mistakes — the same split /numbers draws on the page.
    expect(out).toContain("57 of their posts are")
    expect(out).toMatch(/no reach figures/)
    expect(out).not.toMatch(/Read my posts/)
  })

  it("states the median first and scores every angle against it", async () => {
    getNumbers.mockResolvedValue({
      scored: 57,
      skipped: 3,
      median: 1_204,
      mean: 3_905,
      from: "Mar 3 2026",
      to: "Aug 20 2026",
      fromAxis: "Mar 2026",
      toAxis: "Aug 2026",
      byDate: [
        {
          id: "src_a",
          url: "",
          hook: "The oldest one.",
          date: "Mar 3",
          impressions: 400,
          replies: 1,
          multiple: 0.33,
        },
        {
          id: "src_b",
          url: "",
          hook: "I stopped paying to read the internet.",
          date: "Aug 20",
          impressions: 8_400,
          replies: 12,
          multiple: 6.98,
        },
      ],
      outliers: 9,
      below: 31,
      best: 74,
      linkRepliesBelow: 6,
      rows: [
        {
          id: "build-in-public",
          label: "Build in public",
          note: "",
          medianMultiple: 2.1,
          posts: [{ id: "src_b" }],
        },
        {
          id: "link-reply",
          label: "Link reply",
          note: "",
          medianMultiple: 0.4,
          posts: [{ id: "src_a" }],
        },
      ],
      inferred: true,
    })

    const out = await run("read_numbers")

    expect(out).toContain("Median 1,204 views")
    expect(out).toContain("9 of 57 cleared 3×")
    expect(out).toContain("31 of 57 fell under their own median")
    expect(out).toMatch(/Build in public/)
    // The newest post first: a median over five months says nothing about
    // whether the last five landed.
    expect(out).toMatch(/Most recent 2, newest first/)
    expect(out).toContain("I stopped paying to read the internet.")
    // The caveat that disappears by itself the day a riff publishes something.
    expect(out).toMatch(/inferred, not recorded/)
  })
})

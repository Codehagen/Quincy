import { describe, expect, it } from "vitest"
import { readUIMessageStream, type ChatTransport } from "ai"

import {
  failingTransport,
  FIXTURE_POST,
  FIXTURE_VERSION_IDS,
  fixtureDraftActions,
  studioApprovedThread,
  studioAttachmentChat,
  studioDraftChat,
  studioRetryChat,
  studioStreamErrorChat,
  studioToolErrorChat,
} from "./chat-fixtures"
import { readableChatError } from "./chat-error"
import type { StudioUIMessage } from "./studio-message"
import { isHandledPart, planTurn, turnMood, type TurnBlock } from "./studio-turn"

/**
 * The parts renderer's plan, driven by the scripted fixtures through the real
 * stream reader: every snapshot useChat would render is planned here, so a
 * part state the transcript cannot draw fails a test instead of leaving a gap
 * on screen. Deterministic: no delays.
 */

type Snapshot = { message: StudioUIMessage; done: boolean }

/** Every intermediate message one assistant turn passes through. */
async function play(
  transport: ChatTransport<StudioUIMessage>,
  messages: StudioUIMessage[],
  trigger: "submit-message" | "regenerate-message" = "submit-message",
): Promise<{ snapshots: Snapshot[]; error: unknown }> {
  const stream = await transport.sendMessages({
    trigger,
    chatId: "test",
    messageId: undefined,
    messages,
    abortSignal: undefined,
  })
  const snapshots: Snapshot[] = []
  let error: unknown = null
  for await (const message of readUIMessageStream<StudioUIMessage>({
    stream,
    onError: (e) => {
      error = e
    },
  })) {
    snapshots.push({ message: structuredClone(message), done: false })
  }
  if (snapshots.length) snapshots[snapshots.length - 1].done = true
  return { snapshots, error }
}

function userTurn(text: string, id = `u-${text.length}`): StudioUIMessage {
  return { id, role: "user", parts: [{ type: "text", text }] }
}

function kinds(blocks: TurnBlock[]) {
  return blocks.map((b) => (b.kind === "work" ? `work(${b.steps.map((s) => (s.kind === "thinking" ? `thinking${s.live ? "*" : ""}` : `${s.state}`)).join(",")})` : b.kind))
}

function expectEveryPartHandled(snapshots: Snapshot[]) {
  for (const { message } of snapshots) {
    for (const part of message.parts) expect(isHandledPart(part), part.type).toBe(true)
  }
}

describe("the draft conversation", () => {
  it("thinks, reads, writes the card, then the words", async () => {
    const transport = studioDraftChat({ pace: 0 }).transport({ delayMs: undefined })
    const { snapshots, error } = await play(transport, [userTurn("Draft the second idea")])
    expect(error).toBeNull()
    expectEveryPartHandled(snapshots)

    const plans = snapshots.map(({ message, done }) => kinds(planTurn(message.parts, { live: !done })))

    // Thinking holds open while nothing visible has landed after it.
    expect(plans).toContainEqual(["work(thinking*)"])
    expect(plans).toContainEqual(["work(thinking*,running)"])
    // The card lands, and thinking folds the moment it does.
    const firstCard = plans.findIndex((p) => p.includes("draft"))
    expect(firstCard).toBeGreaterThan(-1)
    expect(plans[firstCard][0]).not.toContain("thinking*")
    // The source opened as an object, not a step.
    expect(plans[firstCard]).toContain("source")

    // The finished turn: thinking, the source, the receipt, the card, the words.
    const final = planTurn(snapshots.at(-1)!.message.parts)
    expect(kinds(final)).toEqual(["work(thinking)", "source", "work(done)", "draft", "text"])
  })

  it("streams the draft as preliminary outputs before the rows exist", async () => {
    const transport = studioDraftChat({ pace: 0 }).transport({ delayMs: undefined })
    const { snapshots } = await play(transport, [userTurn("Draft the second idea")])
    const drafts = snapshots.flatMap(({ message }) =>
      planTurn(message.parts, { live: true }).filter((b) => b.kind === "draft"),
    )
    const states = drafts.map((d) =>
      d.kind === "draft"
        ? d.part.state === "output-available" && "streaming" in d.part.output && d.part.output.streaming
          ? "writing"
          : d.part.state
        : "",
    )
    expect(states).toContain("input-available")
    expect(states).toContain("writing")
    expect(states.at(-1)).toBe("output-available")
  })

  it("puts the friend in the state the turn is in", async () => {
    const transport = studioDraftChat({ pace: 0 }).transport({ delayMs: undefined })
    const { snapshots } = await play(transport, [userTurn("Draft the second idea")])
    const moods = snapshots.map(({ message, done }) => turnMood(planTurn(message.parts, { live: !done }), { live: !done }))
    expect(moods).toContain("reading")
    expect(moods).toContain("writing")
    expect(moods.at(-1)).toBe("waiting")
    const final = planTurn(snapshots.at(-1)!.message.parts)
    expect(turnMood(final, { decided: () => true })).toBe("idle")
  })

  it("plays the revision as the next turn", async () => {
    const chat = studioDraftChat({ pace: 0 })
    const transport = chat.transport({ delayMs: undefined })
    const first = await play(transport, [userTurn("Draft the second idea")])
    const reply = first.snapshots.at(-1)!.message
    const { snapshots } = await play(transport, [userTurn("Draft the second idea"), reply, userTurn("Make the LinkedIn one shorter")])
    const final = planTurn(snapshots.at(-1)!.message.parts)
    expect(kinds(final)).toEqual(["work(thinking)", "draft", "text"])
  })
})

describe("failures", () => {
  it("a failed request reads as a sentence, and the retry gets the reply", async () => {
    const transport = failingTransport(studioRetryChat({ pace: 0 }).transport({ delayMs: undefined }))
    const messages = [userTurn("What should I write about this week?")]
    const failed = await play(transport, messages).catch((e: unknown) => e)
    expect(failed).toBeInstanceOf(Error)
    expect(readableChatError(failed as Error)).toBe("I could not answer just then. Try again in a minute.")

    const { snapshots, error } = await play(transport, messages, "regenerate-message")
    expect(error).toBeNull()
    expect(kinds(planTurn(snapshots.at(-1)!.message.parts))).toEqual(["work(thinking,done)", "text"])
  })

  it("a tool that throws and a write that refuses are steps that say why", async () => {
    const transport = studioToolErrorChat({ pace: 0 }).transport({ delayMs: undefined })
    const { snapshots } = await play(transport, [userTurn("Draft the onboarding idea and check the week")])
    expectEveryPartHandled(snapshots)
    const final = planTurn(snapshots.at(-1)!.message.parts)
    expect(kinds(final)).toEqual(["work(failed,failed)", "text"])
    const work = final[0]
    if (work.kind !== "work") throw new Error("expected work")
    expect(work.steps.map((s) => (s.kind === "step" ? [s.label, s.reason] : []))).toEqual([
      ["Could not read the week.", "The lineup did not answer in time."],
      ["Could not draft it.", "Not drafted: your free day has ended. See plans to keep drafting."],
    ])
  })

  it("a reply that breaks off keeps the words that arrived", async () => {
    const transport = studioStreamErrorChat({ pace: 0 }).transport({ delayMs: undefined })
    const { snapshots, error } = await play(transport, [userTurn("Turn yesterday's PR into a post")])
    expect(error).not.toBeNull()
    expect(kinds(planTurn(snapshots.at(-1)!.message.parts))).toEqual(["text"])
  })
})

describe("attachments", () => {
  it("the person's files come first in their turn", () => {
    const [user] = studioAttachmentChat().get(1)
    const blocks = planTurn(user.parts)
    expect(kinds(blocks)).toEqual(["files", "text"])
    const files = blocks[0]
    if (files.kind !== "files") throw new Error("expected files")
    expect(files.files[0].filename).toBe("call-notes-thursday.md")
  })
})

describe("history", () => {
  it("a finished thread plans without live thinking", () => {
    const [, reply] = studioApprovedThread()
    expect(kinds(planTurn(reply.parts))).toEqual(["draft", "text"])
  })

  it("skips empty text and step boundaries", () => {
    const blocks = planTurn([
      { type: "step-start" },
      { type: "text", text: "  " },
      { type: "text", text: "Hello." },
    ])
    expect(kinds(blocks)).toEqual(["text"])
  })

  it("a dynamic or unknown tool still gets a sentence", () => {
    const blocks = planTurn([
      { type: "dynamic-tool", toolName: "remove_silences", toolCallId: "c1", state: "output-available", input: {}, output: "ok" },
    ])
    expect(blocks[0].kind === "work" && blocks[0].steps[0]).toMatchObject({ state: "done", label: "Remove silences" })
  })
})

describe("fixture draft actions", () => {
  it("approve places the version and undo reopens it", async () => {
    const actions = fixtureDraftActions({ latency: 0, now: () => new Date("2026-11-17T07:40:00Z") })
    const id = FIXTURE_VERSION_IDS.linkedin
    expect((await actions.read(id)).ok).toBe(false)
    const approved = await actions.approve(id, FIXTURE_POST, "")
    expect(approved).toMatchObject({ ok: true, placement: { scheduled: true } })
    expect(await actions.read(id)).toMatchObject({ ok: true, state: "approved" })
    await actions.reopen(id)
    expect(await actions.read(id)).toMatchObject({ ok: true, state: "writing" })
  })
})

describe("which card is live for a version", () => {
  it("a revision in a later turn makes the earlier card a snapshot", async () => {
    const { currentToolCallIds } = await import("./studio-turn")
    const chat = studioDraftChat({ pace: 0 })
    const transport = chat.transport({ delayMs: undefined })
    const first = (await play(transport, [userTurn("Draft the second idea")])).snapshots.at(-1)!.message
    const second = (await play(transport, [userTurn("Draft the second idea"), first, userTurn("Make the LinkedIn one shorter")])).snapshots.at(-1)!.message
    const draftCall = (m: StudioUIMessage) => m.parts.find((p) => p.type === "tool-draft_angle" || p.type === "tool-revise_version")
    const ids = currentToolCallIds([first, second])
    const firstCall = draftCall(first)
    const secondCall = draftCall(second)
    if (!firstCall || !("toolCallId" in firstCall) || !secondCall || !("toolCallId" in secondCall)) throw new Error("expected draft calls")
    expect(ids.get(FIXTURE_VERSION_IDS.linkedin)).toBe(secondCall.toolCallId)
    expect(ids.get(FIXTURE_VERSION_IDS.x)).toBe(firstCall.toolCallId)
  })
})

describe("Stop", () => {
  it("a draft cut off mid-turn is a stopped step, not a card that writes forever", async () => {
    const transport = studioDraftChat({ pace: 0 }).transport({ delayMs: undefined })
    const { snapshots } = await play(transport, [userTurn("Draft the second idea")])
    const isDraft = (p: { type: string }) => p.type === "tool-draft_angle"
    const opened = snapshots.find(({ message }) => message.parts.some((p) => isDraft(p) && "state" in p && p.state === "input-available"))!
    const writing = snapshots.find(({ message }) =>
      message.parts.some((p) => isDraft(p) && "output" in p && (p.output as { streaming?: boolean })?.streaming),
    )!
    for (const { message } of [opened, writing]) {
      const blocks = planTurn(message.parts, { live: false })
      expect(blocks.some((b) => b.kind === "draft")).toBe(false)
      const steps = blocks.flatMap((b) => (b.kind === "work" ? b.steps : []))
      expect(steps.at(-1)).toMatchObject({ state: "failed", label: "Stopped while writing the draft." })
    }
  })
})

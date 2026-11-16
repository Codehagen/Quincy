import { createChat } from "@shadcn/helpers/ai-sdk"
import type { ChatTransport, UIMessage } from "ai"

import type { StudioUIMessage } from "../studio-message"
import { draftOutput, FIXTURE_NOW, FIXTURE_POST, fixtureVersion, type FixturePace } from "./shared"

/**
 * A transport that refuses its first `failures` requests the way /api/chat
 * does (a JSON body that useChat surfaces as the error's message, read back
 * by lib/chat-error.ts), then hands over to `inner`. Retry is the real
 * `regenerate()`: the second request reaches the script.
 *
 * A wrapper rather than a scripted `error()` turn because a script replays
 * the same turn on regenerate, so a scripted failure would fail forever.
 */
export function failingTransport<MESSAGE extends UIMessage>(
  inner: ChatTransport<MESSAGE>,
  {
    failures = 1,
    error = "I could not answer just then. Try again in a minute.",
  }: { failures?: number; error?: string } = {},
): ChatTransport<MESSAGE> {
  let left = failures
  return {
    async sendMessages(options) {
      if (left > 0) {
        left -= 1
        throw new Error(JSON.stringify({ error }))
      }
      return inner.sendMessages(options)
    },
    reconnectToStream: (options) => inner.reconnectToStream(options),
  }
}

/** The reply that arrives once the failed request is retried. */
export function studioRetryChat({ pace = 1 }: FixturePace = {}) {
  return createChat<StudioUIMessage>({ now: FIXTURE_NOW, messageIdPrefix: "fixture-msg" })
    .user("What should I write about this week?")
    .assistant(({ writer }) => {
      writer.reasoning("Check what is waiting before suggesting anything.").sleep(200 * pace)
      writer.tool("read_riffs").sleep(500 * pace).output("1 riff waiting.")
      writer.text(
        "One thing is waiting: the onboarding cut from yesterday's merged PR. It has a number, 41% to 68%.\n\nWant it as a draft?",
      )
    })
}

/**
 * Tools that fail, two ways: a read that throws (an `output-error` part) and a
 * write that refuses (`{ ok: false }`, the shape lib/riff-writes.ts returns
 * for a lapsed trial or a cooldown). Both are a sentence in the receipt, in
 * ink, never red (docs/design/states.md).
 */
export function studioToolErrorChat({ pace = 1 }: FixturePace = {}) {
  return createChat<StudioUIMessage>({ now: FIXTURE_NOW, messageIdPrefix: "fixture-msg" })
    .user("Draft the onboarding idea and check the week")
    .assistant(({ writer }) => {
      writer.tool("read_lineup").sleep(400 * pace).error("The lineup did not answer in time.")
      writer
        .tool("draft_angle", { input: { angleId: "ang_2" } })
        .sleep(600 * pace)
        .output({ ok: false, message: "Not drafted: your free day has ended. See plans to keep drafting." })
      writer.text("I could not draft it: the free day has ended. Nothing was charged.")
    })
}

/**
 * A reply that breaks off mid-stream: the words that arrived stay, and the
 * error stands under them with Try again.
 */
export function studioStreamErrorChat({ pace = 1 }: FixturePace = {}) {
  return createChat<StudioUIMessage>({ now: FIXTURE_NOW, messageIdPrefix: "fixture-msg" })
    .user("Turn yesterday's PR into a post")
    .assistant(({ writer }) => {
      writer.text("Reading the merge first, then").sleep(400 * pace)
      writer.error("The connection dropped.")
    })
}

/** A finished thread with an approved draft in it, for a snapshot. */
export function studioApprovedThread(): StudioUIMessage[] {
  const linkedin = fixtureVersion("linkedin", FIXTURE_POST, { state: "approved" })
  return createChat<StudioUIMessage>({ now: FIXTURE_NOW, messageIdPrefix: "fixture-msg" })
    .user("Draft the second idea")
    .assistant(({ writer }) => {
      writer.tool("draft_angle", { input: { angleId: "ang_2" } }).output(draftOutput([linkedin]))
      writer.text("Drafted. It is held for your read.")
    })
    .get()
}

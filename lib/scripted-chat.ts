import { createChat } from "@shadcn/helpers/ai-sdk"

/**
 * A conversation written in code. No model, no route, no key, no network.
 *
 * This exists so the chat surface can be built and exercised before the gateway
 * has a credit balance, and so a UI change can be checked against a fixed
 * transcript instead of whatever the model happens to say that run. It is a
 * development transport, never a fallback in production — a scripted answer
 * presented as a real one is worse than an error.
 *
 * The turns below deliberately cover every part type the surface renders:
 * reasoning, a tool that succeeds, a tool that fails, and text.
 *
 * Text means markdown, and the first turn is written to prove it — a heading, a
 * list, bold, inline code. The earlier script was three plain paragraphs, so
 * the transcript rendering `**bold**` as literal asterisks looked exactly like
 * a working surface for as long as this was the only thing anyone tested it
 * against. The second turn stays deliberately plain: it is a draft post, the
 * text goes out as typed, and it is the control that says markdown does not
 * touch what has no markup in it.
 *
 * The `sleep` calls are what make the states observable — without latency a
 * tool goes from called to resolved in one frame and you never see the middle.
 */
export const scriptedChat = createChat()
  .user("What did I ship this week that is worth writing about?")
  .assistant(({ writer }) => {
    writer
      .reasoning(
        "Two candidates. The sidebar rework is visible but ordinary. The Tailwind comment-scanning find is specific and checkable, which is the rarer thing. Let me look at what actually landed before picking."
      )
      .sleep(400)

    writer
      .tool("searchSources", { input: { since: "7d", sources: ["github"] } })
      .sleep(900)
      .output({
        commits: 24,
        highlights: [
          "sidebar navigation and route group",
          "Tailwind scans comments — dead CSS rules",
          "MessageScroller height ceiling",
        ],
      })

    writer.text(
      "## Three things landed\n\nOnly one of them is worth a post.\n\n1. **The Tailwind find.** Naming a utility inside a code comment ships that class for real, applied to nothing. Specific, surprising, and a reader can check it in their own bundle in thirty seconds.\n2. The sidebar rework. Good work, unremarkable to anyone outside the repo.\n3. The `MessageScroller` height ceiling. Same.\n\nThe first one has the shape a post needs: a claim you did not expect, and a way to test it yourself.\n\nWant it as a short post or a thread?"
    )
  })
  .user("Short post. Keep it in my voice.")
  .assistant(({ writer }) => {
    writer.reasoning("Short declarative lines, no preamble, land the point in the first sentence.").sleep(300)

    writer.tool("readVoice", { input: { profile: "default" } }).sleep(600).output({
      tone: "direct",
      avoid: ["hedging", "rhetorical questions"],
    })

    writer.text(
      "Here is a draft:\n\nTailwind v4 scans raw file text, not just JSX.\n\nSo this comment:\n// Never use transition-all\n\nships .transition-all in your bundle. Applied to nothing. Just sitting there.\n\nFound it while auditing a sidebar. Two comments and one line of AGENTS.md were generating dead rules.\n\nFix: @source not \"../**/*.md\", and stop naming classes in prose.\n\n514 bytes back. Not the point — the point is that build success proved nothing."
    )
  })
  .user("Schedule it for tomorrow morning.")
  .assistant(({ writer }) => {
    writer.reasoning("Needs the Lineup surface, which is not built yet.").sleep(250)

    writer
      .tool("schedulePost", { input: { when: "tomorrow 08:00 CET" } })
      .sleep(700)
      .error("Lineup is not connected yet — no scheduling backend.")

    writer.text(
      "Cannot schedule yet — Lineup has no backend behind it. The draft is saved. Connect a destination in Sources and I will queue it."
    )
  })

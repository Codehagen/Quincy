import { createChat } from "@shadcn/helpers/ai-sdk"

import type { StudioUIMessage } from "../studio-message"
import {
  draftOutput,
  FIXTURE_NOW,
  FIXTURE_POST,
  FIXTURE_POST_SHORT,
  FIXTURE_POST_X,
  fixtureVersion,
  growing,
  writingOutput,
  type FixturePace,
} from "./shared"

/**
 * The Studio story, scripted: the greeting's chip, Quincy thinking, reading
 * the merged PR, the draft streaming in as a card, a revision, and the end of
 * the script. Approve happens on the card (fixture draft actions), never in
 * the chat: nothing publishes from here.
 *
 * Every turn is typed against `StudioUIMessage`, so a renamed tool or a new
 * output shape breaks this file at compile time.
 *
 * A factory, not a constant: a chat keeps id counters, and two mounts sharing
 * one would hand out each other's ids.
 */
export function studioDraftChat({ pace = 1 }: FixturePace = {}) {
  const linkedin = fixtureVersion("linkedin", FIXTURE_POST)
  const x = fixtureVersion("x", FIXTURE_POST_X)
  const steps = 6

  return createChat<StudioUIMessage>({
    now: FIXTURE_NOW,
    messageIdPrefix: "fixture-msg",
    toolCallIdPrefix: "fixture-call",
  })
    .user("Draft the second idea")
    .assistant(({ writer }) => {
      writer
        .reasoning(
          "The second idea is the onboarding cut. It has the number: 41% to 68%. Read the merge again so the post says what actually shipped, then write it in three beats.",
        )
        .sleep(300 * pace)

      writer
        .tool("read_source", { input: { ref: "#212" } })
        .sleep(700 * pace)
        .output({
          ok: true,
          url: "https://github.com/quincy/app/pull/212",
          title: "Cut onboarding from nine screens to three",
          excerpt:
            "Removed the team-size, role and ‘how did you hear’ steps. Moved the rest after the first project. Finished signup since Monday: 68%. The week before: 41%.",
          message: "PR #212, merged Mon 16:40.",
        })

      writer.tool("read_riffs").sleep(400 * pace).output("1 riff waiting. [ang_2] story: the onboarding cut.")

      const draft = writer.tool("draft_angle", { input: { angleId: "ang_2" } }).sleep(600 * pace)
      const li = growing(FIXTURE_POST, steps)
      const xs = growing(FIXTURE_POST_X, steps)
      for (let i = 0; i < steps; i++) {
        draft
          .output(
            writingOutput([
              { ...linkedin, body: li[i] },
              ...(i >= 2 ? [{ ...x, body: xs[i] }] : []),
            ]),
            { preliminary: true },
          )
          .sleep(220 * pace)
      }
      draft.output(draftOutput([linkedin, x]))

      writer.text(
        "Drafted in three beats: what you did, the number, what it meant. One for LinkedIn, one for X.\n\nIt is held for your read. **Nothing goes out until you approve it.**",
      )
    })
    .user("Make the LinkedIn one shorter")
    .assistant(({ writer }) => {
      writer.reasoning("Keep the three beats and the number. Cut the words around them.").sleep(250 * pace)
      writer
        .tool("revise_version", {
          input: {
            versionId: linkedin.versionId,
            instruction: "Make the LinkedIn one shorter",
            expectedUpdatedAt: linkedin.updatedAt,
          },
        })
        .sleep(900 * pace)
        .output(
          draftOutput([{ ...linkedin, body: FIXTURE_POST_SHORT }], {
            message:
              "Revised the LinkedIn version. The writing is in this conversation. Nothing goes out until you approve.",
          }),
        )
      writer.text("Shorter by a third. The number still sits on its own line.")
    })
}

/** What the scripted transport says once the script has run out. */
export const STUDIO_FALLBACK =
  "That is the end of the scripted conversation. Clear NEXT_PUBLIC_CHAT_TRANSPORT to talk to the real model."

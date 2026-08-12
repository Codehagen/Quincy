import { tool, type Tool } from "ai"
import { z } from "zod"

import { draftAngle } from "@/app/(app)/riffs/actions"
import { listConnections } from "./channels"
import { countWaiting, getDrafts } from "./drafts"
import { countQueued, getLineup } from "./lineup"
import { getRiffs } from "./riffs"
import { getSourceConnections } from "./sources"

/**
 * What the Studio chat can actually do, as opposed to talk about.
 *
 * The README calls the chat the primary interface and says every other page is
 * a window onto the same agent state. Until this file existed that was half
 * true: the pages read the tables and the chat read nothing. `streamText` was
 * called with a system prompt, the rendered brain, and no `tools` at all — so
 * asked "what is waiting for me?", the model could describe the product's
 * design and could not name a single riff. The one agent in the repo that
 * called tools was the video editor's (lib/editor/agent.ts), which is the shape
 * this follows.
 *
 * ## Reads are the whole surface, and one write is the exception
 *
 * Six tools read. One drafts. Nothing approves, schedules or publishes, and
 * that is not an oversight to be fixed later — it is the product's single
 * invariant. `docs/vision.md`: **Quincy drafts, you send.** A tool that could
 * schedule would make the chat the one place in the app where writing goes out
 * without a person pressing Approve, and it would do it in the surface where
 * the user is least able to see what was decided on their behalf.
 *
 * The drafting tool is not a hole in that rule; it is the rule working. A draft
 * lands in /drafts unapproved, exactly where "Draft this" on /riffs puts it,
 * and waits.
 *
 * ## Why the write tool is a call into the server action
 *
 * `draftAngle` already owns the hard parts: it proves the angle belongs to this
 * user rather than trusting an id, refuses a second charge for a draft that
 * already exists, checks entitlement, holds a spend cooldown, and meters what
 * the model cost. Reimplementing any of that here would be a second copy of the
 * money path, and the second copy is the one that goes wrong. It reads the
 * session from the request itself, so calling it inside a tool is the same user
 * it was already the same user for.
 *
 * ## The tools return prose, not rows
 *
 * Every read below renders its result into a sentence a model can quote rather
 * than a JSON structure it has to summarise. Two reasons. A model handed twelve
 * fields per row will faithfully read them back — and this product's whole
 * argument is that a dashboard is the wrong answer, so a chat that recites
 * tables is a dashboard with extra steps. And a bounded string is a bounded
 * number of tokens, where an array of drafts is however many drafts you have,
 * inside a loop that can call it repeatedly.
 */

/** Who the tools act for. Read from the session by the route, never from a body. */
export type ChatUser = {
  id: string
  email: string
  timezone?: string | null
}

/**
 * Enough steps to look, act, and say something about it.
 *
 * The same bound and the same reason as `MAX_STEPS` in the editor agent: a
 * model that cannot make progress keeps calling the cheapest tool it has, and
 * a loop that spends money has to end on its own. Six covers the realistic
 * worst case — read the riffs, read the channels, draft, confirm — with room
 * for one wrong turn.
 *
 * The per-day ceiling in lib/chat-guards.ts is the other half. This bounds one
 * turn; that bounds the day.
 */
export const MAX_CHAT_STEPS = 6

/** How many items a single read will name before it starts counting instead. */
const LIST_LIMIT = 8

/** "3 things" / "1 thing", without a stray plural in the model's mouth. */
function count(n: number, singular: string, plural = `${singular}s`) {
  return `${n} ${n === 1 ? singular : plural}`
}

export function chatTools(user: ChatUser): Record<string, Tool> {
  return {
    read_riffs: tool({
      description:
        "The raw material waiting to be decided on, and the angles Quincy sees in each. Use before suggesting what to write, and to find the angle id that draft_angle needs. An angle marked drafted has already been written.",
      inputSchema: z.object({}),
      execute: async () => {
        const riffs = await getRiffs(user)

        if (riffs.length === 0) {
          return "Nothing is waiting. Riffs arrive from a voice note, a recorded meeting, a merged pull request, or a post pasted in — see /sources for what is connected."
        }

        const lines = riffs.slice(0, LIST_LIMIT).map((riff) => {
          const angles = riff.angles
            .map(
              (angle) =>
                `  - [${angle.id}] ${angle.shape}: “${angle.hook}” — ${angle.why}${
                  angle.status === "drafted" ? " (already drafted)" : ""
                }`
            )
            .join("\n")

          return [
            `From ${riff.sourceLabel}, ${riff.capturedAt}: “${riff.scrap.slice(0, 400)}”`,
            angles || "  - No angles yet.",
          ].join("\n")
        })

        const more =
          riffs.length > LIST_LIMIT
            ? `\n\n…and ${riffs.length - LIST_LIMIT} more.`
            : ""

        return `${count(riffs.length, "riff")} waiting.\n\n${lines.join("\n\n")}${more}`
      },
    }),

    read_drafts: tool({
      description:
        "Pieces that have been written and are waiting for the user to approve them, with the state of each channel version. Use to answer what is waiting, and before offering to write something that may already exist.",
      inputSchema: z.object({}),
      execute: async () => {
        const drafts = await getDrafts(user)

        if (drafts.length === 0) {
          return "Nothing is drafted. Drafts come from an angle on /riffs — draft_angle is how one gets written."
        }

        const lines = drafts.slice(0, LIST_LIMIT).map((piece) => {
          const versions = piece.versions
            .map(
              (version) =>
                `  - ${version.label}: ${
                  version.state === "approved"
                    ? version.goingOut
                      ? `approved, going out ${version.goingOut}`
                      : "approved, no time yet"
                    : "waiting for you"
                }`
            )
            .join("\n")

          return `“${piece.idea}”\n${versions}`
        })

        // The numbers the user actually asks for, computed rather than counted
        // by the model — which would get them wrong on a piece that is half
        // approved. Two numbers because they are two different questions: how
        // many pieces still need you, and how many decisions that is.
        const waiting = countWaiting(drafts)

        return `${count(drafts.length, "piece")}. ${count(waiting.drafts, "piece")} still ${waiting.drafts === 1 ? "needs" : "need"} you, ${count(waiting.versions, "version")} in total.\n\n${lines.join("\n\n")}`
      },
    }),

    read_lineup: tool({
      description:
        "What is scheduled to go out over the next seven days, and the standing slots it fills. Use for 'what is going out', 'when does that post', 'is anything queued'.",
      inputSchema: z.object({}),
      execute: async () => {
        const { days, slots } = await getLineup(user)
        const queued = countQueued(days).entries

        if (queued === 0) {
          return slots.length === 0
            ? "Nothing is scheduled and there are no standing slots. Slots are set on /lineup; approving a draft places it in the next free one."
            : `Nothing is scheduled. There ${slots.length === 1 ? "is" : "are"} ${count(slots.length, "standing slot")} waiting to be filled — approving a draft places it in the next free one.`
        }

        const lines = days
          .filter((day) => day.entries.length > 0)
          .map((day) => {
            const entries = day.entries
              .map(
                (entry) =>
                  `  - ${entry.time} ${entry.channelLabel}: “${entry.idea}”`
              )
              .join("\n")
            return `${day.label}\n${entries}`
          })

        return `${count(queued, "post")} scheduled in the next seven days.\n\n${lines.join("\n\n")}`
      },
    }),

    read_channels: tool({
      description:
        "Which channels this account can publish to, and whether any need reconnecting. Use before promising a draft for a channel — a piece written for a channel that is not connected cannot go anywhere.",
      inputSchema: z.object({}),
      execute: async () => {
        const connections = await listConnections(user.id)

        if (connections.length === 0) {
          return "No channel is connected, so nothing can publish. X and LinkedIn are connected on /channels."
        }

        const lines = connections.map((connection) => {
          const who = connection.handle ? ` (@${connection.handle})` : ""
          const state =
            connection.state === "active"
              ? "connected"
              : connection.state === "needs_reauth"
                ? "needs reconnecting — it cannot publish until it is"
                : "revoked — it cannot publish"
          return `- ${connection.channel}${who}: ${state}`
        })

        return `${count(connections.length, "channel")}.\n${lines.join("\n")}`
      },
    }),

    read_sources: tool({
      description:
        "Which sources of raw material are connected, and whether anything is arriving from them. Use when the user asks why nothing is waiting, or what Quincy is listening to.",
      inputSchema: z.object({}),
      execute: async () => {
        const connections = await getSourceConnections(user)
        const entries = Object.entries(connections)

        if (entries.length === 0) {
          return "No source is connected, so no raw material arrives on its own. Sources are connected on /sources; a post can also be pasted straight into /riffs."
        }

        const lines = entries.map(([source, connection]) => {
          switch (connection.state) {
            case "arriving":
              return `- ${source}: arriving, last ${connection.lastAt}`
            case "waiting":
              return `- ${source}: connected ${connection.since}, nothing has arrived yet`
            case "paused":
              return `- ${source}: paused, last ${connection.lastAt}`
            case "broken":
              return `- ${source}: broken, last ${connection.lastAt} — it needs attention on /sources`
          }
        })

        return `${count(entries.length, "source")} connected.\n${lines.join("\n")}`
      },
    }),

    draft_angle: tool({
      description:
        "Write an angle into a draft, one version per channel this account publishes to. The draft waits on /drafts for the user to approve — this never publishes and never schedules. Takes the angle id from read_riffs. Costs a model call, so do it when asked, not speculatively.",
      inputSchema: z.object({
        angleId: z
          .string()
          .describe(
            "The id in square brackets from read_riffs, e.g. ang_… — not the hook text."
          ),
      }),
      execute: async ({ angleId }) => {
        const result = await draftAngle({ angleId })

        if (!result.ok) {
          // The action's own sentence, not a paraphrase. It knows whether this
          // was a lapsed trial, a cooldown, an angle that does not exist, or a
          // model that failed, and each wants a different answer from the user.
          return `Not drafted: ${result.message}`
        }

        if (result.existing) {
          return "That angle was already drafted — it is on /drafts, waiting for you. Nothing was written twice and nothing was charged."
        }

        const where = result.channels.length
          ? ` One version per channel: ${result.channels.join(", ")}.`
          : ""

        /**
         * Named, not summarised as a boolean.
         *
         * `fellBack` is the list of channels whose body is the hook repeated
         * back rather than a written post, and a draft can fall back on one
         * channel and succeed on another. Reporting "it failed" would be wrong
         * about the ones that worked; reporting nothing is how a hook reached
         * /drafts on 2026-08-08 looking like writing.
         */
        const fell = result.fellBack.length
          ? ` Quincy could not write ${result.fellBack.join(", ")} this time, so ${result.fellBack.length === 1 ? "that version is" : "those versions are"} the hook itself and need your rewrite.`
          : ""

        const long = result.overLimit.length
          ? ` ${result.overLimit.join(", ")} came out over the platform limit and needs cutting.`
          : ""

        return `Drafted.${where} It is on /drafts waiting for you to approve it. Nothing goes out until you do.${fell}${long}`
      },
    }),
  }
}

import { tool, type Tool } from "ai"
import { z } from "zod"

import { captureToRiff, draftAngle } from "@/app/(app)/riffs/actions"
import { getStory, renderStory } from "./brain"
import { listConnections } from "./channels"
import { corpusSummary } from "./corpus-x"
import { countWaiting, getDrafts } from "./drafts"
import { countQueued, getLineup } from "./lineup"
import { endsOf, formatMultiple, getNumbers, OUTLIER_GATE } from "./numbers"
import { getRiffs, readSourceByRef, type SourceRef } from "./riffs"
import {
  describeFacts,
  MAX_FOR_USER_CHARS,
  readShippedBeats,
  readShippedFacts,
} from "./shipped-work"
import { getSourceConnections } from "./sources"
import { resolveTimeZone } from "./timezone"

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
 * ## Reads are most of the surface, and two writes complete a loop
 *
 * Eight tools read. Two write: one captures material, one drafts from it.
 * Nothing approves, schedules or publishes, and that is not an oversight to be
 * fixed later — it is the product's single invariant. `docs/vision.md`:
 * **Quincy drafts, you send.** A tool that could schedule would make the chat
 * the one place in the app where writing goes out without a person pressing
 * Approve, and it would do it in the surface where the user is least able to
 * see what was decided on their behalf.
 *
 * Neither write is a hole in that rule; both are the rule working. A captured
 * riff is material waiting for a decision, and a draft lands in /drafts
 * unapproved, exactly where "Draft this" on /riffs puts it.
 *
 * **`capture_riff` is what makes the chat the front door it claims to be.**
 * Without it the read tools could describe the desk and nothing could put
 * anything on it: on 2026-08-13 the user pasted a video script into the chat
 * and Quincy correctly answered that it could not act on it, because
 * `draft_angle` needs an angle id and pasted text has none. The model then
 * offered to write the post directly in the conversation — which is the wrong
 * fix, and the reason this tool exists rather than a looser drafting one.
 * Writing that never becomes a draft never reaches /drafts, is never approved,
 * is never scheduled, and is never metered against the piece it belongs to.
 * Material has to enter the product through the same door on every surface.
 *
 * ## Why both writes are calls into server actions
 *
 * `captureToRiff` and `draftAngle` already own the hard parts: it proves the angle belongs to this
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
 * **Rechecked when `read_source`, `read_story` and `read_numbers` landed, and
 * left at six.** The longest path the new tools open is the one they were built
 * for: read the merge, open the story it belongs to, draft the angle, say what
 * happened. That is four, and the two reads it adds cost nothing but tokens —
 * neither calls a model. Raising the bound would buy a model that is lost two
 * more attempts at being lost.
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

/** How many of the most recent posts `read_numbers` names one by one. */
const RECENT_POSTS = 5

/**
 * How much of one riff's scrap a read will show.
 *
 * It was 400, and 400 was chosen when a riff was a pasted tweet. Every live
 * GitHub scrap is longer than that, so the chat's answer to "what is waiting?"
 * was a pull request title and the first sentence under it — enough to know a
 * merge exists and never enough to reason about one. 4 KB holds the median
 * description whole (3,369 characters, measured across this repository's own
 * merges in lib/shipped-work.ts) and still bounds a list of eight.
 */
const MAX_SCRAP_CHARS = 4_000

/**
 * The ceiling on one `read_source` answer.
 *
 * A source item can carry 19,200 characters of description alone, plus commits,
 * files and patch samples. This is a tool result that goes back into the model's
 * context on every subsequent step of the same turn, so the cost is paid again
 * at each step — a bound here is a bound on the whole turn.
 *
 * The scrap and the patches are rendered last precisely so that this cut lands
 * on them: the brief, the beats, the refusal and the angle ids are what the
 * next tool call needs, and they are short.
 */
const MAX_SOURCE_CHARS = 12_000

/** The most of one stored patch sample a read will show. */
const MAX_PATCH_CHARS = 2_000

/**
 * Cut, and say so.
 *
 * A silent truncation is the one failure a model cannot detect: it reads a
 * sentence that stops mid-clause as a sentence that ended, and writes from it.
 */
function cut(text: string, cap: number): string {
  if (text.length <= cap) return text
  return `${text.slice(0, cap)}\n…[cut — ${text.length - cap} more characters not shown]`
}

/** jsonb, narrowed rather than cast. Arrays are not records. */
function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** One line of a stored field: whitespace collapsed, bounded, or "". */
function line(value: unknown, cap = 600): string {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, cap)
    : ""
}

/**
 * What the ingest wrote about the merge in plain words, when it did.
 *
 * Optional by contract and absent on every row written before it existed, so
 * every reader here answers "" rather than throwing. `source_item.meta` is
 * jsonb the platform and the ingest both write into, and the schema's own rule
 * is that it is never parsed for logic — reading strings out of it defensively
 * is the exception that rule anticipates.
 */
function readBrief(meta: Record<string, unknown>): string {
  return line(meta.brief, 600)
}

type Material = {
  commits: string[]
  files: { name: string; additions: number; deletions: number }[]
  issues: { number: number; title: string }[]
  patches: { name: string; patch: string }[]
  truncated: string[]
}

const NO_MATERIAL: Material = {
  commits: [],
  files: [],
  issues: [],
  patches: [],
  truncated: [],
}

function readMaterial(meta: Record<string, unknown>): Material {
  const row = asRecord(meta.material)
  if (!row) return NO_MATERIAL

  const strings = (value: unknown, cap: number): string[] =>
    Array.isArray(value) ? value.map((v) => line(v, cap)).filter(Boolean) : []

  const records = (value: unknown): Record<string, unknown>[] =>
    Array.isArray(value)
      ? value
          .map(asRecord)
          .filter((v): v is Record<string, unknown> => v !== null)
      : []

  const num = (value: unknown): number =>
    typeof value === "number" && Number.isFinite(value) ? value : 0

  return {
    commits: strings(row.commits, 200),
    files: records(row.files)
      .map((f) => ({
        name: line(f.name, 200),
        additions: num(f.additions),
        deletions: num(f.deletions),
      }))
      .filter((f) => f.name),
    issues: records(row.issues)
      .map((i) => ({ number: num(i.number), title: line(i.title, 200) }))
      .filter((i) => i.number || i.title),
    patches: records(row.patches)
      .map((p) => ({
        name: line(p.name, 200),
        // Not collapsed: a patch is only readable with its own line breaks.
        patch: typeof p.patch === "string" ? p.patch : "",
      }))
      .filter((p) => p.name && p.patch),
    truncated: strings(row.truncated, 200),
  }
}

/**
 * Why a merge left no riff, in either shape the column has held.
 *
 * `recordShippedRefusal` writes `{ refusal: "nothing-worth-keeping",
 * refusalWhy: "…" }` — two flat keys — and the ingest is moving to a nested
 * `{ reason, at }`. Both are read here rather than one, because the ten live
 * rows are in the old shape and a reader that only understood the new one
 * would report "no refusal recorded" about a refusal that is recorded.
 */
function readRefusal(
  meta: Record<string, unknown>
): { reason: string; why: string; at: string } | null {
  const nested = asRecord(meta.refusal)
  if (nested) {
    const reason = line(nested.reason, 200)
    const why = line(nested.why, 500) || line(meta.refusalWhy, 500)
    return reason || why ? { reason, why, at: line(nested.at, 40) } : null
  }

  const reason = line(meta.refusal, 200)
  if (!reason) return null
  return { reason, why: line(meta.refusalWhy, 500), at: "" }
}

/** The one question Quincy queued about this merge, if it asked one. */
function readQuestion(
  meta: Record<string, unknown>
): {
  text: string
  askedAt: string
  answer: string
  answeredAt: string
} | null {
  const row = asRecord(meta.question)
  if (!row) return null

  const text = line(row.text, 500)
  if (!text) return null

  return {
    text,
    askedAt: line(row.askedAt, 40),
    answer: line(row.answer, 1_000),
    answeredAt: line(row.answeredAt, 40),
  }
}

/**
 * `riff.context` as the writer is given it.
 *
 * The same three things `draftAngle` puts in front of `generateDraft`: what
 * changed for a user, the three beats in the order the post goes in, and the
 * facts about the repository. Rendered here so the chat can judge a merge
 * without leaving the conversation — it was reading a scrap with none of this
 * attached, which is the state of affairs that produced twelve angles and zero
 * drafts on 2026-08-24.
 *
 * Indented under the riff it belongs to, and every line omitted when the field
 * behind it is empty. A label with nothing after it is a fact the model will
 * try to fill.
 */
function describeContext(context: unknown): string {
  const row = asRecord(context)
  if (!row) return ""

  const lines: string[] = []

  const forUser = line(row.forUser, MAX_FOR_USER_CHARS)
  if (forUser) lines.push(`  What changed for a user: ${forUser}`)

  const beats = readShippedBeats(row.beats)
  if (beats.did) lines.push(`  What you did: ${beats.did}`)
  if (beats.happened) lines.push(`  What happened: ${beats.happened}`)
  if (beats.learned) lines.push(`  What it meant: ${beats.learned}`)

  // Only when there are facts. `describeFacts` prints "merged into a
  // repository" for an empty object, which is a sentence about nothing on a
  // voice note.
  if (asRecord(row.facts)) {
    for (const fact of describeFacts(readShippedFacts(row.facts)).split("\n")) {
      if (fact.trim()) lines.push(`  ${fact.trim()}`)
    }
  }

  return lines.join("\n")
}

/**
 * What the model called the thing it wants, turned into something a query can
 * resolve.
 *
 * Three shapes, because a person asking about their own merge uses all three:
 * "#282" and "282" are how it is spoken, the URL is what a browser copies, and
 * the id is what another tool just handed the model. Parsing happens here
 * rather than in the reader — deciding whether a string is a number or an id is
 * a judgment about a model's output, and the `where` clause should be given the
 * answer, not the question.
 *
 * A URL keeps its number as a fallback: the stored `url` is GitHub's own
 * `html_url` and somebody pasting from the address bar may carry `/files` or a
 * comment anchor on the end.
 */
export function parseSourceRef(raw: string): SourceRef | null {
  const ref = raw.trim()
  if (!ref) return null

  if (/^https?:\/\//i.test(ref)) {
    const found = /\/pull\/(\d+)/.exec(ref)
    return {
      by: "url",
      // The anchor and any trailing path are dropped, so a link to a comment
      // still matches the pull request it is on.
      url: ref.split("#")[0].replace(/\/(files|commits|checks)\/?$/, ""),
      number: found ? Number(found[1]) : null,
    }
  }

  if (/^#?\d+$/.test(ref)) {
    return { by: "number", number: Number(ref.replace("#", "")) }
  }

  return { by: "id", id: ref }
}

/**
 * What Quincy has read of this person's own published writing.
 *
 * Appended to `read_sources` rather than given a tool of its own, because the
 * question it answers is the one somebody is already asking when they ask what
 * Quincy can see.
 *
 * **This is the sentence that was missing on 2026-08-13.** Asked whether it
 * could see his past posts, Quincy answered that it had access to the connected
 * X account and stopped there — true, and useless. It had read none of it, and
 * one button on /sources would have changed that. A connected channel and a
 * read corpus are two different things: the first buys the right to publish,
 * the second buys the material and the voice. Nothing in the chat said so.
 *
 * The import is deliberately *not* a tool. It is a real purchase — X charges
 * about half a cent a post and the default is 200 — and this product puts a
 * spend of that size behind a button with a receipt rather than behind a
 * sentence a model decided to act on.
 */
async function corpusLine(userId: string): Promise<string> {
  const { items, newestPostedAt } = await corpusSummary(userId)

  if (items === 0) {
    return "\n\nQuincy has read none of your own published posts. That is a separate step from connecting a channel: press “Read my posts” on /sources and it reads your X timeline, which is what teaches it your voice. It costs about half a cent a post."
  }

  const newest = newestPostedAt
    ? `, the newest from ${newestPostedAt.toISOString().slice(0, 10)}`
    : ""

  return `\n\nQuincy has read ${count(items, "of your own posts", "of your own posts")}${newest}. Read my posts on /sources picks up anything newer.`
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

          /**
           * A riff that never finished, said plainly.
           *
           * `stuck` means the run that was reading it died — no angles came and
           * none are coming. Without this line the model sees a scrap with an
           * empty angle list and offers to write from it, which is an offer it
           * cannot keep: `draft_angle` needs an angle id and there is none. The
           * honest answer is that this one has to be recorded again.
           */
          const state = riff.stuck
            ? "  - Quincy lost this one; the run that was reading it stopped. It needs recording again."
            : riff.state === "failed"
              ? `  - This one failed${riff.failure ? `: ${riff.failure}` : "."}`
              : angles || "  - No angles yet; Quincy is still reading it."

          return [
            `From ${riff.sourceLabel}, ${riff.capturedAt}: “${cut(riff.scrap, MAX_SCRAP_CHARS)}”`,
            describeContext(riff.context),
            state,
          ]
            .filter(Boolean)
            .join("\n")
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
          /**
           * The handle is stored with its `@` already on it — `@CodeHagen`,
           * not `CodeHagen`. Adding another produced `@@CodeHagen` in the one
           * sentence whose whole job is to name the account correctly, and it
           * reached a real conversation before anybody noticed.
           */
          const who = connection.handle ? ` (${connection.handle})` : ""
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
          return `No source is connected, so no raw material arrives on its own. Sources are connected on /sources; a post can also be pasted straight into /riffs.${await corpusLine(user.id)}`
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

        return `${count(entries.length, "source")} connected.\n${lines.join("\n")}${await corpusLine(user.id)}`
      },
    }),

    read_source: tool({
      description:
        "One piece of delivered material, read back whole — a merged pull request by number (#282), by URL, or by source id. Returns the description in full, the plain-language brief, the commits, files and issues behind it, the beats, any refusal or open question, and the riffs already made from it with their angle ids. This is the first call for “help me post about #282”.",
      inputSchema: z.object({
        ref: z
          .string()
          .describe(
            'A pull request number ("#282" or "282"), its URL, or a source id.'
          ),
        includePatches: z
          .boolean()
          .optional()
          .describe(
            "Include the stored patch samples. Off by default: they are long, and a post is almost never about the diff."
          ),
      }),
      execute: async ({ ref, includePatches }) => {
        const parsed = parseSourceRef(ref)

        if (!parsed) {
          return "Nothing to look up. A ref is a pull request number like #282, the pull request URL, or a source id."
        }

        const item = await readSourceByRef({ userId: user.id, ref: parsed })

        if (!item) {
          return `Nothing of theirs matches “${ref}”. Only material delivered to this account can be read — try the pull request number (#282), its URL, or a source id. If the merge is recent, /sources says whether GitHub is still connected and whether anything is arriving.`
        }

        const meta = item.meta ?? {}
        const number = typeof meta.number === "number" ? meta.number : null
        const title = line(meta.title, 300)
        const repository = line(meta.repository, 200)
        const when = item.postedAt ?? item.createdAt
        const at = `${when.toISOString().slice(0, 16).replace("T", " ")} UTC`

        const parts: string[] = []

        parts.push(
          [
            `${number ? `#${number} ` : ""}${title || "Untitled"}`,
            `${item.source}${repository ? ` · ${repository}` : ""} · ${item.postedAt ? "merged" : "received"} ${at}`,
            item.url,
            `Source id: ${item.id}`,
          ]
            .filter(Boolean)
            .join("\n")
        )

        const brief = readBrief(meta)
        if (brief) parts.push(`In plain words:\n${brief}`)

        // Only for a merge. The facts reader answers an empty object with a
        // sentence about "a repository", which is worse than saying nothing.
        if (item.source === "github") {
          parts.push(
            describeFacts(
              readShippedFacts({
                ...meta,
                mergedAt: item.postedAt ? item.postedAt.toISOString() : "",
              })
            )
          )
        }

        const material = readMaterial(meta)

        if (material.commits.length) {
          parts.push(
            `Commits (${material.commits.length}):\n${material.commits
              .map((c) => `- ${c}`)
              .join("\n")}`
          )
        }

        if (material.files.length) {
          parts.push(
            `Files changed (${material.files.length}):\n${material.files
              .map((f) => `- ${f.name} +${f.additions} −${f.deletions}`)
              .join("\n")}`
          )
        }

        if (material.issues.length) {
          parts.push(
            `Issues:\n${material.issues
              .map((i) => `- #${i.number} ${i.title}`.trim())
              .join("\n")}`
          )
        }

        if (material.truncated.length) {
          parts.push(
            `Stored short of the whole thing: ${material.truncated.join(", ")}.`
          )
        }

        if (item.riffs.length === 0) {
          parts.push(
            "No riff came out of this one, so there is no angle id to draft from."
          )
        } else {
          for (const made of item.riffs) {
            const context = describeContext(made.context)
            const angles = made.angles
              .map(
                (angle) =>
                  `  - [${angle.id}] ${angle.shape}: “${angle.hook}” — ${angle.why}${
                    angle.drafted ? " (already drafted)" : ""
                  }`
              )
              .join("\n")

            parts.push(
              [
                `Riff ${made.id} (${made.state}${made.failure ? `: ${made.failure}` : ""}):`,
                context,
                angles ||
                  "  - No angles on it, so draft_angle has nothing to take.",
              ]
                .filter(Boolean)
                .join("\n")
            )
          }
        }

        const refusal = readRefusal(meta)
        if (refusal) {
          parts.push(
            `Quincy decided there was no post in this one${refusal.at ? ` on ${refusal.at.slice(0, 10)}` : ""}: ${refusal.reason}${refusal.why ? ` — ${refusal.why}` : ""}. That bar is deliberate. The way past it is material the merge did not carry, not a second attempt at the same material.`
          )
        }

        const question = readQuestion(meta)
        if (question) {
          parts.push(
            question.answer
              ? `Quincy asked: “${question.text}” They answered: “${question.answer}” That answer is the missing beat — write from it.`
              : `Quincy asked and has had no answer yet: “${question.text}”${question.askedAt ? ` (asked ${question.askedAt.slice(0, 10)})` : ""}`
          )
        }

        // Last, so the cut below lands here rather than on the beats and the
        // angle ids. The description is the material and is given whole.
        if (item.body.trim()) {
          parts.push(`What they wrote, in full:\n${item.body}`)
        }

        if (material.patches.length) {
          parts.push(
            includePatches
              ? material.patches
                  .map(
                    (p) =>
                      `Patch — ${p.name}:\n${cut(p.patch, MAX_PATCH_CHARS)}`
                  )
                  .join("\n\n")
              : `${count(material.patches.length, "patch sample")} stored and not shown. Call read_source again with includePatches: true if the post is about the code itself.`
          )
        }

        return cut(parts.join("\n\n"), MAX_SOURCE_CHARS)
      },
    }),

    read_story: tool({
      description:
        "One story from the brain, in full — the point it makes, the hooks used before, the user's own quotes, the published proof and the narrative. The story bank in your context lists titles only; call this before citing anything from one, and never invent a detail that is not in it.",
      inputSchema: z.object({
        title: z
          .string()
          .optional()
          .describe("The story title, exactly as the story bank lists it."),
        id: z
          .string()
          .optional()
          .describe("The page id or slug, if something handed you one."),
      }),
      execute: async ({ title, id }) => {
        const ref = (id ?? title ?? "").trim()

        if (!ref) {
          return "Which story? Pass the title as the story bank lists it."
        }

        const { page, titles } = await getStory(user.id, ref)

        if (!page) {
          return titles.length === 0
            ? "There are no stories in this brain yet. Stories are mined from published posts — /brain is where they live."
            : `No story called “${ref}”. The ones that exist: ${titles.join(", ")}.`
        }

        return renderStory(page)
      },
    }),

    read_numbers: tool({
      description:
        "How this person's published posts actually did, measured against their own median — never against a follower count. Use to argue with a draft, to say which angle earns its place, and to answer 'did that work'. Reads stored numbers; costs nothing.",
      inputSchema: z.object({}),
      execute: async () => {
        const numbers = await getNumbers(
          user.id,
          resolveTimeZone(user.timezone)
        )

        /**
         * Two empty states, kept apart.
         *
         * Rows that exist and carry no reach figures are not the same problem
         * as no rows at all, and telling somebody to connect an account they
         * already connected is the worse of the two mistakes — the same
         * distinction /numbers draws on the page itself.
         */
        if (numbers.scored === 0) {
          return numbers.skipped > 0
            ? `${count(numbers.skipped, "of their posts is", "of their posts are")} imported with no reach figures, so nothing can be scored yet. X reports impressions only for recent posts and an archive import carries none at all — a fresh read on /sources is what fills them in.`
            : "Quincy has scored none of their posts, because it has read none. Every number here is measured against their own median, so there is nothing to measure until there is history: “Read my posts” on /sources is the one step."
        }

        const lines: string[] = [
          `${count(numbers.scored, "post")} scored, ${numbers.from} to ${numbers.to}.`,
          `Median ${numbers.median.toLocaleString("en-US")} views. Mean ${numbers.mean.toLocaleString("en-US")}${
            numbers.median > 0
              ? `, ${(numbers.mean / numbers.median).toFixed(1)}× the median`
              : ""
          }.`,
          `${numbers.outliers} of ${numbers.scored} cleared ${OUTLIER_GATE}×. ${numbers.below} of ${numbers.scored} fell under their own median. Best post ${formatMultiple(numbers.best)}.`,
        ]

        if (numbers.skipped > 0) {
          lines.push(
            `${count(numbers.skipped, "more post carries", "more posts carry")} no reach figures and ${numbers.skipped === 1 ? "is" : "are"} left out of every number above.`
          )
        }

        if (numbers.rows.length) {
          lines.push(
            `\nBy angle, each group scored by its own median:\n${numbers.rows
              .map(
                (row) =>
                  `- ${row.label}: ${formatMultiple(row.medianMultiple)} across ${count(row.posts.length, "post")}`
              )
              .join("\n")}`
          )
        }

        const { best, worst } = endsOf(numbers.rows)
        if (best && worst) {
          lines.push(
            `${best.label} is the angle that works, at ${formatMultiple(best.medianMultiple)}. ${worst.label} is the one that does not, at ${formatMultiple(worst.medianMultiple)}.`
          )
        }

        // The recent end, which is the half a critique needs: a median over a
        // year says nothing about whether the last five landed.
        const recent = [...numbers.byDate].reverse().slice(0, RECENT_POSTS)
        if (recent.length) {
          lines.push(
            `\nMost recent ${recent.length}, newest first:\n${recent
              .map(
                (post) =>
                  `- ${post.date}: ${formatMultiple(post.multiple)} (${post.impressions.toLocaleString("en-US")} views) “${post.hook}”`
              )
              .join("\n")}`
          )
        }

        if (numbers.inferred) {
          lines.push(
            "\nThe angles are inferred, not recorded: Quincy has published nothing yet, so they are read off the imported history rather than off the angle that drafted each post."
          )
        }

        return lines.join("\n")
      },
    }),

    capture_riff: tool({
      description:
        "Turn text the user just gave you into a riff with angles, so it becomes material the product can work on. Use when they paste or dictate something — a script, a post, a note, a decision — and want anything done with it. Costs a model call. After this, call read_riffs to get the angle ids, then draft_angle to write one.",
      inputSchema: z.object({
        text: z
          .string()
          .describe(
            "The material itself, verbatim. Their words, not your summary of them. Include the source URL if they gave one."
          ),
      }),
      execute: async ({ text }) => {
        const result = await captureToRiff({ text })

        if (!result.ok) {
          // The action's own sentence. It knows whether this was a lapsed
          // trial, a cooldown, an empty paste or text over the ceiling, and
          // each of those wants a different answer from the user.
          return `Not captured: ${result.message}`
        }

        const grounded = result.groundedIn
          ? ` Quincy leaned on ${result.groundedIn} of yours.`
          : ""

        return `Captured. ${count(result.angles, "angle")} on it.${grounded} Call read_riffs to see them with their ids, then draft_angle on the one they pick. Nothing is written until they choose.`
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

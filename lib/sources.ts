import { formatConversationDate } from "./format-date"
import { listSourceConnections } from "./source-connections"

/**
 * Where the material comes in.
 *
 * The mirror of Channels, and deliberately not the same list. A channel is a
 * place Quincy publishes; a source is material Quincy reads. Getting that
 * boundary wrong is how Stanley ends up with one Integrations grid holding
 * outputs, inputs and chat surfaces together, filed under "Core" and "Other" —
 * nineteen tiles where the only state a connected one carries is a checkmark.
 *
 * Three things are deliberately **not** here:
 *
 * - **Channels.** `lib/rhythms.ts` already reads published work back as
 *   material — Atomize takes `from: ["substack", "youtube"]`, Comment Mining
 *   takes `from: ["x", "linkedin", "substack"]`. That makes every channel a
 *   source, and giving it a second row here would mean connecting X twice. The
 *   page says it in a sentence instead.
 * - **Chat surfaces.** iMessage and Telegram are how you talk *to* Quincy, not
 *   material coming in. They belong to the chat.
 * - **An MCP endpoint.** Stanley files theirs under integrations. It is an API
 *   surface, not a thing that hands over material.
 *
 * Ordered by what a source gives, strongest first: your own words, then your
 * shipped work, then material you are holding. Nothing is grouped — a flat
 * register is the whole point of this shape, and a heading per pair would be
 * taxonomy applied to eleven rows that do not need it.
 */

export type Source = {
  id: string
  label: string
  /** What it actually hands over, in the user's words. Not a category. */
  gives: string
}

/**
 * What a connected source is doing.
 *
 * Four states, not two. "Connected" and "not connected" is what Stanley ships —
 * a green checkmark on a tile — and it cannot express the two cases that
 * actually cost you material:
 *
 * - `waiting` — the connection succeeded and nothing has come through yet. On a
 *   checkmark-only surface this is indistinguishable from working, so a source
 *   you wired to the wrong repo looks healthy forever.
 * - `broken` — the token expired or access was revoked. This is the state that
 *   silently stops a rhythm, and it is the one thing on this page that should
 *   be able to interrupt you.
 *
 * `lastAt` is pre-rendered relative text rather than a Date. These strings are
 * read on the server and handed to a client row; formatting on the client from
 * a timestamp would render a different string than the server did.
 */
export type Connection =
  | { state: "arriving"; lastAt: string }
  | { state: "waiting"; since: string }
  | { state: "paused"; lastAt: string }
  | { state: "broken"; lastAt: string }

/**
 * What is connected, keyed by source id.
 *
 * The table landed in plans/019 and this reads it. The `timezone` field is
 * additive and optional — the page passes `session.user`, which already
 * carries it.
 *
 * Takes the user rather than an id, which was originally because the demo
 * allowlist was by address. That allowlist is gone; the shape stays because a
 * seam that has to grow a parameter later is a seam every call site has to be
 * revisited for, and `timezone` is the second field it already needed.
 *
 * **Only Circleback can produce a row today**, so every other source still
 * resolves to nothing. That is the true answer rather than a value we have not
 * fetched, and it is why `/sources` still renders one group for most people.
 *
 * These same states are exercised in `app/prototypes/sources`, which mounts the
 * same row against its own fixtures and never ships.
 */
export async function getSourceConnections(user: {
  id: string
  email: string
  timezone?: string | null
}): Promise<Record<string, Connection>> {
  const rows = await listSourceConnections(user.id)
  const zone = user.timezone || "UTC"

  const connections: Record<string, Connection> = {}

  for (const row of rows) {
    /**
     * `waiting` reads its date off `createdAt`; every other state reads
     * `lastItemAt`. That asymmetry is the point of the state — "connected
     * three days ago and nothing has come through" is a different sentence
     * from "last heard from three days ago", and a page that renders them the
     * same way cannot tell a mis-wired source from a quiet one.
     */
    if (row.state === "waiting" || !row.lastItemAt) {
      connections[row.source] = {
        state: "waiting",
        since: formatConversationDate(row.createdAt, zone),
      }
      continue
    }

    connections[row.source] = {
      state: row.state,
      lastAt: formatConversationDate(row.lastItemAt, zone),
    }
  }

  /**
   * The table is the whole answer.
   *
   * A fixture set used to be merged under these rows for an allowlisted
   * address, and it cost more than it showed: an earlier version returned it
   * *before* reading the table, so a real, correct GitHub installation stayed
   * invisible on /sources after it succeeded — the row existed, the redirect
   * said `?github=connected`, and the page had never looked. It is gone with
   * lib/demo.ts now that this table can answer for itself.
   */
  return connections
}

export const SOURCES: Source[] = [
  // Your own words, already spoken or written, currently thrown away. The
  // richest of these is Slack: you explain things to teammates every day at
  // exactly the specificity a good post needs, and no tool treats that as
  // material.
  { id: "voice", label: "Voice notes", gives: "What you said out loud, transcribed" },
  { id: "slack", label: "Slack", gives: "How you already explain things to your team" },
  { id: "loom", label: "Loom", gives: "Demos you narrated" },
  { id: "email", label: "Email", gives: "Replies and threads you already wrote" },

  // Shipped work. GitHub only sees code, which is why Shipped Work currently
  // misses everything that ships without a commit.
  { id: "github", label: "GitHub", gives: "Pull requests as they merge" },

  // Material you are already holding.
  // Three vendors for the same job, so the lines have to say what each actually
  // hands over. Identical copy on adjacent rows reads as a copy-paste bug even
  // when it is true.
  //
  // Circleback leads them because it is the only one that works (plans/019),
  // and its line says what Quincy does with a call rather than what the vendor
  // stores — the other two describe a product, this one describes an outcome,
  // and that difference is the whole reason it is first.
  {
    id: "circleback",
    label: "Circleback",
    gives: "The moment worth quoting from a call",
  },
  { id: "granola", label: "Granola", gives: "Notes and transcripts from calls" },
  { id: "fathom", label: "Fathom", gives: "Recordings and transcripts from calls" },
  { id: "photos", label: "Photos", gives: "Screenshots and camera roll" },
  { id: "notion", label: "Notion", gives: "Docs you already wrote" },
  { id: "calendar", label: "Google Calendar", gives: "What is on this week" },
  { id: "rss", label: "RSS", gives: "Feeds you read" },
]

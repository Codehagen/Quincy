/**
 * The opening Quincy speaks on an empty Studio, composed on the server from
 * the real account state.
 *
 * A greeting that could open any account is a hero in a speech bubble — the
 * whole point of speaking first is to prove Quincy has read the desk. So the
 * opening names the newest riff when one exists, and the chips are answers to
 * what was actually said, not generic prompts.
 *
 * Pure and synchronous on purpose: the page fetches (user row, riffs), this
 * composes, and the client only sequences the reveal. Everything that can be
 * wrong about the sentences is testable here without a browser.
 */

/**
 * First visit is remembered per browser. Lives here, not in the client
 * component: a constant imported from a "use client" module into a server
 * component arrives as a client-reference proxy, not a string, and
 * `cookies().has(proxy)` is quietly false forever. Found in the browser, not
 * in the types.
 */
export const GREETED_COOKIE = "studio_greeted"

export type StudioGreeting = {
  /** Quincy's opening, one bubble per line. */
  opening: string[]
  /** Real answers that send on click. Held until the opening finishes. */
  chips: string[]
  /**
   * Reveal the opening word by word — first-ever visit only. Decided against
   * typing on every visit: Studio is a daily surface, and a two-second
   * animation on a daily surface is a toll, not personality. The flag comes
   * from the `studio_greeted` cookie so the server renders the right mode and
   * the client never has to guess (no hydration flicker, no storage read).
   */
  typed: boolean
}

/** What the composer needs to know about a riff. Subset of lib/riffs `Riff`. */
type RiffLike = {
  scrap: string
  capturedAt: string
  state: string
  /**
   * `working` for longer than `RIFF_STUCK_AFTER_MS`, computed by lib/riffs.ts.
   *
   * Optional because the field is derived rather than stored, so a caller that
   * builds a `RiffLike` by hand does not have to answer for it. Absent means
   * "not stuck", which is the safe default: it can only make the greeting
   * offer more, never less.
   */
  stuck?: boolean
}

/**
 * Quoting a paste verbatim would put a wall of someone's own text in the
 * greeting; the quote is a reminder, not a rendering. Cut on a word so the
 * ellipsis never splits one.
 */
function clip(scrap: string, max = 90): string {
  const flat = scrap.replace(/\s+/g, " ").trim()
  if (flat.length <= max) return flat
  const cut = flat.slice(0, max)
  const space = cut.lastIndexOf(" ")
  return `${cut.slice(0, space > max / 2 ? space : max).trimEnd()}…`
}

/**
 * `capturedAt` is `formatConversationDate` output ("Today", "Yesterday",
 * "3 days ago", "12 Aug"), pre-rendered for a heading. Mid-sentence it needs
 * a case change or a preposition, not a reformat — re-deriving from a
 * timestamp here could disagree with what the riffs page shows.
 */
function midSentence(capturedAt: string): string {
  if (/^today$/i.test(capturedAt)) return "today"
  if (/^yesterday$/i.test(capturedAt)) return "yesterday"
  if (/ago$/i.test(capturedAt)) return capturedAt.toLowerCase()
  return `on ${capturedAt}`
}

export function composeStudioGreeting({
  name,
  riffs,
  typed,
}: {
  name: string
  riffs: RiffLike[]
  typed: boolean
}): StudioGreeting {
  const first = name.trim().split(/\s+/)[0] ?? ""

  /**
   * A failed riff is not material on the desk; greeting someone with their
   * own failure would be a status report. `working` stays — Quincy holding a
   * scrap it has not finished reading is still a scrap it was handed.
   *
   * **A stuck one does not stay**, and that is the correction. `working` means
   * "not finished reading it yet", which is true for the first four minutes and
   * a lie after that: the run is gone, nothing will retry it, and no angle is
   * coming. Measured on the real account on 2026-08-13 — one riff, `working`
   * since 2026-08-11, and the greeting was still saying "There is material on
   * the desk. Say the word and I draft from it" about a scrap Quincy had lost
   * 42 hours earlier. Offering to draft from it is the worst of the two
   * outcomes: the desk is not quiet, it is holding a corpse.
   *
   * Excluded rather than described. "I lost that one" is what the riff card
   * already says, in the place that can also do something about it; repeating
   * it in the opening line would make the first thing Quincy says be an
   * apology for its own plumbing.
   */
  const usable = riffs.filter(
    (riff) => riff.state !== "failed" && riff.stuck !== true
  )
  const newest = usable[0]

  if (!newest) {
    return {
      opening: [
        first ? `${first}. The desk is quiet.` : "The desk is quiet.",
        "Tell me one thing you shipped this week — say it plainly, and I will find the angle.",
      ],
      chips: [
        "What should I write about this week?",
        "What do you know about me so far?",
      ],
      typed,
    }
  }

  const quote = `“${clip(newest.scrap)}”`
  const when = midSentence(newest.capturedAt)
  const count =
    usable.length > 1
      ? `You left me ${usable.length} riffs — the newest ${when}: ${quote}.`
      : `You left me ${quote} ${when}.`

  return {
    opening: [
      first
        ? `${first}. There is material on the desk.`
        : "There is material on the desk.",
      `${count} Say the word and I draft from it — or tell me what you shipped since.`,
    ],
    chips: [
      "Draft from that riff",
      "What should I write about this week?",
      "What do you know about me so far?",
    ],
    typed,
  }
}

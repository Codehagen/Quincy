/**
 * The opening Quincy speaks on an empty Studio, composed on the server from
 * the real account state.
 *
 * A greeting that could open any account is a hero in a speech bubble — the
 * whole point of speaking first is to prove Quincy has read the desk. So the
 * opening names the newest riff when one exists, and the chips are answers to
 * what was actually said, not generic prompts.
 *
 * Pure and synchronous on purpose: the page fetches (user row, riffs, what is
 * waiting), this composes, and the client only sequences the reveal.
 * Everything that can be wrong about the sentences is testable here without a
 * browser.
 */

/**
 * Type-only, and it has to stay that way. components/quincy/quincy-greeting.tsx
 * is a `"use client"` module and imports `GREETED_COOKIE` from here, so this
 * file is in the browser bundle; a value import from lib/waiting-work would
 * pull the database client and the whole schema in with it. `import type` is
 * erased before the bundler ever sees it.
 */
import type { WaitingWork } from "./waiting-work"

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
   * Where the offer opens, when Quincy made one. Null the rest of the time.
   *
   * A destination rather than a sentence with a path in it: the opening
   * renders as plain text in a bubble, so a URL written into the line is
   * something to retype rather than something to press. Held back with the
   * chips until the opening has finished — offering somewhere to go before the
   * sentence lands is the same mistake as pre-printing the answers.
   */
  link: { href: string; label: string } | null
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

/**
 * When an offer has to admit its own age.
 *
 * Seven days, taken from `formatConversationDate` rather than invented here:
 * that is where the product already stops saying "3 days ago" and starts
 * printing a calendar date, because past a week nobody counts back. The same
 * boundary is where "still on the desk" stops being a nudge and becomes
 * something Quincy has to own.
 *
 * Under it the line says what is ready and offers to write it. Over it the
 * line says how long it has sat there and that nobody asked — the twelve riffs
 * measured on 2026-09-09 had been waiting fourteen days, and greeting somebody
 * with fortnight-old work as though it arrived this morning is the kind of
 * cheerfulness that makes an assistant unbelievable about everything else.
 */
export const STALE_AFTER_DAYS = 7

/**
 * The offer, in one sentence. Exported for the test.
 *
 * **Specific, never a count.** "You have 12 riffs" is a chore with a number on
 * it, and the twelve riffs on the live account are the proof that a chore does
 * not get done — they sat from August to September on a page the owner had no
 * reason to open. One named thing, with the thinking that is already behind
 * it and how long it has waited, is a colleague offering to finish something.
 *
 * The hook is Quincy's own sentence about the material rather than a quote of
 * the scrap. The scrap is a pull request description in Norwegian or a
 * transcript; the hook is the post it could become, which is the thing being
 * offered.
 */
export function offerLine(offer: WaitingWork): string {
  if (offer.kind === "gap") {
    return `Nothing is waiting to be written, so here is the one I would ask: ${offer.question}`
  }

  const what = `The ${offer.source} I read ${midSentence(offer.waitingSince)}`
  const hook = `“${clip(offer.hook)}”`
  // Never "its three beats" for a riff that has none — a voice note will never
  // carry them, and a claim about work that was not done is the fastest way to
  // make every other sentence here suspect.
  const ready = offer.beats ? "its three beats" : "its angles"

  if (offer.waitedDays >= STALE_AFTER_DAYS) {
    return `${what} — ${hook} — has had ${ready} ready for ${offer.waitedDays} days, and I never asked. Not fresh, but finished: want me to write it?`
  }

  return `${what} — ${hook} — already has ${ready}. Want me to write it?`
}

/** "26 Aug", "today", "3 days ago" — `midSentence` without its preposition. */
function bareWhen(waitingSince: string): string {
  return midSentence(waitingSince).replace(/^on /, "")
}

export function composeStudioGreeting({
  name,
  riffs,
  typed,
  offer,
}: {
  name: string
  riffs: RiffLike[]
  typed: boolean
  /**
   * What Quincy is holding, from lib/waiting-work.ts. Optional because it is a
   * database read the composer must survive without: `waitingWork` answers
   * null on any failure, and the greeting that existed before this is still a
   * correct greeting.
   */
  offer?: WaitingWork | null
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

  /**
   * The offer takes the second line, and the count does not get one.
   *
   * This is the change plan 028 item 2a asks for, and it is a replacement
   * rather than a third bubble on purpose. "You left me 12 riffs" is a count,
   * and a count is a chore: the live account carried twelve `ready` riffs from
   * 26–31 August with every beat already extracted, and read that number every
   * time /studio opened without a single one turning into a draft. Naming one
   * of them, with the thinking that is already behind it, is the sentence a
   * colleague says. Both sentences at once would be the chore back again,
   * wearing the offer as a suffix.
   */
  if (offer?.kind === "riff") {
    return {
      opening: [
        first
          ? `${first}. There is material on the desk.`
          : "There is material on the desk.",
        offerLine(offer),
      ],
      chips: [
        // Names the thing rather than pointing at it: the chip is sent as the
        // owner's own first message, and "draft that one" arrives in a thread
        // where the model never saw the greeting (see the note in
        // components/quincy/quincy-greeting.tsx). The source and the day are
        // what `read_riffs` can actually match on.
        `Draft the ${offer.source} from ${bareWhen(offer.waitingSince)}`,
        "What should I write about this week?",
        "What do you know about me so far?",
      ],
      link: { href: offer.href, label: "Open it on /riffs" },
      typed,
    }
  }

  if (!newest) {
    return {
      opening: [
        first ? `${first}. The desk is quiet.` : "The desk is quiet.",
        /**
         * A gap speaks only here. It is the sentence for having nothing to
         * write, and saying "nothing is waiting" over a desk with material on
         * it would be Quincy talking past what is in front of it.
         */
        offer
          ? offerLine(offer)
          : "Tell me one thing you shipped this week — say it plainly, and I will find the angle.",
      ],
      chips: [
        "What should I write about this week?",
        "What do you know about me so far?",
      ],
      link: null,
      typed,
    }
  }

  const quote = `“${clip(newest.scrap)}”`
  const when = midSentence(newest.capturedAt)
  const count =
    usable.length > 1
      ? `You left me ${usable.length} ideas — the newest ${when}: ${quote}.`
      : `You left me ${quote} ${when}.`

  return {
    opening: [
      first
        ? `${first}. There is material on the desk.`
        : "There is material on the desk.",
      `${count} Say the word and I draft from it — or tell me what you shipped since.`,
    ],
    chips: [
      "Draft from that idea",
      "What should I write about this week?",
      "What do you know about me so far?",
    ],
    link: null,
    typed,
  }
}

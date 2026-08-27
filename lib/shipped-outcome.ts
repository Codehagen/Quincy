/**
 * What became of one merged pull request, and how to say it. See plans/021.
 *
 * A module of its own for a boring reason with a real consequence: the sentence
 * is needed on the server — `readLastMergedPull` says it when a merge turns out
 * to be already read — and in the browser, where the row polls for the same
 * answer while the workflow runs. `lib/riffs.ts` cannot cross that line because
 * it imports the database, and `app/(app)/sources/actions.ts` cannot export a
 * synchronous function at all. Everything here is a type and a switch.
 *
 * The alternative was one copy on each side, which is how two surfaces end up
 * describing the same row differently — the failure `setup.connected` was
 * already fixed for on this very page.
 */

/**
 * The most an answer to Quincy's one question may be. See plans/027 phase 1c.
 *
 * Here rather than in lib/shipped-work.ts for this module's founding reason: it
 * is needed on both sides. The server action refuses anything longer and the
 * form sets `maxLength` from it, and those two numbers agreeing is not
 * something to leave to whoever edits one of them. lib/shipped-work.ts imports
 * it from here, which also keeps `ai` and the whole generation stack out of a
 * `"use client"` bundle that only wanted an integer.
 *
 * A thousand characters, which is a paragraph. It becomes a beat, and a beat is
 * one clause — `readShippedBeats` cuts it to `MAX_BEAT_CHARS` on the way in —
 * but it arrives from a person typing rather than from a model quoting, and
 * refusing somebody's second sentence at the input would be the wrong place to
 * hold that line.
 */
export const MAX_ANSWER_CHARS = 1_000

/**
 * Seven answers, and `pending` is the only one that is not final.
 *
 * `writing` is final on purpose. Once the riff row exists, "there is a post in
 * it, it is on /riffs" is already true, and the angles finishing later does not
 * change the sentence — so a caller waiting on this can stop waiting.
 */
export type ShippedOutcome =
  | { state: "pending" }
  | { state: "writing"; riffId: string }
  | { state: "ready"; riffId: string }
  | { state: "failed"; message: string }
  | { state: "refused"; why: string }
  /**
   * Stored, and never read.
   *
   * The sixth answer, added by plan 027 because the first five could not tell
   * two very different things apart. `refused` is a judgement about the merge —
   * a model read it and found no post. This is the account: unentitled, paused,
   * over the daily ceiling, or a workflow that never started. Nothing looked at
   * the merge at all, and saying "there was no post in it" about a merge nobody
   * read would be the confident sentence this whole module exists to stop.
   */
  | { state: "stopped"; why: string }
  /**
   * Read, and one question is waiting on the owner.
   *
   * Also final: the workflow has finished and the next move is a person's. It
   * carries the question so the caller does not have to go and find it.
   */
  | { state: "asked"; question: string }

/**
 * Whether there is anything left to wait for. The poll's whole condition.
 *
 * **A null settles it too**, and that is the one that is easy to get backwards.
 * Null is "I cannot see that row" — signed out, or an id that is not theirs —
 * and the `source_item` was written before the caller was ever given the id, so
 * no amount of asking again will make it appear. Treating null as unsettled
 * would spend forty requests over two minutes on a question already answered.
 */
export function isSettled(outcome: ShippedOutcome | null): boolean {
  return outcome === null || outcome.state !== "pending"
}

/**
 * One outcome, in one sentence.
 *
 * `pending` is deliberately flat rather than reassuring. It is reached when a
 * run died between storing the merge and reaching a verdict, and "nothing has
 * come back yet" is the true thing to say — the sentence this whole change
 * exists to stop being unsaid is the confident one that came before.
 */
export function sayOutcome(outcome: ShippedOutcome | null): string {
  switch (outcome?.state) {
    case "ready":
      return "There was a post in it — it is on /riffs."
    case "writing":
      return "There was a post in it — it is on /riffs now, still being written."
    case "failed":
      return outcome.message
        ? `The write failed: ${outcome.message}`
        : "The write failed."
    case "refused":
      /**
       * The model's own sentence, handed over whole.
       *
       * It reads like a person — "an implementation-heavy animation update, not
       * a stranger-facing insight" — and paraphrasing it into a category would
       * throw away the only part somebody can argue with or learn from.
       */
      return outcome.why
        ? `There was no post in it: ${outcome.why}`
        : "There was no post in it."
    case "asked":
      /**
       * The refusal and the question in one sentence, because they are one
       * event: Quincy could not find the story and has asked for the one line
       * that would carry it. Splitting them would put a verdict on screen and
       * leave the way out of it somewhere else.
       */
      return `I could not find the story in it, so I have asked you one thing: ${outcome.question}`
    case "stopped":
      return outcome.why
        ? `I stored it and did not read it: ${outcome.why}`
        : "I stored it and did not read it."
    default:
      return "Nothing has come back from it yet."
  }
}

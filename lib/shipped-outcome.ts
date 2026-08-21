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
 * Five answers, and `pending` is the only one that is not final.
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
    default:
      return "Nothing has come back from it yet."
  }
}

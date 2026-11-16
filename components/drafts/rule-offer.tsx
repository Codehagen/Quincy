"use client"

import type { EditClass, RuleOffer } from "@/lib/edit-classes"
import { QuincyAsks } from "@/components/quincy"
import { answerVoiceRule } from "@/app/(app)/drafts/actions"

/**
 * "You keep doing this. Should it be a rule?" — one line, two answers.
 *
 * See plans/027 item 3e. It appears under a version you have just approved,
 * and only when the same class of edit has happened three times in thirty
 * days. A person who has just decided about a post is not looking for a
 * second decision, so it is QuincyAsks, as small as a caption, never the
 * page's action.
 *
 * **Nothing is added without the click.** The server has counted; it has not
 * written. `answerVoiceRule` is the only path from here into `brain_page`, and
 * "Not now" is a real answer that costs the offer its counter.
 */

/** What the person did, in their own terms. The rule text says what to do about it. */
const NOTICE: Record<EditClass, string> = {
  "emoji-removed": "You've taken the emoji out three times.",
  "emoji-added": "You've added an emoji three times.",
  "link-removed": "You've taken the link out three times.",
  "link-added": "You've added a link three times.",
  "hashtag-removed": "You've taken the hashtags out three times.",
  "line-cut": "You've cut a line out three times.",
  shortened: "You've cut it much shorter three times.",
  lengthened: "You've given it more room three times.",
  "exclamation-removed": "You've taken the exclamation marks out three times.",
  "numbers-on-own-line": "You've moved a number onto its own line three times.",
  "first-person": "You've put it back into the first person three times.",
}

export function RuleOfferLine({
  offer,
  channel,
}: {
  offer: RuleOffer
  /** The version's channel, so the rule lands on the right voice page. */
  channel: string
}) {
  return (
    <QuincyAsks
      question={NOTICE[offer.class]}
      rest={`Add “${offer.text}” to your voice?`}
      isAction={false}
      answer={{
        kind: "yes",
        label: "Add to voice",
        pendingLabel: "Adding…",
        onAnswer: async () => {
          const result = await answerVoiceRule({
            channel,
            cls: offer.class,
            accept: true,
            text: offer.text,
          })
          // Usually the 15-rule cap. The offer is still true, so it stays.
          return result.ok
            ? { ok: true }
            : { ok: false, message: result.error ?? "Could not save that to your voice." }
        },
      }}
      // Instant: the question is gone either way, and the counter reset
      // behind it is bookkeeping nobody is waiting on.
      onDecline={() =>
        void answerVoiceRule({ channel, cls: offer.class, accept: false })
      }
      answered="Added to your voice. It's on your voice page now."
    />
  )
}

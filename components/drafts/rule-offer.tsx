"use client"

import * as React from "react"
import Link from "next/link"
import { Alert02Icon, Idea01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import type { EditClass, RuleOffer } from "@/lib/edit-classes"
import { Button } from "@/components/ui/button"
import { answerVoiceRule } from "@/app/(app)/drafts/actions"

/**
 * "You keep doing this. Should it be a rule?" — one line, two answers.
 *
 * See plans/027 item 3e. It appears under a version you have just approved,
 * and only when the same class of edit has happened three times in thirty
 * days. Everything about the size of it is deliberate: a person who has just
 * finished deciding about a post is not looking for a second decision, so this
 * is a caption with two controls in it rather than a card, a banner or —
 * least of all — a dialog.
 *
 * **Nothing is added without the click.** The server has counted; it has not
 * written. `answerVoiceRule` is the only path from here into `brain_page`, and
 * "Not now" is a real answer that costs the offer its counter.
 */

/** What the user did, in their own terms. The rule text says what to do about it. */
const NOTICE: Record<EditClass, string> = {
  "emoji-removed": "You have taken the emoji out three times.",
  "emoji-added": "You have added an emoji three times.",
  "link-removed": "You have taken the link out three times.",
  "link-added": "You have added a link three times.",
  "hashtag-removed": "You have taken the hashtags out three times.",
  "line-cut": "You have cut a line out three times.",
  shortened: "You have cut it much shorter three times.",
  lengthened: "You have given it more room three times.",
  "exclamation-removed":
    "You have taken the exclamation marks out three times.",
  "numbers-on-own-line":
    "You have moved a number onto its own line three times.",
  "first-person": "You have put it back into the first person three times.",
}

export function RuleOfferLine({
  offer,
  channel,
}: {
  offer: RuleOffer
  /** The version's channel, so the rule lands on the right voice page. */
  channel: string
}) {
  const [state, setState] = React.useState<
    "asking" | "saving" | "added" | "gone"
  >("asking")
  const [error, setError] = React.useState<string>()

  const answer = React.useCallback(
    async (accept: boolean) => {
      // Dismissing is instant and needs no confirmation from the server: the
      // question is gone either way, and the counter reset behind it is
      // bookkeeping nobody is waiting on.
      if (!accept) {
        setState("gone")
        void answerVoiceRule({ channel, cls: offer.class, accept: false })
        return
      }

      setState("saving")
      setError(undefined)

      const result = await answerVoiceRule({
        channel,
        cls: offer.class,
        accept: true,
        text: offer.text,
      })

      if (result.ok) {
        setState("added")
        return
      }

      // Back to the question rather than stuck on "Saving": the offer is still
      // true, and the message says what stopped it — usually the 15-rule cap.
      setState("asking")
      setError(result.error)
    },
    [channel, offer.class, offer.text]
  )

  if (state === "gone") return null

  if (state === "added") {
    return (
      <p className="text-caption text-muted-foreground">
        Added to your voice.{" "}
        <Link
          href="/brain?page=voice"
          className="underline underline-offset-4 hover:text-foreground"
        >
          See it
        </Link>
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted-foreground">
        <HugeiconsIcon
          aria-hidden="true"
          icon={Idea01Icon}
          className="size-3.5 shrink-0"
        />
        <span className="text-pretty">
          {NOTICE[offer.class]} Add “{offer.text}” to your voice?
        </span>

        <Button
          type="button"
          size="xs"
          disabled={state === "saving"}
          onClick={() => void answer(true)}
        >
          {state === "saving" ? "Adding…" : "Add to voice"}
        </Button>

        {/* A text link, not a second button. Two buttons side by side would
            read as two equal choices, and declining is the cheaper of the
            two — it changes nothing. */}
        <Button
          type="button"
          variant="link"
          size="xs"
          className="px-0 text-muted-foreground"
          disabled={state === "saving"}
          onClick={() => void answer(false)}
        >
          Not now
        </Button>
      </div>

      {error ? (
        <p
          role="alert"
          className="flex items-start gap-1.5 text-caption text-destructive"
        >
          <HugeiconsIcon
            aria-hidden="true"
            icon={Alert02Icon}
            className="mt-0.5 size-3.5 shrink-0"
          />
          <span className="text-pretty">{error}</span>
        </p>
      ) : null}
    </div>
  )
}

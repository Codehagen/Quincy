"use client"

import { useState, useTransition } from "react"

import {
  importFromX,
  type ImportFromXReceipt,
} from "@/app/(app)/sources/actions"
import { Button, TextLink } from "@/components/kit"
import { Friend } from "@/components/mascot"
import { SourceRowFrame, sourceNameId } from "@/components/sources/source-row"

/**
 * The one live row from a channel: a connected X account, read back as
 * material. See plans/011.
 *
 * A client component, unlike SourceRow, because this row owns a mutation and
 * its receipt. The receipt renders in place rather than as a toast: what
 * Quincy learned is the product of the action, not a notification about it,
 * and it should still be on the page when the eye comes back.
 *
 * The read takes a while, so while it runs the status line is the kit's
 * working state (states.md): the friend reading, with words, in the row where
 * the receipt will land. That is Quincy working right now, which is what the
 * friend says; it goes the moment the receipt arrives.
 */

export function ChannelSourceRow({
  handle,
  items,
}: {
  /** The X handle, for the row's identity line. */
  handle: string | null
  /** Corpus rows already stored, so the label can say import vs re-import. */
  items: number
}) {
  const [pending, startTransition] = useTransition()
  const [receipt, setReceipt] = useState<ImportFromXReceipt | null>(null)

  const run = () => {
    setReceipt(null)
    startTransition(async () => {
      setReceipt(await importFromX())
    })
  }

  const name = handle
    ? `X, ${handle.startsWith("@") ? handle : `@${handle}`}`
    : "X"

  return (
    <SourceRowFrame
      id="x"
      name={name}
      description="Your own posts, read back so Quincy learns how you write."
      status={
        // The receipt, specific or absent. "Import complete" would be a
        // checkmark; the numbers are what make it believable, and the link
        // is where believing gets checked. aria-live so the wait announces
        // its end the same way the repaint does to everyone else.
        <div aria-live="polite">
          {pending ? (
            <span className="inline-flex items-center gap-2">
              <Friend size={20} state="reading" className="shrink-0" />
              <span className="min-w-0">
                Reading your posts.
              </span>
            </span>
          ) : receipt?.ok ? (
            <>
              Read{" "}
              {receipt.postsRead === 0 && receipt.imported === 0
                ? "nothing new"
                : `${receipt.postsRead} posts`}
              {receipt.truncated
                ? ". More remain, so import again for older ones"
                : ""}
              {receipt.rulesWritten > 0 || receipt.storiesWritten > 0 ? (
                <>
                  . {receipt.rulesWritten} voice rules, {receipt.storiesWritten}{" "}
                  stories.{" "}
                  <TextLink href="/brain">See what Quincy learned</TextLink>
                </>
              ) : receipt.skipped > 0 ? (
                ". Your edited pages were left alone; the findings wait on them."
              ) : (
                "."
              )}
            </>
          ) : receipt ? (
            // A refusal, in ink, where the action was (states.md). Not red:
            // nothing was destroyed.
            <span role="status" className="text-kit-ink">
              {receipt.message}
            </span>
          ) : items > 0 ? (
            `${items} posts in`
          ) : null}
        </div>
      }
      action={
        <Button
          onClick={run}
          pending={pending}
          pendingLabel="Reading…"
          aria-describedby={sourceNameId("x")}
        >
          {items > 0 ? "Import again" : "Import posts"}
        </Button>
      }
    />
  )
}

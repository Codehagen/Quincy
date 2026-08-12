"use client"

import { useState, useTransition } from "react"
import Link from "next/link"

import { importFromX, type ImportFromXReceipt } from "@/app/(app)/sources/actions"
import { Button } from "@/components/ui/button"
import { SourceMark } from "@/components/sources/source-mark"

/**
 * The one live row on /sources: a connected channel, read back as material.
 * See plans/011.
 *
 * A client component, unlike SourceRow, because this row owns a mutation and
 * its receipt. The receipt renders in place rather than as a toast: what
 * Quincy learned is the product of the action, not a notification about it,
 * and it should still be on the page when the eye comes back.
 *
 * **No brass.** The same rule as SourceRow: brass means "a rhythm is
 * running", and a one-press import is a person acting, not a rhythm. The
 * button is an outline like every other action on the page.
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

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <SourceMark id="x" label="X" />

      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-card-title">
          X{handle ? ` — ${handle.startsWith("@") ? handle : `@${handle}`}` : ""}
        </p>
        <p className="text-caption text-muted-foreground text-pretty">
          Your own posts, read back so Quincy learns how you write
        </p>

        {/* The receipt, specific or absent. "Import complete" would be a
            checkmark; the numbers are what make it believable, and the link
            is where believing gets checked. aria-live so the wait announces
            its end to a screen reader the same way the repaint does to
            everyone else. */}
        <div aria-live="polite">
          {pending ? (
            <p className="text-caption text-muted-foreground pt-0.5">
              Reading your posts…
            </p>
          ) : receipt?.ok ? (
            <p className="text-caption text-muted-foreground pt-0.5 text-pretty">
              Read {receipt.postsRead === 0 && receipt.imported === 0
                ? "nothing new"
                : `${receipt.postsRead} posts`}
              {receipt.truncated ? " (more remain — import again for older posts)" : ""}
              {receipt.rulesWritten > 0 || receipt.storiesWritten > 0 ? (
                <>
                  {" — "}
                  {receipt.rulesWritten} voice rules, {receipt.storiesWritten}{" "}
                  stories.{" "}
                  <Link
                    href="/brain"
                    className="text-foreground underline decoration-muted-foreground/40 underline-offset-4 hover:decoration-current"
                  >
                    See what Quincy learned
                  </Link>
                </>
              ) : receipt.skipped > 0 ? (
                " — your edited pages were left alone; the findings wait as events on them."
              ) : (
                "."
              )}
            </p>
          ) : receipt ? (
            <p className="text-destructive text-caption pt-0.5 text-pretty">
              {receipt.message}
            </p>
          ) : items > 0 ? (
            <p className="text-caption text-muted-foreground pt-0.5">
              {items} posts in
            </p>
          ) : null}
        </div>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-4">
        <Button variant="outline" onClick={run} disabled={pending}>
          {pending
            ? "Reading…"
            : items > 0
              ? "Import again"
              : "Import posts"}
        </Button>
      </div>
    </li>
  )
}

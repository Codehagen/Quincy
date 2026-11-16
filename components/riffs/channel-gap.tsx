"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { askForChannelAngle } from "@/app/(app)/riffs/actions"
import { Button, LiveDot, Text } from "@/components/kit"
import { PlatformMark } from "@/components/channels/platform-mark"

/**
 * "Nothing here goes to LinkedIn. Make one for LinkedIn."
 *
 * Decided from /prototypes/riffs on 2026-08-08. `CHANNELS_FOR_SHAPE` knows
 * which shape lands where, so a riff can hold three good ideas, none of which
 * reach X; this says so and offers one tap to ask. The gap is computed on the
 * server by `channelGaps` against the live connections, so an account
 * connected to nothing renders none of this.
 *
 * On the kit since 2026-11-16: it sits inside the open RiffCard, under the
 * ideas. A failure is the action's own sentence in ink (no red), the same way
 * RiffCard shows a refused draft.
 */

type Outcome =
  | { kind: "idle" }
  | { kind: "working" }
  /** Quincy read it and there was no second post in there. Not an error. */
  | { kind: "empty" }
  | { kind: "failed"; message: string }
  /** The empty answer was acknowledged with OK: this card stops offering. */
  | { kind: "put-away" }

export function ChannelGaps({
  riffId,
  gaps,
  onAsk,
}: {
  riffId: string
  gaps: { id: string; label: string }[]
  /** Called when an ask starts, so the page can clear its Undo. */
  onAsk?: () => void
}) {
  // Quiet when nothing is missing: a line saying "reaches X and LinkedIn" on
  // every card would be right most of the time and therefore never read.
  if (gaps.length === 0) return null

  return (
    <div className="flex flex-col gap-kit-related">
      {gaps.map((channel) => (
        <Gap key={channel.id} riffId={riffId} channel={channel} onAsk={onAsk} />
      ))}
    </div>
  )
}

function Gap({
  riffId,
  channel,
  onAsk,
}: {
  riffId: string
  channel: { id: string; label: string }
  onAsk?: () => void
}) {
  const router = useRouter()
  const [outcome, setOutcome] = React.useState<Outcome>({ kind: "idle" })
  const [pending, startTransition] = React.useTransition()
  const working = outcome.kind === "working" || pending

  function ask() {
    onAsk?.()
    setOutcome({ kind: "working" })
    startTransition(async () => {
      // The `try` is not optional: a server action rejects when the request
      // never reaches the server, and without it the row spun forever.
      try {
        // The riff id and the channel id only. Hook, material and ownership
        // are read server-side, so a client cannot spend on any text it likes.
        const result = await askForChannelAngle({ riffId, channel: channel.id })
        if (!result.ok) {
          setOutcome({ kind: "failed", message: result.message })
          return
        }
        if (!result.found) {
          setOutcome({ kind: "empty" })
          return
        }
        // The new idea is on the row; the page re-reads, and the gap closes
        // on its own once the idea covers it.
        setOutcome({ kind: "idle" })
        router.refresh()
      } catch {
        setOutcome({ kind: "failed", message: "Could not reach Quincy. Try again." })
      }
    })
  }

  // Put away: the honest no was read and acknowledged. Not re-offered on this
  // card — see the "empty" branch below. Opening the riff again mounts a fresh
  // Gap, which is a deliberate second look rather than a reflex press.
  if (outcome.kind === "put-away") return null

  // Only the sentences are the live region. The buttons stay out of it: a
  // region that holds a control announces the control's label on every
  // change, and "Make one for LinkedIn" read out after each result is noise.
  const said = working ? (
    <Text variant="small" tone="muted" as="div">
      <LiveDot pulse>Looking for something for {channel.label} in this…</LiveDot>
    </Text>
  ) : outcome.kind === "empty" ? (
    <Text variant="small" tone="muted">
      Nothing for {channel.label} in this one that isn&apos;t already here.
    </Text>
  ) : outcome.kind === "failed" ? (
    <Text variant="small">{outcome.message}</Text>
  ) : null

  return (
    <div className="flex flex-col">
      <div role="status" aria-live="polite">
        {said ? <div className="pb-kit-tight">{said}</div> : null}
      </div>
      {working ? null : outcome.kind === "empty" ? (
        /* The honest no. OK puts the gap away for this card and does not
           re-offer it: a button that comes back empty and invites another
           press is a button that gets pressed again, and each press is
           another model call. */
        <div className="flex flex-wrap items-center gap-kit-related">
          <Button onClick={() => setOutcome({ kind: "put-away" })}>OK</Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-kit-related">
          <Text variant="small" tone="muted" as="span">
            <span className="inline-flex items-center gap-1.5">
              {/* currentColor, so the mark sits at the sentence's weight. */}
              <span aria-hidden className="inline-flex">
                <PlatformMark platform={channel.id} size={13} />
              </span>
              Nothing here goes to {channel.label}.
            </span>
          </Text>
          <Button onClick={ask}>
            {outcome.kind === "failed" ? "Try again" : `Make one for ${channel.label}`}
          </Button>
        </div>
      )}
    </div>
  )
}

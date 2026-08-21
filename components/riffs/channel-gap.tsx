"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Loading03Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { askForChannelAngle } from "@/app/(app)/riffs/actions"
import { CHANNELS_FOR_SHAPE, type Angle } from "@/lib/riffs"
import { Button } from "@/components/ui/button"
import { PlatformMark } from "@/components/channels/platform-mark"

/**
 * "Nothing here goes to LinkedIn — make me one."
 *
 * Decided from /prototypes/riffs on 2026-08-08. `CHANNELS_FOR_SHAPE` has known
 * which shape lands where since it was written and nothing ever showed it, so a
 * riff could produce three good angles, none of which could reach X, and the
 * page had no way to say so and no way to ask. This is `Steer` made concrete:
 * the same idea — tell Quincy it read the material wrong — as one tap instead
 * of guessing the phrasing for "give me something for X".
 *
 * The gap itself is computed server-side by `channelGaps` against the user's
 * live connections, so an account connected to nothing renders none of this.
 */

/**
 * Where one angle lands, beside the shape tag.
 *
 * Marks rather than words: the shape tag next to it already carries the
 * category, and a row of "Goes to X and LinkedIn" repeated down every angle is
 * a sentence nobody reads twice. The words stay for screen readers, which
 * cannot read a logo.
 */
export function AngleDestinations({ shape }: { shape: Angle["shape"] }) {
  const channels = CHANNELS_FOR_SHAPE[shape] ?? []
  if (channels.length === 0) return null

  return (
    <span className="text-muted-foreground inline-flex items-center gap-1">
      {channels.map((channel) => (
        <span key={channel.id} aria-hidden="true" className="inline-flex">
          <PlatformMark platform={channel.id} size={13} />
        </span>
      ))}
      <span className="sr-only">
        Goes to {channels.map((c) => c.label).join(" and ")}
      </span>
    </span>
  )
}

type Outcome =
  | { kind: "idle" }
  | { kind: "working" }
  /** Quincy read it and there was no second post in there. Not an error. */
  | { kind: "empty" }
  | { kind: "failed"; message: string }

export function ChannelGaps({
  riffId,
  gaps,
}: {
  riffId: string
  gaps: { id: string; label: string }[]
}) {
  // The quiet case, and it has to stay quiet: most riffs reach everything, and
  // a line saying "reaches X and LinkedIn" on every card would be chrome that
  // is right most of the time and therefore never read.
  if (gaps.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      {gaps.map((channel) => (
        <Gap key={channel.id} riffId={riffId} channel={channel} />
      ))}
    </div>
  )
}

function Gap({
  riffId,
  channel,
}: {
  riffId: string
  channel: { id: string; label: string }
}) {
  const router = useRouter()
  const [outcome, setOutcome] = React.useState<Outcome>({ kind: "idle" })
  const [pending, startTransition] = React.useTransition()

  function ask() {
    setOutcome({ kind: "working" })
    startTransition(async () => {
      /**
       * The `try` is not optional, and leaving it out shipped a hang.
       *
       * A server action rejects rather than resolving when the request never
       * reaches the server or the server returns a 500 — a dropped connection,
       * a deploy mid-click. `outcome` is set to `working` *before* the
       * transition, and only the resolved paths below clear it, so a rejection
       * left the row spinning forever with no way back except a page reload.
       * `AdaptBox` and `RecordBox` both already wrap their action calls for
       * exactly this; this one did not.
       */
      try {
        // The riff id and the channel id, and nothing else. Hook, material and
        // ownership are read from the row server-side — a client that could
        // name the scrap could spend this account's budget on any text it liked.
        const result = await askForChannelAngle({ riffId, channel: channel.id })

        if (!result.ok) {
          setOutcome({ kind: "failed", message: result.message })
          return
        }

        if (!result.found) {
          setOutcome({ kind: "empty" })
          return
        }

        // The angle is on the row now; /riffs is a server component, so it has
        // to re-read. The gap closes on its own once the new angle covers it.
        setOutcome({ kind: "idle" })
        router.refresh()
      } catch {
        setOutcome({
          kind: "failed",
          message: "Could not reach Quincy. Try again.",
        })
      }
    })
  }

  if (outcome.kind === "working" || pending) {
    return (
      <p
        role="status"
        className="text-caption text-muted-foreground flex items-center gap-2"
      >
        <HugeiconsIcon
          aria-hidden="true"
          icon={Loading03Icon}
          className="size-3.5 animate-spin"
        />
        {/* Phrased so no indefinite article is needed. The first version wrote
            "a/an" from a first-letter table, which is a rule about how a
            *letter* is pronounced and not about how a *word* is — it rendered
            "an LinkedIn angle" and "an Substack angle", two of the four labels
            that exist. Rewording is the fix; a pronunciation table for brand
            names is not something this file should own. */}
        Looking for something for {channel.label} in this…
      </p>
    )
  }

  /**
   * The honest no.
   *
   * Muted rather than destructive, because nothing broke: the material
   * genuinely did not carry a second post, and `CHANNEL_ANGLE_RULES` names
   * refusing as a correct answer precisely so this outcome exists instead of a
   * reworded duplicate of an angle the user already has.
   *
   * It does not re-offer until dismissed. A button that fails and immediately
   * invites you to press it again is a button that gets pressed again, and each
   * press is another model call against the same material that just came back
   * empty.
   */
  if (outcome.kind === "empty") {
    return (
      <div className="flex flex-wrap items-center gap-2" role="status">
        <p className="text-caption text-muted-foreground max-w-[60ch] text-pretty">
          Quincy could not find anything for {channel.label} in this one without
          repeating what is already here.
        </p>
        <Button
          variant="ghost"
          size="xs"
          className="text-muted-foreground"
          onClick={() => setOutcome({ kind: "idle" })}
        >
          Dismiss
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      {/* A real failure — no entitlement, no connection, the model threw. The
          action's own sentence, unedited: it is the only thing that knows
          which one happened, and it already names the fix. */}
      {outcome.kind === "failed" ? (
        <p role="status" className="text-caption text-destructive text-pretty">
          {outcome.message}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <p className="text-caption text-muted-foreground inline-flex items-center gap-1.5">
          {/* `currentColor`, so the mark sits at the weight of the sentence
              around it rather than pulling the eye with a brand colour. */}
          <span aria-hidden="true" className="inline-flex">
            <PlatformMark platform={channel.id} size={13} />
          </span>
          Nothing here goes to {channel.label}.
        </p>
        <Button
          variant="outline"
          size="xs"
          disabled={pending}
          // Names the channel rather than saying "Ask". A riff with two gaps
          // has two of these, and two buttons both reading "Ask" are two a
          // screen reader cannot tell apart.
          onClick={ask}
        >
          {outcome.kind === "failed" ? "Try again" : `Make one for ${channel.label}`}
        </Button>
      </div>
    </div>
  )
}

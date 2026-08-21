"use client"

import * as React from "react"
import { ArrowRight01Icon, Delete02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import type { Angle, Riff } from "@/lib/riffs"
import { Button } from "@/components/ui/button"

import type { Board } from "./state"

/**
 * The controls, wired to the local board.
 *
 * Everything *presentational* on this surface comes from
 * `components/riffs/riff-parts.tsx` — `Provenance`, `Scrap`, `AngleCard`,
 * `AnglesPending`, `RiffFailed`, `Steer`. What is reimplemented here is only
 * the handful of controls that would otherwise call a server action, and they
 * keep the production markup exactly: same variant, same size, same icon, same
 * label, same `aria-label`. What is being compared is layout, and a button that
 * looked different in a variant would be comparing the button instead.
 */

/**
 * One angle's actions.
 *
 * Deliberately not brass, and the reasoning is `AngleActions`' own: each angle
 * is its own post, so the decision belongs per-angle — but three angles means
 * three of these on a card, and three filled primaries stacked is the textbook
 * way to end up with no clear next step. More than that, brass on one of them
 * would mean Quincy had picked, and picking is the job this page hands to you.
 *
 * Discard sits at the far edge with the width between them. Proximity implies
 * equivalence, and drafting and discarding are not equivalent in either
 * direction.
 */
export function ProtoAngleActions({
  angle,
  board,
}: {
  angle: Angle
  board: Board
}) {
  const pending = board.drafting === angle.id
  // Any draft in flight locks all of them, matching the production button's
  // `disabled={pending}`: two writes racing over one queue is not a state
  // worth designing for.
  const busy = board.drafting !== null

  return (
    <div className="flex items-center gap-2 pt-1">
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        aria-label={`Draft: ${angle.hook}`}
        onClick={() => board.draft(angle.id)}
      >
        {pending ? "Drafting…" : "Draft this"}
        <HugeiconsIcon
          aria-hidden="true"
          data-icon="inline-end"
          icon={ArrowRight01Icon}
        />
      </Button>

      <Button
        variant="ghost"
        size="sm"
        disabled={busy}
        className="ml-auto text-muted-foreground"
        aria-label={`Discard: ${angle.hook}`}
        onClick={() => board.discardAngle(angle.id)}
      >
        <HugeiconsIcon aria-hidden="true" icon={Delete02Icon} />
        Discard
      </Button>
    </div>
  )
}

/**
 * The riff-level way out.
 *
 * Relabels once something has been taken, because "Nothing here" and "discard
 * what is left" are different sentences and the button should say which one it
 * is about to do. Ghost rather than destructive-red: dropping a riff loses
 * nothing that was ever written.
 */
export function ProtoRiffFooter({
  riff,
  board,
  className,
}: {
  riff: Riff
  board: Board
  className?: string
}) {
  const anyDrafted = riff.angles.some((a) => a.status === "drafted")

  return (
    <Button
      variant="ghost"
      size="sm"
      className={"self-start text-muted-foreground " + (className ?? "")}
      onClick={() => board.discardRiff(riff.id)}
    >
      {anyDrafted ? "Discard the rest" : "Nothing here"}
    </Button>
  )
}

/**
 * Capture is stubbed in `frame.tsx`, not here.
 *
 * Round two's version of this file drove a fake capture that pushed a `working`
 * riff onto the queue, because the arrival moment was part of what Desk was
 * being judged on. Desk shipped; neither of round three's variants asks
 * anything about capture, so the instrument renders its two buttons disabled
 * rather than faking a queue event nobody is looking at.
 */

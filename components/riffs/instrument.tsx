import { Mic01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { AdaptBox } from "./adapt-box"
import { RecordBox } from "./record-box"

/**
 * Capture, as the subject of the page rather than a control in its corner.
 *
 * **Decided from the four-way prototype at /prototypes/riffs on 2026-08-08**
 * (Current / Angles / Fold / Desk), and the deciding evidence was the `riff`
 * table rather than the picker. At the time of the decision the whole product
 * held **six riffs across two accounts, all created that day**, the largest
 * single queue was **four**, and every one of them came from voice or paste —
 * zero from a connected source, with 25 of 28 rhythms still `available: false`.
 * Three of twelve angles had become drafts, so the funnel converts once
 * material is in. The bottleneck is that almost nothing goes in.
 *
 * Until this, the page put the thing it exists for — say a half-thought and
 * find angles waiting — behind a 28px outline button in the top right that
 * only rendered *once you already had a queue*. The activation loop is
 * "speak → angles → draft", and the page de-emphasised step one immediately
 * after the first success.
 *
 * **Rejected, and why:**
 *
 * - **Fold** (queue collapses to rows, one open) was the runner-up and the
 *   instinct in the room. It solves the long scroll, which at four riffs is
 *   about 1,600px — real, but modest — and it charges a click on every riff to
 *   do it. Its value curve rises with queue size and the queue is four. It is
 *   the right change later and it *composes with this one*: the collapsed row
 *   is a state, not a layout, so it can be added under this instrument the day
 *   an account crosses roughly ten riffs. That number is the trigger.
 * - **Angles** (the angle becomes the row, riffs stop being containers) fixed a
 *   real mismatch — the header counts angles and the page lays out riffs — but
 *   it gives up scrap/angle adjacency, which is the comparison this page exists
 *   to support: does this angle earn the thing I said?
 * - **Current** (the stream) stayed as the baseline and lost on the argument
 *   above: it is a layout for reading results on a page whose problem is input.
 *
 * The cost, stated plainly: this takes roughly 200px off the top of the page on
 * every visit, including the visits where you came only to decide. That is
 * affordable at four riffs and gets worse as the queue grows, which is the same
 * threshold that brings Fold in.
 */
export function Instrument() {
  return (
    <div className="bg-card flex flex-col gap-4 rounded-xl p-5 shadow-xs sm:flex-row sm:items-center">
      {/* Decorative: the heading beside it already says what this is, and a
          second announcement of "microphone" would be noise. `signal` is the
          product's "this is live" colour and this is the one place on the page
          that earns it — everything below is a decision, and decisions here are
          deliberately quiet. */}
      <div
        aria-hidden="true"
        className="bg-signal-surface text-signal-foreground flex size-11 shrink-0 items-center justify-center rounded-lg select-none"
      >
        <HugeiconsIcon icon={Mic01Icon} className="size-5" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 className="text-card-title">Say what happened</h2>
        <p className="text-caption text-muted-foreground max-w-[60ch] text-pretty">
          However it comes out. Quincy reads through the false starts, and you
          hear the take back before anything is sent.
        </p>
      </div>

      {/* Full size rather than the `sm` these carried in the page header: here
          they are the page's primary action, and a 28px button in the corner is
          what this component exists to argue against.

          `instrument` gives Record the filled weight and leaves Adapt an
          outline. Two filled buttons side by side is two primaries, which is
          none — and the one that produces the user's own material wins, for the
          same reason it wins the order. */}
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <RecordBox variant="instrument" />
        <AdaptBox variant="instrument" />
      </div>
    </div>
  )
}

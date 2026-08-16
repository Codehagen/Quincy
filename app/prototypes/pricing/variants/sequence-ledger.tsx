"use client"

import { PRICE, REFUSALS, SEQUENCE } from "../data"
import { CallToAction } from "../chrome"
import {
  TrackEyebrow,
  TrackHeading,
  TrackRow,
  useWalk,
  WalkButton,
} from "../parts"

/**
 * Round two, variant 2 — **Sequence**. Axis: the contract's left column is a
 * sequence, not an inventory.
 *
 * Ledger won round one on its two-sided shape; the timeline won on being the
 * only thing on the page that moved and the only thing that showed an order.
 * This is the smallest honest merge of the two: keep the ledger exactly — same
 * 3fr/2fr split, same divider, same refusals on the right — and replace the
 * six-row "what it buys" inventory with the five-step sequence, walked.
 *
 * The bet is that a list of nouns and a list of steps answer different
 * questions, and at a price the second one is the better answer. "A brain you
 * edit directly" tells somebody what exists. "It reads your posts back and
 * writes down how you sound, and you correct the parts it got wrong" tells
 * them what Tuesday looks like — and, unlike the noun, it says who does the
 * work. That is the thing they are actually buying.
 *
 * Its cost is smaller than it was predicted to be. The worry was that a
 * sequence runs longer per row than the inventory did and would leave the
 * refusals stranded high against a trailing divider; measured at 1440, the
 * steps end 65px below the refusals, which reads as balanced rather than as a
 * column that gave up. The real cost is subtler: the steps are the argument
 * and they are in the narrower half of a 3fr/2fr split, so the thing you most
 * want read is the thing set in the tighter measure.
 */
export function SequenceLedger() {
  const { reached, running, motionOk, start } = useWalk(SEQUENCE.length)

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col px-6 pt-16 pb-24">
      <section className="flex flex-col items-start gap-6">
        <h1 className="max-w-[22ch] text-display text-balance">
          One plan, five steps, and a list of what it will never do.
        </h1>

        <p className="flex flex-wrap items-baseline gap-x-2 text-[1.75rem] leading-[1.2] font-semibold tracking-[-0.015em]">
          {PRICE.figure} {PRICE.period}
          <span className="text-body font-normal tracking-normal text-muted-foreground">
            {PRICE.currency}, after a free first day that takes no card
          </span>
        </p>

        <div className="pt-2">
          <CallToAction
            secondary={{ href: "/why", label: "Why it works this way" }}
          />
        </div>
      </section>

      <div className="mt-20 grid gap-x-12 gap-y-16 md:grid-cols-[3fr_2fr]">
        <section aria-labelledby="sequence-heading">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-8">
            <h2
              id="sequence-heading"
              className="text-eyebrow text-muted-foreground uppercase"
            >
              What the first day looks like
            </h2>
            <WalkButton
              onStart={start}
              running={running}
              motionOk={motionOk}
              label="Walk it through"
            />
          </div>

          {/* `gap-8` is load-bearing — `TrackRow` derives its connector length
              from it. See the geometry note in parts.tsx. */}
          <ol className="flex flex-col gap-8 pl-8">
            {SEQUENCE.map((step, index) => (
              <TrackRow
                key={step.label}
                lit={index <= reached}
                filled={index < reached}
                last={index === SEQUENCE.length - 1}
              >
                {/* The eyebrow is the step number rather than a state name:
                    round one's track was five states an account moves through,
                    where the name carried meaning. This one is an order, and
                    the number is what says so. */}
                <TrackEyebrow lit={index <= reached}>
                  {String(index + 1).padStart(2, "0")}
                </TrackEyebrow>
                <TrackHeading
                  lit={index <= reached}
                  className="max-w-[34ch] text-section text-balance"
                >
                  {step.label}
                </TrackHeading>
                <p className="max-w-[45ch] text-body text-pretty text-muted-foreground">
                  {step.quincy}
                </p>
              </TrackRow>
            ))}
          </ol>
        </section>

        <section
          aria-labelledby="refusals-heading"
          className="md:border-l md:border-border md:pl-12"
        >
          <h2
            id="refusals-heading"
            className="pb-8 text-eyebrow text-muted-foreground uppercase"
          >
            What it will never do
          </h2>
          <ul className="flex flex-col">
            {REFUSALS.map((row) => (
              <li
                key={row.never}
                className="flex flex-col gap-1.5 border-t border-border py-5 first:border-t-0 first:pt-0 last:pb-0"
              >
                <h3 className="text-card-title text-balance">{row.never}</h3>
                <p className="text-body text-pretty text-muted-foreground">
                  {row.because}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="mt-20 flex flex-col items-start gap-6">
        <p className="max-w-[26ch] text-[1.75rem] leading-[1.2] font-semibold tracking-[-0.015em] text-balance">
          Five steps, and the last one is you saying yes.
        </p>
        <CallToAction
          secondary={{ href: "/login", label: "I already have an account" }}
        />
      </section>
    </div>
  )
}

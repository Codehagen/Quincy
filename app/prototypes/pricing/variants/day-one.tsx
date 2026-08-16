"use client"

import { PRICE, REFUSALS, SEQUENCE } from "../data"
import { CallToAction } from "../chrome"
import {
  EnterFallbackStyle,
  TrackEyebrow,
  TrackHeading,
  TrackRow,
  useEnterOnce,
} from "../parts"

/**
 * Round two, variant 4 — **Day one**. Axis: the sequence *is* the page, and
 * the contract is what closes it.
 *
 * The other two hybrids keep the ledger's frame and fit a sequence into it.
 * This one goes the other way: if the five steps are what somebody is buying,
 * then they deserve the full measure rather than a 3fr column, and the
 * "what it buys" inventory is redundant the moment the steps are on the page —
 * the steps *are* the inventory, in the order you meet them.
 *
 * So there is no left-hand column and no divider. The track runs at full
 * width with room for a real body per step, and the refusals land underneath
 * as a compact band: the terms, after the tour.
 *
 * **This is the one that animates on arrival rather than on a press.** With
 * the steps promoted to the body of the page, a control asking you to watch
 * them was asking you to sit through what you came to read. So the walk is
 * gone and the rows simply arrive as the track scrolls into view — nothing
 * dims, nothing is withheld, and the whole entrance is over in under half a
 * second. `useEnterOnce` in ../parts carries the reasoning and the numbers.
 *
 * Its cost: it is the least like a pricing page of the three. A visitor who
 * came to compare a number against something else finds a product tour with a
 * price at the top, and if they wanted the contract they have to scroll past
 * the whole first day to reach it.
 */
export function DayOne() {
  const { ref, shown } = useEnterOnce()

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col px-6 pt-16 pb-24">
      <section className="flex flex-col items-start gap-6">
        <h1 className="max-w-[20ch] text-display text-balance">
          This is the whole of it. Five steps, then it waits for you.
        </h1>

        <p className="max-w-[45ch] text-body-lg text-pretty text-muted-foreground">
          {PRICE.figure} {PRICE.period} in {PRICE.currency}, after a free first
          day that does not ask for a card. Here is what you would spend that
          day doing.
        </p>

        <div className="pt-2">
          <CallToAction
            secondary={{ href: "/why", label: "Why it works this way" }}
          />
        </div>
      </section>

      <section className="mt-20" aria-labelledby="sequence-heading">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-10">
          <h2 id="sequence-heading" className="text-section">
            What the first day looks like
          </h2>
        </div>

        <EnterFallbackStyle />

        {/* Every row is `lit`. The entrance moves them, it never dims them —
            which is what makes autoplaying it fair to somebody who scrolled
            here to read step five. */}
        <ol ref={ref} className="flex flex-col gap-8 pl-8">
          {SEQUENCE.map((step, index) => (
            <TrackRow
              key={step.label}
              lit
              filled
              last={index === SEQUENCE.length - 1}
              enter={{ shown, index }}
            >
              <TrackEyebrow lit>
                {String(index + 1).padStart(2, "0")}
              </TrackEyebrow>
              {/* At full width the heading can take the display-adjacent step
                  rather than `text-section`: this is the page's body, not a
                  column inside it, and a 17px heading at this measure reads as
                  a list item rather than as a beat. */}
              <TrackHeading
                lit
                className="max-w-[34ch] text-[1.375rem] leading-[1.25] font-semibold tracking-[-0.01em] text-balance"
              >
                {step.label}
              </TrackHeading>
              <p className="max-w-[45ch] text-body-lg text-pretty text-muted-foreground">
                {step.quincy}
              </p>
            </TrackRow>
          ))}
        </ol>
      </section>

      <section className="mt-20" aria-labelledby="refusals-heading">
        <h2
          id="refusals-heading"
          className="pb-8 text-eyebrow text-muted-foreground uppercase"
        >
          And the things it will never do
        </h2>
        <ul className="grid gap-x-10 gap-y-8 md:grid-cols-3">
          {REFUSALS.map((row) => (
            <li
              key={row.never}
              className="flex flex-col gap-1.5 border-t border-border pt-5"
            >
              <h3 className="text-card-title text-balance">{row.never}</h3>
              <p className="text-body text-pretty text-muted-foreground">
                {row.because}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-20 flex flex-col items-start gap-6">
        <p className="max-w-[26ch] text-[1.75rem] leading-[1.2] font-semibold tracking-[-0.015em] text-balance">
          A day is enough to get through all five.
        </p>
        <CallToAction
          secondary={{ href: "/login", label: "I already have an account" }}
        />
      </section>
    </div>
  )
}

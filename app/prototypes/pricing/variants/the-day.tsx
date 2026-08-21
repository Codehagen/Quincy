"use client"

import { DAY, PRICE } from "../data"
import { CallToAction } from "../chrome"
import {
  TrackEyebrow,
  TrackHeading,
  TrackRow,
  useWalk,
  WalkButton,
} from "../parts"

/**
 * Round one, variant 2 — **The day**. Axis: the billing mechanism is the pitch.
 *
 * Out of the picker after round one and kept on disk, because the thing it
 * proved is still true and may want to come back as a section rather than a
 * page: the persuasive thing here is not $49, it is that the card comes out at
 * the end. Every competitor's "free trial" collects a card before the product
 * has written a sentence, and `docs/billing.md` chose the harder path on
 * purpose — the free day is application state precisely so that no card is
 * needed to start.
 *
 * What round two changed is the *content* of the track, not the track. This
 * one walks the five states an account moves through (`Entitlement` in
 * `lib/entitlement.ts`); the round-two hybrids walk the five things a person
 * does. Both use the same primitives from parts.tsx, which is where the rail
 * geometry and the run now live.
 *
 * One import and one line in harness.tsx from returning.
 */
export function TheDay() {
  const { reached, running, motionOk, start } = useWalk(DAY.length)

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col px-6 pt-16 pb-24">
      <section className="flex flex-col items-start gap-6">
        <h1 className="max-w-[20ch] text-display text-balance">
          The first day is free, and we do not take your card to start.
        </h1>
        {/* The price is here, in the second sentence, for the visitor who came
            to this page for one number and should not have to read a story to
            find it. The story is what the rest of the page is for. */}
        <p className="max-w-[45ch] text-body-lg text-pretty text-muted-foreground">
          {PRICE.figure} {PRICE.period} afterwards, in {PRICE.currency}. The day
          does not start when you sign up — it starts when you click the link in
          the verification email, which is the only honest place to start it.
        </p>
        <div className="pt-2">
          <CallToAction
            secondary={{ href: "/why", label: "Why it works this way" }}
          />
        </div>
      </section>

      <section className="mt-20" aria-labelledby="day-heading">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-10">
          <h2 id="day-heading" className="text-section">
            What the first day actually is
          </h2>
          <WalkButton
            onStart={start}
            running={running}
            motionOk={motionOk}
            label="Watch the day pass"
          />
        </div>

        <ol className="flex flex-col gap-8 pl-8">
          {DAY.map((step, index) => (
            <TrackRow
              key={step.at}
              lit={index <= reached}
              filled={index < reached}
              last={index === DAY.length - 1}
            >
              <TrackEyebrow lit={index <= reached}>{step.at}</TrackEyebrow>
              <TrackHeading
                lit={index <= reached}
                className="max-w-[40ch] text-section text-balance"
              >
                {step.label}
              </TrackHeading>
              {/* The body never dims. It is muted at rest anyway, and dimming
                  it further would make the run a readability cost rather than
                  an emphasis. */}
              <p className="max-w-[45ch] text-body text-pretty text-muted-foreground">
                {step.body}
              </p>
            </TrackRow>
          ))}
        </ol>
      </section>

      <section className="mt-20 flex flex-col items-start gap-6">
        <p className="max-w-[26ch] text-[1.75rem] leading-[1.2] font-semibold tracking-[-0.015em] text-balance">
          Spend a day before you spend anything.
        </p>
        <CallToAction
          secondary={{ href: "/login", label: "I already have an account" }}
        />
      </section>
    </div>
  )
}

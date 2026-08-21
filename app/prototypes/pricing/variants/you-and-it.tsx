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
 * Round two, variant 3 — **You and it**. Axis: the sequence is itself the
 * two-sided thing.
 *
 * This one comes straight out of how the setup gets described out loud: *you*
 * connect the accounts, *you* add the channels, and then *we* generate as you
 * go. That sentence alternates, and the alternation is the product — every row
 * is a move you make and the thing Quincy does back, five times, ending on the
 * one row where Quincy's move is to stop.
 *
 * Two columns are what make row 02 and row 03 legible. You press import; it
 * writes down how you sound. You correct that; it never overwrites your
 * correction again. Neither half means much alone, and a single-voice list has
 * to pick which half to print.
 *
 * So the ledger's two columns stop being "what it buys" against "what it
 * refuses" and become **You** against **Quincy**. The refusals do not
 * disappear; they drop below as the closing band, which is arguably where they
 * always belonged — a refusal is not a feature you compare, it is the terms
 * you accept.
 *
 * The last row is the argument for the whole layout. Read across it: *you*
 * approve or rewrite the line you do not like; *Quincy* stops. Two columns put
 * those beside each other on one line, which no single-voice list can do.
 *
 * Its cost: two columns of prose per row is a lot of text at once, and on a
 * phone they stack, so the alternation — the entire point — flattens back into
 * a single list of ten paragraphs.
 */
export function YouAndIt() {
  const { reached, running, motionOk, start } = useWalk(SEQUENCE.length)

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col px-6 pt-16 pb-24">
      <section className="flex flex-col items-start gap-6">
        <h1 className="max-w-[20ch] text-display text-balance">
          You do five things. Quincy does the rest, and then it stops.
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

      <section className="mt-20" aria-labelledby="sequence-heading">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-8">
          <h2 id="sequence-heading" className="text-section">
            What the first day looks like
          </h2>
          <WalkButton
            onStart={start}
            running={running}
            motionOk={motionOk}
            label="Walk it through"
          />
        </div>

        {/* The column headers are stated once, at the top, rather than repeated
            per row — that is what turns ten paragraphs into a table you read
            across. Dropped entirely below `md`, where the two sides stack and
            a header for a column that no longer exists would point at nothing;
            each row grows its own "You" / "Quincy" label there instead.

            18rem rather than a fraction: at `1fr` the left column was 431px
            holding about 250px of text, which left a 250px trench between the
            move and the response. A two-sided row only reads as two-sided if
            the eye can cross it. */}
        <div className="hidden gap-x-12 pb-4 pl-8 md:grid md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
          <span className="text-eyebrow text-muted-foreground uppercase">
            You
          </span>
          <span className="text-eyebrow text-muted-foreground uppercase">
            Quincy
          </span>
        </div>

        <ol className="flex flex-col gap-8 pl-8">
          {SEQUENCE.map((step, index) => (
            <TrackRow
              key={step.label}
              lit={index <= reached}
              filled={index < reached}
              last={index === SEQUENCE.length - 1}
            >
              {/* Below `md` the two sides stack, so each one needs its own
                  label or the reader loses which voice is speaking. Above it,
                  the column headers do that job and these would be noise. */}
              <div className="grid gap-x-12 gap-y-4 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
                <div className="flex flex-col gap-1.5">
                  <TrackEyebrow lit={index <= reached}>
                    <span className="md:hidden">You</span>
                    <span className="hidden md:inline">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </TrackEyebrow>
                  <TrackHeading
                    lit={index <= reached}
                    className="max-w-[30ch] text-section text-balance"
                  >
                    {step.you}
                  </TrackHeading>
                </div>

                <div className="flex flex-col gap-1.5">
                  <TrackEyebrow lit={index <= reached}>
                    <span className="md:hidden">Quincy</span>
                    {/* Above md the left column's number already labels the
                        row, and a second eyebrow here would double-count it.
                        The span keeps the baseline so both columns start at the
                        same height. */}
                    <span aria-hidden="true" className="hidden md:inline">
                      &nbsp;
                    </span>
                  </TrackEyebrow>
                  <p className="max-w-[45ch] text-body text-pretty text-muted-foreground">
                    {step.quincy}
                  </p>
                </div>
              </div>
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
        {/* Three across rather than a column: down here the refusals are the
            terms rather than the pitch, and a band reads as terms. */}
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
          The last move on that list is yours.
        </p>
        <CallToAction
          secondary={{ href: "/login", label: "I already have an account" }}
        />
      </section>
    </div>
  )
}

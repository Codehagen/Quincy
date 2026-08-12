import Link from "next/link"

import { constructMetadata } from "@/lib/metadata"
import { Button } from "@/components/ui/button"

import { PRICE, QUESTIONS, REFUSALS } from "./copy"
import { Track } from "./track"

/**
 * The price, and what the first day actually looks like.
 *
 * Chosen from four directions built as a live picker in
 * `app/prototypes/pricing`; plans/020 records the comparison. The short of it:
 * a list of nouns ("a brain you edit directly") tells a stranger what exists,
 * and a list of steps tells them what Tuesday looks like. At a price, the
 * second is the better answer — so the sequence *is* the page here rather than
 * one column of a feature table, and it gets the full measure.
 *
 * The known cost of that choice, stated so nobody has to rediscover it: this is
 * the least conventional-looking pricing page of the four. Somebody who arrived
 * to compare a number against a competitor finds a product tour with a price on
 * top. The mitigation is that the number and both CTAs are above the fold, and
 * the contract — the refusals, then the three billing questions — closes the
 * page for the reader who came for terms.
 *
 * A server component; only the track is a client island, because only the
 * entrance needs an observer.
 */
export const metadata = constructMetadata({
  title: "Pricing",
  description:
    "$49 a month, one plan, after a free first day that takes no card. What the first day looks like, and the things Quincy will never do.",
  canonicalUrl: "/pricing",
})

export default function PricingPage() {
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

        <div className="flex flex-wrap items-center gap-3 pt-2">
          {/* "Join the waitlist" rather than "Start the free day": the old
              label promised an immediate free day, and the door behind it
              cannot deliver one right now — a stranger who presses it joins a
              list, not a signup form. The label should say what pressing it
              costs, which is nothing, and also what happens next, which is a
              wait.

              h-11 because `buttonVariants` tops out at lg = 36px, which is app
              chrome. A marketing size belongs in the variants file the day a
              second marketing surface needs it.

              When signup reopens to strangers, this and the footer CTA below
              are the two hrefs to point back at `/signup`. */}
          <Button
            nativeButton={false}
            size="lg"
            className="h-11 px-5 text-[0.9375rem]"
            render={<Link href="/#join" />}
          >
            Join the waitlist
          </Button>
          <Link
            href="/why"
            className="relative rounded-sm text-[0.9375rem] text-muted-foreground underline-offset-4 ring-ring outline-hidden transition-colors duration-150 hover:text-foreground hover:underline focus-visible:ring-2 pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:top-1/2 pointer-coarse:after:h-11 pointer-coarse:after:-translate-y-1/2"
          >
            Why it works this way
          </Link>
        </div>
      </section>

      <section className="mt-20" aria-labelledby="sequence-heading">
        <h2 id="sequence-heading" className="pb-10 text-section">
          What the first day looks like
        </h2>
        <Track />
      </section>

      <section className="mt-20" aria-labelledby="refusals-heading">
        <h2
          id="refusals-heading"
          className="pb-8 text-eyebrow uppercase text-muted-foreground"
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

      {/* The three questions someone actually has at a price. Prose rather than
          an accordion: there are three, they are short, and hiding an answer
          about money behind a press is the wrong instinct on this page. */}
      <section className="mt-20" aria-labelledby="questions-heading">
        <h2
          id="questions-heading"
          className="pb-8 text-eyebrow uppercase text-muted-foreground"
        >
          Before you decide
        </h2>
        <dl className="grid gap-x-10 gap-y-8 md:grid-cols-3">
          {QUESTIONS.map((row) => (
            <div key={row.q} className="flex flex-col gap-1.5">
              <dt className="text-card-title text-balance">{row.q}</dt>
              <dd className="text-body text-pretty text-muted-foreground">
                {row.a}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-20 flex flex-col items-start gap-6">
        <p className="max-w-[26ch] text-[1.75rem] leading-[1.2] font-semibold tracking-[-0.015em] text-balance">
          A day is enough to get through all five.
        </p>
        {/* One action, no "I already have an account" beside it — the same rule
            the marketing header follows since the waitlist went in front
            (plans/023). A stranger reading a price has nothing to log in to,
            and an invited tester reaches `/login` from the link in their mail.
            Both routes are untouched; they are gone from this page, not from
            the app. */}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            nativeButton={false}
            size="lg"
            className="h-11 px-5 text-[0.9375rem]"
            render={<Link href="/#join" />}
          >
            Join the waitlist
          </Button>
        </div>
      </section>
    </div>
  )
}

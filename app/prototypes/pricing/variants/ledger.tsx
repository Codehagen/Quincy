import { INCLUDED, PRICE, REFUSALS } from "../data"
import { CallToAction } from "../chrome"

/**
 * Variant 3 — **Ledger**. Axis: the price answered as a contract.
 *
 * The bet: the question at a price is not "what does it do", it is "is this
 * worth it, and what am I handing over". So the page is two sides — what the
 * $49 buys, and the things Quincy will not do with your name whatever it is
 * paid. The second column is the one that does the selling; the first is table
 * stakes on any pricing page and the second is on almost none.
 *
 * This direction lost the last round as a whole landing page, and it is worth
 * saying why it is back: a stranger arriving at "/" has not asked for a
 * contract yet, so leading with refusals answered a question nobody had put.
 * A stranger arriving at /pricing has put it. Same material, right doorway.
 *
 * The split is deliberately not symmetric — 3fr against 2fr. A ledger drawn as
 * two equal columns reads as a comparison of two things you might choose
 * between, and these are not alternatives: the left is the purchase and the
 * right is the guarantee attached to it. The divider is a real border because
 * it is doing separation rather than elevation, which is the one job borders
 * keep.
 *
 * Its cost: it is the least warm of the three. Six rows of what-you-get beside
 * five rows of what-we-refuse is a document, and a document is a strange thing
 * to meet at the moment somebody is deciding to like you.
 */
export function Ledger() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col px-6 pt-16 pb-24">
      <section className="flex flex-col items-start gap-6">
        <h1 className="max-w-[22ch] text-display text-balance">
          One plan, and a list of what it will never do.
        </h1>

        {/* The price sits in its own line at display weight but body size —
            loud enough to be the first thing found, quiet enough that the
            headline still leads. Nothing here ticks or stacks, so the figures
            stay proportional rather than tabular. */}
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
        <section aria-labelledby="included-heading" className="md:pr-2">
          <h2
            id="included-heading"
            className="pb-8 text-eyebrow text-muted-foreground uppercase"
          >
            What it buys
          </h2>
          <ul className="flex flex-col">
            {INCLUDED.map((row) => (
              <li
                key={row.item}
                className="flex flex-col gap-1.5 border-t border-border py-5 first:border-t-0 first:pt-0 last:pb-0"
              >
                <h3 className="text-section text-balance">{row.item}</h3>
                <p className="max-w-[45ch] text-body text-pretty text-muted-foreground">
                  {row.body}
                </p>
              </li>
            ))}
          </ul>
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
                {/* Not `text-section`: these have to read as quieter than the
                    left column, or the page argues that the refusals are the
                    product. They are the guarantee on the product. */}
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
          Read the right-hand column twice. That is the part you are buying.
        </p>
        <CallToAction
          secondary={{ href: "/login", label: "I already have an account" }}
        />
      </section>
    </div>
  )
}

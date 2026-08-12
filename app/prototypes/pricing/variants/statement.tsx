import { PRICE, QUESTIONS } from "../data"
import { CallToAction } from "../chrome"

/**
 * Variant 1 — **Statement**. Axis: the price is copy, not furniture.
 *
 * The bet: a product with one plan should look like a product with one plan. A
 * pricing table holding a single column is a table that wanted three and did
 * not get them, and every piece of table chrome — the card, the border, the
 * tier name, the row of ticks — is there to help a reader compare against
 * options that do not exist here. Strip all of it and what is left is a
 * sentence, which is also the fastest thing on the page to read.
 *
 * So the price is the headline. Not a number inside a card under a headline
 * about value: the h1 itself, at display size, saying the two things a stranger
 * came for — what it costs and what it costs to try.
 *
 * What this variant deliberately does not do is argue. There is no list of what
 * $49 buys, because the landing page is where that argument belongs and
 * repeating it here would be a second pitch aimed at somebody who has already
 * been pitched. The three questions at the bottom are answers, not selling: the
 * three a stranger actually holds at a price — when am I charged, what happens
 * if I do nothing, and how do I leave.
 *
 * Its cost is real and goes in the table: a visitor who arrives here cold, from
 * a link straight to /pricing, gets no help deciding whether the thing is worth
 * $49.
 */
export function Statement() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col px-6 pt-16 pb-24">
      <section className="flex flex-col items-start gap-6">
        {/* The one-off size is the point of the variant, and it is also the
            `--text-hero` step the last run wrote down as missing: the scale
            tops out at `--text-display` (40px), which is sized for app chrome
            and reads as a section heading rather than as the number somebody
            came to the page to find. 44px climbing to 56px, with tracking
            tightened a touch further than the display step as the size grows —
            per the scale rule, tracking follows size.

            No `tabular-nums`. Nothing here ticks or stacks in a column, and
            proportional figures set a single large number better. */}
        <h1 className="max-w-[16ch] text-[2.75rem] leading-[1.05] font-semibold tracking-[-0.02em] text-balance sm:text-[3.5rem]">
          {PRICE.figure} {PRICE.period}.{" "}
          {/* The second half carries the whole offer and is the reason the
              headline is two-tone rather than two elements: it has to read as
              one sentence, spoken once, and a muted paragraph underneath would
              turn it into a claim plus a caveat.

              `sm:block` for the same reason the live landing page breaks its
              headline by hand: left to `text-balance` this wrapped as "$49 a
              month. The / first day is free.", which strands the article at
              the end of the first line and splits one clause across two
              colours. Two sentences, two lines, from 640px up. */}
          <span className="text-muted-foreground sm:block">
            The first day is free.
          </span>
        </h1>

        {/* The currency is stated because the company selling this is Norwegian
            and the charge is not in kroner — a visitor in Oslo reading "$49"
            and being charged in dollars is a support ticket.

            45ch, not the 55ch the live page uses, and the difference is a bug
            rather than a preference: measured in this font, `62ch` renders 93
            characters, because `ch` is the width of `0` (9.28px) and the
            average character is 6.17px. Every `ch` cap in the codebase is
            running about 50% wider than it reads as. 45ch lands at ~68
            characters, inside the 45–75 band. */}
        <p className="max-w-[45ch] text-body-lg text-pretty text-muted-foreground">
          {PRICE.currency}. Quincy does not ask for a card to start, and the
          free day does not begin until you click the link in the verification
          email — not the moment you sign up.
        </p>

        <div className="pt-2">
          <CallToAction
            secondary={{ href: "/why", label: "Why it works this way" }}
          />
        </div>
      </section>

      {/* A description list, because that is what this is: three terms and
          three definitions. Not an accordion — every answer here is one
          sentence, and hiding one sentence behind a press is interaction
          charging rent. */}
      <section className="mt-24" aria-labelledby="questions-heading">
        <h2 id="questions-heading" className="sr-only">
          Questions about the price
        </h2>
        <dl className="flex flex-col">
          {QUESTIONS.map((item) => (
            <div
              key={item.q}
              className="flex flex-col gap-2 border-t border-border py-6 first:pt-0 last:pb-0 md:grid md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] md:gap-10"
            >
              {/* The border is doing separation, not elevation, so it stays a
                  border rather than becoming a shadow. */}
              <dt className="text-section text-balance">{item.q}</dt>
              <dd className="max-w-[45ch] text-body text-pretty text-muted-foreground">
                {item.a}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-20 flex flex-col items-start gap-6">
        <p className="max-w-[24ch] text-[1.75rem] leading-[1.2] font-semibold tracking-[-0.015em] text-balance">
          One day is enough to see whether it sounds like you.
        </p>
        <CallToAction
          secondary={{ href: "/login", label: "I already have an account" }}
        />
      </section>
    </div>
  )
}

import Link from "next/link"

import { countEntries, recentChangelog } from "@/lib/changelog"
import { constructMetadata } from "@/lib/metadata"
import { JoinForm } from "@/components/waitlist/join-form"

// The landing page is the one that wants the positioning line unsuffixed, so it
// takes the helper's defaults wholesale and only declares its canonical.
export const metadata = constructMetadata({ canonicalUrl: "/" })

/**
 * The waitlist. See plans/023.
 *
 * Chosen from three directions built at `/prototypes/waitlist`, since deleted. The
 * one that lost most instructively was the page this replaces: four claims
 * about what Quincy does, none of which a stranger can check. This one answers
 * a different question — is the thing alive, and is whoever makes it any good —
 * with dated work that a copywriter cannot produce.
 *
 * **The dependency is real and worth naming.** The log is the pitch here, so a
 * quiet week makes the page look dead. It also only works because this repo
 * writes commit subjects as claims ("Brass was on every button, so nothing
 * could mean live") rather than as changelog nouns. If either stops being true,
 * this page stops working and the honest move is to change it, not to pad the
 * log.
 *
 * **No queue position and no signup count.** `docs/vision.md` argues a follower
 * number is a vanity number with a story attached, and "1,247 people ahead of
 * you" is the same number wearing a different hat. The only count here is of
 * work done, which is the one the product's own argument permits.
 *
 * Static. `lib/changelog.ts` reads the filesystem at module scope, which under
 * `cacheComponents` happens at build and never per request. Do not add
 * `revalidate` here without moving that read.
 */

/** Three days is a week's worth of the log without the page becoming the log. */
const DAYS = 3

export default function MarketingPage() {
  const days = recentChangelog(DAYS)
  const total = countEntries(days)

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-20 px-6 pt-16 pb-24">
      <section className="flex flex-col items-start gap-6">
        <h1 className="max-w-[24ch] text-display text-balance">
          It writes like you.{" "}
          <span className="sm:block">It never speaks for you.</span>
        </h1>

        {/* Capped at 55ch. Hero copy running the full 5xl container is the
            single most common reason a landing page is unreadable on a laptop. */}
        <p className="max-w-[55ch] text-body-lg text-pretty text-muted-foreground">
          Quincy drafts in your voice and sends nothing without you. It is not
          finished, and rather than describe it, here is everything that landed
          this week — the fixes included.
        </p>

        <div className="w-full pt-2">
          <JoinForm source="landing-top" />
        </div>
      </section>

      {/* An empty log is a real state — it is what the first deploy of this
          looked like — so the whole section is dropped rather than rendered as
          a heading with nothing under it. */}
      {days.length > 0 ? (
        <section className="flex flex-col gap-8">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-section">What shipped</h2>
            <p className="max-w-[55ch] text-body text-pretty text-muted-foreground">
              {total} {total === 1 ? "change" : "changes"} in the last{" "}
              {days.length === 1 ? "day" : `${days.length} days`}. No roadmap on
              this page — a roadmap is a promise, and this is a receipt.{" "}
              {/* The log stops after three days, and before this it stopped
                  with nowhere to go. */}
              <Link
                href="/changelog"
                className="rounded-sm underline underline-offset-4 ring-ring outline-hidden transition-colors duration-150 hover:text-foreground focus-visible:ring-2"
              >
                All of it
              </Link>
              .
            </p>
          </div>

          {/* Asymmetric columns: a narrow date rail against a wide text column.
              Below md the date becomes a heading over its own group, because a
              7rem rail on a phone leaves the entries about twenty characters. */}
          <ol className="flex flex-col gap-8">
            {days.map((day) => (
              <li
                key={day.date}
                className="grid gap-x-8 gap-y-2 md:grid-cols-[7rem_1fr]"
              >
                <h3 className="text-eyebrow text-muted-foreground uppercase md:pt-1.5">
                  <time dateTime={day.date}>{day.label}</time>
                </h3>
                <ul className="flex flex-col">
                  {day.entries.map((entry) => (
                    <li
                      key={entry.title}
                      className="border-b border-border/60 py-1.5 text-body text-pretty last:border-b-0"
                    >
                      {entry.title}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {/* The page is long enough that the field at the top is off screen by the
          time the log ends, and the header action is the only way back to it.
          A second form is the cost of that length: its own id, its own state,
          and submitting one does not clear the other. */}
      <section className="flex flex-col items-start gap-4 border-t border-border/60 pt-10">
        {/* The break is manual. This is a pair of sentences, and `text-balance`
            put the break inside the second one — which reads as one sentence
            that ran out of room rather than as two claims.

            Deliberately count-free. An earlier draft opened "That is three
            days", which is a number that has to agree with `DAYS`, with how
            many files exist, and with how many of those have entries. Three
            places to drift and a page that lies quietly when one of them
            moves. */}
        <h2 className="max-w-[40ch] text-section">
          {days.length > 0 ? (
            <>
              That is the log so far.{" "}
              <span className="sm:block">The invites go out the same way.</span>
            </>
          ) : (
            "Quincy opens in small groups."
          )}
        </h2>
        <JoinForm
          id="join-end"
          source="landing-end"
          label="Small groups, in the order people asked."
        />
      </section>
    </div>
  )
}

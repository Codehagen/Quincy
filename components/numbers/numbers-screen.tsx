import * as React from "react"

import { OUTLIER_GATE, endsOf, formatMultiple, type NumbersView } from "@/lib/numbers"
import { Friend } from "@/components/mascot"
import {
  Card,
  EmptyState,
  KitPage,
  LiveDot,
  MarginNote,
  Muted,
  Rule,
  Stage,
  Text,
  TextLink,
} from "@/components/kit"
import { AngleLedger } from "@/components/numbers/angle-ledger"
import { Distribution } from "@/components/numbers/distribution"

/**
 * /numbers on the kit (plans/029), as one presentational screen so the page
 * reads the database and app/prototypes/setup-pages can lay out a filled
 * corpus this account does not have. Server-safe: no hooks.
 *
 * The landing's median picture is the reference: one white object, the
 * median as a figure with a margin note saying it is you, not the crowd.
 * Four Stages, in the order you need them: the baseline, what is happening
 * now, the shape of everything, then the cause (the ledger). Every number is
 * a multiple of your own median (docs/vision.md); there is no follower count
 * and no stat tile. The three counts that were a row of tiles are a list in
 * the shape's Card.
 */

function Stat({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-kit-group">
      <Text as="dt" tone="muted">
        {term}
      </Text>
      <Text as="dd">
        <span className="tabular-nums">{children}</span>
      </Text>
    </div>
  )
}

export function NumbersScreen({ numbers }: { numbers: NumbersView }) {
  if (numbers.scored === 0) {
    return (
      <KitPage
        title="Numbers"
        summary="Every post you publish, against your own median. Never a follower count."
      >
        {/* No lead: the empty state opens with its own bold sentence. Two
            empty states, told apart honestly. Rows that exist but carry no
            impression count are not the same problem as no rows at all, and
            sending someone to connect an account they already connected is
            the worse of the two mistakes. */}
        <Stage>
          <EmptyState
            media={<Friend size={40} state="idle" className="text-kit-ink" />}
            bold="Nothing to measure yet."
            rest={
              numbers.skipped > 0
                ? `${numbers.skipped} imported ${numbers.skipped === 1 ? "post carries" : "posts carry"} no reach figures, so there's nothing to measure against. X only reports them for recent posts, and an archive import carries none.`
                : "Connect X and let an import run. I read your angles off your own history, so there's nothing to score until there's history."
            }
          />
        </Stage>

        <Text tone="muted">
          Reading a channel back is one press on{" "}
          <TextLink href="/sources">Sources</TextLink>.
        </Text>
      </KitPage>
    )
  }

  const { best, worst } = endsOf(numbers.rows)
  const live = numbers.live

  return (
    <KitPage
      title="Numbers"
      summary={`${numbers.scored} posts, ${numbers.from} to ${numbers.to}. Each one against you, not a follower count.`}
    >
      {/* The unit every figure below is quoted in, stated once before any of
          them are read. Without it "6.2×" is a number times nothing. */}
      <Stage lead="Your median post is the line." rest="Every number on this page is a multiple of it.">
        <Card width="with-margin">
          <div className="flex flex-col gap-kit-tight">
            <div className="w-fit">
              <MarginNote note="you, not the crowd">
                <Text variant="figure">{numbers.median.toLocaleString("en-US")}</Text>
              </MarginNote>
            </div>
            <Text tone="muted">
              views on your median post, all time. Your mean is{" "}
              {numbers.mean.toLocaleString("en-US")}
              {numbers.median > 0
                ? `, ${(numbers.mean / numbers.median).toFixed(1)}× higher`
                : ""}
              {numbers.outliers > 0
                ? `. The gap is ${numbers.outliers} posts carrying the other ${numbers.scored - numbers.outliers}.`
                : "."}
            </Text>
            {/* Rows that could not be scored are declared rather than dropped.
                Claiming a corpus larger than the one measured is the kind of
                wrong a reader has no way to catch. */}
            {numbers.skipped > 0 ? (
              <Text variant="small" tone="muted">
                {numbers.skipped} more{" "}
                {numbers.skipped === 1 ? "post carries" : "posts carry"} no reach
                figures and {numbers.skipped === 1 ? "is" : "are"} left out of
                every number here.
              </Text>
            ) : null}
          </div>
        </Card>
      </Stage>

      {/* The same account over the last thirty days, as measured. Its own
          Stage rather than a correction to the median: that one answers "what
          does a post of mine normally do", this one "what am I doing now". */}
      <Stage lead={`The last ${live.days} days.`} rest="Read fresh every morning, beside the median, never instead of it.">
        <Card width="with-margin">
          <div className="flex flex-col gap-kit-related">
            {/* The dot only agrees with the word; the word carries it. */}
            {live.empty ? (
              <Text weight="strong">Frozen at import</Text>
            ) : (
              <LiveDot>
                <Text as="span" weight="strong">
                  Live
                </Text>
              </LiveDot>
            )}

            {live.empty ? (
              <Text tone="muted">
                {live.connected ? (
                  <>
                    No reading yet. Numbers refresh every morning, so the first
                    one lands after the next refresh. Until then every figure
                    here is the one X reported when the post was imported.
                  </>
                ) : (
                  <>
                    No reading yet. Numbers refresh every morning once X is{" "}
                    <TextLink href="/channels">connected</TextLink>. Until then
                    every figure here is the one X reported when the post was
                    imported.
                  </>
                )}
              </Text>
            ) : (
              <>
                <dl className="flex flex-col gap-kit-tight">
                  <Stat term="Median views">{live.median.toLocaleString("en-US")}</Stat>
                  <Stat term="Posts measured">{live.count.toLocaleString("en-US")}</Stat>
                  <Stat term="Newest reading">{live.since}</Stat>
                </dl>
                {/* Which numbers are which, counted rather than implied. */}
                <Text variant="small" tone="muted">
                  {live.matched >= numbers.scored ? (
                    <>Every post on this page reads live.</>
                  ) : live.matched > 0 ? (
                    <>
                      {live.matched} of {numbers.scored} posts here read live;
                      the {numbers.scored - live.matched}{" "}
                      {numbers.scored - live.matched === 1 ? "other is" : "others are"}{" "}
                      frozen at import.
                    </>
                  ) : (
                    <>
                      Measured after these posts were imported, so none of them
                      carry a live number yet.
                    </>
                  )}
                </Text>
              </>
            )}
          </div>
        </Card>
      </Stage>

      {/* The shape, before any explanation of it. */}
      <Stage
        lead="A few posts carry the rest."
        rest="Every post, oldest first, above or under your median line."
      >
        <Card>
          <div className="flex flex-col gap-kit-related">
            <Distribution
              posts={numbers.byDate}
              median={numbers.median}
              fromAxis={numbers.fromAxis}
              toAxis={numbers.toAxis}
            />
            <Rule />
            <dl className="flex flex-col gap-kit-tight">
              <Stat term={`Cleared ${OUTLIER_GATE}× your median`}>
                {numbers.outliers} <Muted>of {numbers.scored}</Muted>
              </Stat>
              <Stat term="Fell under the line">
                {numbers.below} <Muted>of {numbers.scored}</Muted>
              </Stat>
              <Stat term="Best post">{formatMultiple(numbers.best)}</Stat>
            </dl>
          </div>
        </Card>
      </Stage>

      {/* The bridge from the shape to the cause. */}
      <Stage
        lead="Which idea wins, not which post."
        rest={`${
          numbers.linkRepliesBelow > 0
            ? `The floor isn't failure: ${numbers.linkRepliesBelow} of the posts under the line are link replies hung under a thread, never competing for reach. `
            : ""
        }Grouped by the shape of the opening line, each scored by its own median.`}
      >
        <Card>
          <div className="flex flex-col gap-kit-related">
            {/* The caveat, on the page rather than in a comment. It goes by
                itself the day an idea publishes something. */}
            {numbers.inferred ? (
              <Text tone="muted">
                Inferred, not recorded. I haven&rsquo;t published anything for
                you yet, so these are read off your imported history. Once an
                idea becomes a post, its group is the idea that drafted it.
              </Text>
            ) : null}
            <AngleLedger rows={numbers.rows} />
          </div>
        </Card>
      </Stage>

      {/* Derived, not written: it needs two named angles to compare, so with
          fewer there is no sentence (an empty paragraph reads as a bug). */}
      {best && worst ? (
        <Text tone="muted">
          <span className="text-kit-ink">{best.label}</span> works, at{" "}
          {formatMultiple(best.medianMultiple)} your median across{" "}
          {best.posts.length} posts.{" "}
          <span className="text-kit-ink">{worst.label}</span> doesn&rsquo;t, at{" "}
          {formatMultiple(worst.medianMultiple)}. Start your next{" "}
          <TextLink href="/ideas">idea</TextLink> from the top row.
        </Text>
      ) : null}
    </KitPage>
  )
}

import Link from "next/link"
import { redirect } from "next/navigation"

import {
  ChartHistogramIcon,
  InformationCircleIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { constructMetadata } from "@/lib/metadata"
import { OUTLIER_GATE, endsOf, formatMultiple, getNumbers } from "@/lib/numbers"
import { getSession } from "@/lib/session"
import { resolveTimeZone } from "@/lib/timezone"
import {
  PageHeader,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from "@/components/page-header"
import { AngleLedger } from "@/components/numbers/angle-ledger"
import { Distribution } from "@/components/numbers/distribution"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

/**
 * What actually landed — the shape first, then the cause.
 *
 * This surface was a `SurfacePlaceholder` for months, promising to "read
 * backwards into Riffs, so the next round starts from what performed instead of
 * from nothing". Three readings were built at /prototypes/numbers against this
 * account's real corpus, and two of them are here, in the order you need them:
 *
 * 1. **Baseline** — the distribution. Every post as a deviation from your own
 *    median, on one log2 scale, with the chart/table toggle above it. This is
 *    the *shape* of what you have published: a long quiet floor with a few
 *    spikes standing out of it.
 * 2. **Ledger** — the cause. Rows are angles, posts are the evidence filed
 *    under them. This is the part that keeps the placeholder's promise: the
 *    distribution tells you that a few posts carry the rest, and the ledger
 *    tells you what those posts had in common.
 *
 * They are not two pages stapled together. Baseline's own closing note asked
 * exactly the question Ledger answers — "six of the posts below the line are
 * link replies that were never competing for reach; filtering those out is the
 * next question this page has to answer" — and that sentence is now derived
 * from the corpus rather than asserted.
 *
 * Two things the page refuses to do:
 *
 * - **Compare you to anybody else.** Every number is a multiple of your own
 *   median. A follower count is not something you control.
 * - **Claim a join it does not have.** The angles are inferred from the shape of
 *   each opening line, because `scheduled_post` has published nothing yet and
 *   there is no `riff_angle` → post edge to read. The page says so, above the
 *   rows, rather than in a comment nobody reads. When a riff does produce a
 *   post, `getNumbers` swaps the inference for the join and this layout does not
 *   change.
 */
export const metadata = constructMetadata({
  title: "Numbers",
  noIndex: true,
})

export default async function NumbersPage() {
  const session = await getSession()
  if (!session) {
    redirect("/login?next=/numbers")
  }

  // Dates are formatted on the server in the reader's zone. See lib/timezone.
  const zone = resolveTimeZone(session.user.timezone)
  const numbers = await getNumbers(session.user.id, zone)
  const { best, worst } = endsOf(numbers.rows)

  if (numbers.scored === 0) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 pt-6 pb-16">
        <PageHeader>
          <PageHeaderContent>
            <PageHeaderTitle>What actually landed.</PageHeaderTitle>
            <PageHeaderDescription>
              Every post you have published, measured against your own median —
              never against a follower count.
            </PageHeaderDescription>
          </PageHeaderContent>
        </PageHeader>

        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon
                aria-hidden="true"
                icon={ChartHistogramIcon}
                strokeWidth={1.8}
              />
            </EmptyMedia>
            <EmptyTitle>Nothing to score yet.</EmptyTitle>
            {/* Two different empty states, told apart honestly. Rows that exist
                but carry no impression count are not the same problem as no
                rows at all, and sending someone to connect an account they
                already connected is the worse of the two mistakes. */}
            <EmptyDescription>
              {numbers.skipped > 0 ? (
                <>
                  {numbers.skipped} imported{" "}
                  {numbers.skipped === 1 ? "post carries" : "posts carry"} no
                  reach figures, so there is nothing to measure against. X only
                  reports them for recent posts, and an archive import carries
                  none at all.
                </>
              ) : (
                <>
                  Connect X and let an import run — angles are read off your own
                  history, so there is nothing to score until there is history.
                </>
              )}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>

        <p className="px-3 text-caption text-pretty text-muted-foreground">
          Reading a channel back is one press on{" "}
          <Link
            href="/sources"
            className="text-foreground underline decoration-muted-foreground/40 underline-offset-4 hover:decoration-current"
          >
            Sources
          </Link>
          .
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 pt-6 pb-16">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>What actually landed.</PageHeaderTitle>
          <PageHeaderDescription>
            {numbers.scored} posts, {numbers.from} to {numbers.to}. Every one
            measured against you, not against a follower count.
          </PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>

      {/* The unit every figure below is quoted in, stated once before any of
          them are read. Without it "6.2×" is a number times nothing.
          Proportional figures rather than tabular — equal-width digits make a
          display number look loose, and this one is not in a column. */}
      <section className="px-3">
        <p className="text-eyebrow text-muted-foreground uppercase">
          Your median post
        </p>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <p className="text-display">
            {numbers.median.toLocaleString("en-US")}
          </p>
          <p className="max-w-[52ch] text-sm text-pretty text-muted-foreground">
            views. Your mean is {numbers.mean.toLocaleString("en-US")}
            {numbers.median > 0 ? (
              <>
                , which is {(numbers.mean / numbers.median).toFixed(1)}× higher
              </>
            ) : null}
            {numbers.outliers > 0 ? (
              <>
                {" — "}the gap is {numbers.outliers} posts carrying the other{" "}
                {numbers.scored - numbers.outliers}.
              </>
            ) : (
              "."
            )}
          </p>
        </div>
        {/* Rows that could not be scored are declared rather than dropped.
            Claiming a corpus size larger than the one actually measured is the
            kind of wrong a reader has no way to catch. */}
        {numbers.skipped > 0 ? (
          <p className="mt-2 max-w-[62ch] text-caption text-pretty text-muted-foreground">
            {numbers.skipped} more{" "}
            {numbers.skipped === 1 ? "post carries" : "posts carry"} no reach
            figures and {numbers.skipped === 1 ? "is" : "are"} left out of every
            number on this page.
          </p>
        ) : null}
      </section>

      {/* The shape, before any explanation of it. */}
      <Distribution
        posts={numbers.byDate}
        median={numbers.median}
        fromAxis={numbers.fromAxis}
        toAxis={numbers.toAxis}
      />

      <dl className="mx-3 grid gap-6 border-t border-border pt-6 sm:grid-cols-3">
        <div>
          <dt className="text-sm text-muted-foreground">
            Cleared {OUTLIER_GATE}×
          </dt>
          <dd className="tabular mt-1 text-2xl">
            {numbers.outliers}
            <span className="text-base text-muted-foreground">
              {" "}
              of {numbers.scored}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Fell under the line</dt>
          <dd className="tabular mt-1 text-2xl">
            {numbers.below}
            <span className="text-base text-muted-foreground">
              {" "}
              of {numbers.scored}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Best post</dt>
          <dd className="tabular mt-1 text-2xl text-gain-ink">
            {formatMultiple(numbers.best)}
          </dd>
        </div>
      </dl>

      {/* The bridge from the shape to the cause, and the sentence the Baseline
          exploration ended on — now counted rather than asserted. It renders
          only when there is something to count, because "0 of them are link
          replies" is a fact about nothing. */}
      <section className="px-3">
        <h2 className="text-section">Which angle wins.</h2>
        <p className="mt-1 max-w-[62ch] text-sm text-pretty text-muted-foreground">
          Not which post.
          {numbers.linkRepliesBelow > 0 ? (
            <>
              {" "}
              The floor is not failure — {numbers.linkRepliesBelow} of the posts
              below the line are link replies hung under a thread, and they were
              never competing for reach.
            </>
          ) : null}{" "}
          Grouped by the shape of the opening line, each group scored by its own
          median.
        </p>
      </section>

      {/* The caveat, on the page rather than in a comment. It disappears by
          itself the day a riff publishes something. */}
      {numbers.inferred ? (
        <div className="mx-3 flex items-start gap-2.5 rounded-lg bg-muted/60 px-3 py-2.5 text-sm ring-1 ring-foreground/5">
          <HugeiconsIcon
            aria-hidden="true"
            icon={InformationCircleIcon}
            strokeWidth={1.8}
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          />
          <p className="max-w-[70ch] text-pretty text-muted-foreground">
            Inferred, not recorded. Quincy has not published anything yet, so
            these angles are read off your imported history. Once a riff
            produces a post, the group becomes the actual angle that drafted it.
          </p>
        </div>
      ) : null}

      <section className="px-3">
        <AngleLedger rows={numbers.rows} />
      </section>

      {/* Derived, not written. A hardcoded sentence here would go stale the
          first time the grouping changed and would then tell the reader the
          opposite of what the rows above show. It needs two named angles to
          make a comparison, so with fewer than two there is no sentence and the
          section does not render — an empty paragraph reads as a bug. */}
      {best && worst ? (
        <section className="px-3">
          <p className="max-w-[62ch] text-sm text-pretty text-muted-foreground">
            <span className="text-foreground">{best.label}</span> is the angle
            that works, at {formatMultiple(best.medianMultiple)} your median
            across {best.posts.length} posts.{" "}
            <span className="text-foreground">{worst.label}</span> is the one
            that does not, at {formatMultiple(worst.medianMultiple)}. Start the
            next{" "}
            <Link
              href="/riffs"
              className="text-foreground underline decoration-muted-foreground/40 underline-offset-4 hover:decoration-current"
            >
              riff
            </Link>{" "}
            from the top row.
          </p>
        </section>
      ) : null}
    </div>
  )
}

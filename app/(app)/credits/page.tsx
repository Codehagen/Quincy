import { redirect } from "next/navigation"

import { getSession } from "@/lib/session"
import { formatMicros } from "@/lib/pricing"
import { recentUsage, summariseUsage } from "@/lib/usage"
import { usageAmount } from "@/lib/usage-amount"
import { calendarDayIn, resolveTimeZone, startOfDayIn } from "@/lib/timezone"
import {
  ButtonLink,
  Card,
  EmptyState,
  KitPage,
  Mono,
  Stage,
  Text,
} from "@/components/kit"
import { Friend } from "@/components/mascot"
import { constructMetadata } from "@/lib/metadata"

export const metadata = constructMetadata({
  title: "Credits",
  noIndex: true,
})

/**
 * What Quincy spent, from `usage_event` (AGENTS.md, "Money": every model call,
 * X read and publish is metered there, and non-model spend uses the `model`
 * column as a label).
 *
 * On the kit since 2026-11-16: the month as four figures in one Card (never
 * dark stat tiles), the recent charges as plain rows with every number in
 * tabular mono so the columns line up, and an EmptyState with the friend when
 * nothing has been spent this month.
 */
export default async function CreditsPage() {
  const session = await getSession()

  // The layout already gates on a session; this is the narrowing, not the
  // gate — the same pattern as /settings/billing.
  if (!session) {
    redirect("/login?next=/credits")
  }

  // "This month" starts at midnight on the 1st where the reader is, not where
  // the server is. Two hours of turns on the 1st would otherwise be counted
  // against the previous month for anyone east of UTC.
  const zone = resolveTimeZone(session.user.timezone)
  const today = calendarDayIn(new Date(), zone)
  const startOfMonth = startOfDayIn({ ...today, day: 1 }, zone)

  // Issued together, not one after the other — the same reasoning lib/session.ts
  // gives for the layout and page session lookups: two round trips started at
  // once cost the same wall-clock time as one.
  const [summary, turns] = await Promise.all([
    summariseUsage(session.user.id, startOfMonth),
    recentUsage(session.user.id),
  ])

  const figures = [
    { label: "Turns", value: summary.turns.toLocaleString("en-GB") },
    { label: "Estimated cost", value: formatMicros(summary.costMicros) },
    { label: "Input tokens", value: summary.inputTokens.toLocaleString("en-GB") },
    { label: "Output tokens", value: summary.outputTokens.toLocaleString("en-GB") },
  ]

  return (
    <KitPage title="Credits" summary="What Quincy spent, and what it went on.">
      {summary.turns === 0 ? (
        <Stage aria-label="Credits">
          <EmptyState
            media={<Friend size={40} state="idle" className="text-kit-ink" />}
            bold="Nothing spent this month."
            rest={
              turns.length === 0
                ? "Usage shows up here after your first conversation with Quincy."
                : "What it spent before this month is below."
            }
          >
            <ButtonLink href="/studio">Open Studio</ButtonLink>
          </EmptyState>
        </Stage>
      ) : (
        <Stage
            lead="This month."
            rest="An estimate, not an invoice. Quincy reaches the model through the Vercel AI Gateway, and the gateway's own dashboard is the number that gets billed."
          >
            <Card>
              <dl className="grid grid-cols-2 gap-kit-group sm:grid-cols-4">
                {figures.map((figure) => (
                  <div key={figure.label} className="flex flex-col gap-kit-tight">
                    <Text as="dt" variant="small" tone="muted">
                      {figure.label}
                    </Text>
                    <Text as="dd" variant="figure">
                      {figure.value}
                    </Text>
                  </div>
                ))}
              </dl>
            </Card>
          </Stage>
      )}

      {/* Whenever there are rows, not only when this month has some: the
          recent list is not scoped to the month, and on the 1st it is the
          only record of what was spent. */}
      {turns.length > 0 ? (
          <Stage
            lead="Recent spend."
            rest={`The last ${turns.length === 1 ? "charge" : `${turns.length} charges`}, newest first. The kind is what bought it: a model id, or a label for the reads and writes that cost quota rather than tokens.`}
          >
            <Card>
              <ul className="flex flex-col gap-kit-related">
                {turns.map((turn) => {
                  // Tokens for a model turn, seconds of audio for Deepgram,
                  // nothing for a label that bought neither.
                  const amount = usageAmount(turn)
                  return (
                    <li key={turn.id} className="flex items-start gap-kit-related">
                      {/* The date and what it was spent on, stacked rather than
                          a fourth column: `usage_event.model` holds either a
                          provider slug or a label, and the longest of those is
                          wider than the two number columns put together. */}
                      <span className="flex min-w-0 flex-1 flex-col">
                        <Mono tone="ink">
                          {turn.createdAt.toLocaleString("en-GB", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: zone,
                          })}
                        </Mono>
                        {/* Verbatim, never mapped to a friendlier noun. This is
                            the value a query would be written against, and a
                            prettier word here would be a second vocabulary for
                            the same column. */}
                        <span className="truncate text-kit-small text-kit-ink-muted">
                          {turn.model}
                          {/* On a phone the amount column has no room, so the
                              counts ride on this line instead of vanishing. */}
                          {amount ? (
                            <span className="tabular-nums sm:hidden">
                              {" · "}
                              {amount}
                            </span>
                          ) : null}
                        </span>
                      </span>
                      <span className="hidden shrink-0 text-right sm:block">
                        {amount ? <Mono>{amount}</Mono> : null}
                      </span>
                      <span className="w-20 shrink-0 text-right">
                        <Mono tone="ink">{formatMicros(turn.costMicros)}</Mono>
                      </span>
                    </li>
                  )
                })}
              </ul>
            </Card>
          </Stage>
      ) : null}
    </KitPage>
  )
}

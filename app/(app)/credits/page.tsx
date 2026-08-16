import { redirect } from "next/navigation"

import { Coins01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { getSession } from "@/lib/session"
import { formatMicros } from "@/lib/pricing"
import { recentUsage, summariseUsage } from "@/lib/usage"
import { calendarDayIn, resolveTimeZone, startOfDayIn } from "@/lib/timezone"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  PageHeader,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from "@/components/page-header"
import { constructMetadata } from "@/lib/metadata"

export const metadata = constructMetadata({
  title: "Credits",
  noIndex: true,
})

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

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 pt-6 pb-12">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Credits.</PageHeaderTitle>
          <PageHeaderDescription>
            What you have, what it went on.
          </PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>

      {summary.turns === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon
                aria-hidden="true"
                icon={Coins01Icon}
                strokeWidth={1.8}
              />
            </EmptyMedia>
            <EmptyTitle>Nothing recorded yet</EmptyTitle>
            <EmptyDescription>
              Usage appears here after your first conversation.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-section">This month</CardTitle>
              <CardDescription className="text-pretty">
                An estimate, not an invoice — this reaches the model through the
                Vercel AI Gateway, and the gateway&apos;s own dashboard is the
                number that actually gets billed.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-6 sm:grid-cols-4">
                <div className="flex flex-col gap-1">
                  <dt className="text-caption text-muted-foreground">Turns</dt>
                  <dd className="text-section tabular-nums">
                    {summary.turns.toLocaleString("en-GB")}
                  </dd>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="text-caption text-muted-foreground">
                    Estimated cost
                  </dt>
                  <dd className="text-section tabular-nums">
                    {formatMicros(summary.costMicros)}
                  </dd>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="text-caption text-muted-foreground">
                    Input tokens
                  </dt>
                  <dd className="text-section tabular-nums">
                    {summary.inputTokens.toLocaleString("en-GB")}
                  </dd>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="text-caption text-muted-foreground">
                    Output tokens
                  </dt>
                  <dd className="text-section tabular-nums">
                    {summary.outputTokens.toLocaleString("en-GB")}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-section">Recent turns</CardTitle>
              <CardDescription>
                The last {turns.length} model calls, newest first.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-3">
                {turns.map((turn) => (
                  <li
                    key={turn.id}
                    className="flex items-center justify-between gap-4 border-b pb-3 text-body last:border-b-0 last:pb-0"
                  >
                    <span className="text-muted-foreground">
                      {turn.createdAt.toLocaleString("en-GB", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {turn.inputTokens.toLocaleString("en-GB")} in ·{" "}
                      {turn.outputTokens.toLocaleString("en-GB")} out
                    </span>
                    <span className="tabular-nums">
                      {formatMicros(turn.costMicros)}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

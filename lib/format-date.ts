import { calendarDayIn, type CalendarDate } from "./timezone"

/**
 * Buckets a conversation by when it was last touched.
 *
 * Exact timestamps are noise in a history list — nobody looks for the thread
 * from 14:32. They look for "the one from yesterday". Anything older than a
 * week gets a real date, because "23 days ago" is arithmetic the reader has to
 * do themselves.
 *
 * `zone` is required and has no default, deliberately. This used to compute its
 * day boundaries with `getFullYear`/`getMonth`/`getDate`, which read the
 * server's zone — UTC on Vercel — so at 01:00 in Oslo a conversation from an
 * hour ago was labelled "Yesterday". A default parameter would have let every
 * call site keep that behaviour without anyone noticing; making it an argument
 * means each caller has to say whose day it is talking about.
 */
export function formatConversationDate(
  value: Date,
  zone: string,
  now = new Date()
): string {
  const then = calendarDayIn(value, zone)
  const today = calendarDayIn(now, zone)

  const days = Math.round(
    (midnightUtcOf(today) - midnightUtcOf(then)) / 86_400_000
  )

  if (days <= 0) {
    return "Today"
  }

  if (days === 1) {
    return "Yesterday"
  }

  if (days < 7) {
    return `${days} days ago`
  }

  return `${then.day} ${MONTH[then.month - 1]}${
    then.year === today.year ? "" : ` ${then.year}`
  }`
}

/**
 * Both dates pinned to UTC midnight purely to subtract them.
 *
 * The zone is already spent — these are calendar dates, not instants — and
 * anchoring both to the same arbitrary zone is what makes the difference a
 * count of calendar days rather than of elapsed hours. Doing this in a real zone
 * would make a DST day 23 or 25 hours long and round the wrong way twice a year.
 */
function midnightUtcOf(date: CalendarDate): number {
  return Date.UTC(date.year, date.month - 1, date.day)
}

/**
 * Fixed English, matching lib/lineup.ts. `toLocaleDateString("en-GB")` was
 * doing this before and would drift from the hardcoded "Today" beside it the
 * moment anything set a different locale.
 */
const MONTH = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

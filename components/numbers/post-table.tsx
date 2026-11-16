import { formatMultiple, type ScoredPost } from "@/lib/numbers"

/**
 * The table twin the chart owes.
 *
 * Above it, bar length and the side of the line carry the story. Here the
 * same numbers are readable without either — which is what makes the chart's
 * encoding an enhancement rather than the only way to reach the data.
 *
 * Kit tokens only (2026-11-16): hairline rows, muted small headers, figures
 * in tabular ink. A multiple under your median is muted, not red: falling
 * under your own line is a reading, not a failure.
 */
const TH = "py-2 pr-4 text-kit-small font-kit-strong text-kit-ink-muted"

export function PostTable({
  posts,
  median,
}: {
  posts: ScoredPost[]
  median: number
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-kit-body text-kit-ink">
        <caption className="sr-only">
          Every post, its reach, and its multiple of your median of{" "}
          {median.toLocaleString("en-US")} views, in the same order as the chart
          it replaces — oldest first.
        </caption>
        <thead>
          <tr className="border-b border-kit-hairline text-left">
            <th scope="col" className={TH}>
              Date
            </th>
            <th scope="col" className={TH}>
              Opening line
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Views
            </th>
            <th scope="col" className={`${TH} pr-0 text-right`}>
              vs median
            </th>
          </tr>
        </thead>
        <tbody>
          {posts.map((post) => (
            <tr key={post.id} className="border-b border-kit-hairline last:border-0">
              <td className="py-2 pr-4 align-top font-kit-mono text-kit-mono whitespace-nowrap text-kit-ink-muted tabular-nums">
                {post.date}
              </td>
              <td className="max-w-[38ch] py-2 pr-4 align-top">
                <span className="line-clamp-1">{post.hook}</span>
              </td>
              <td className="py-2 pr-4 text-right align-top tabular-nums">
                {post.impressions.toLocaleString("en-US")}
              </td>
              <td
                className={`py-2 text-right align-top font-kit-strong tabular-nums ${
                  post.multiple >= 1 ? "text-kit-ink" : "text-kit-ink-muted"
                }`}
              >
                {formatMultiple(post.multiple)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

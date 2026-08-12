import { formatMultiple, type ScoredPost } from "@/lib/numbers"
import { cn } from "@/lib/utils"

/**
 * The table twin the ledger owes.
 *
 * Above it, colour and bar length carry the story. Here the same numbers are
 * readable without either — which is what makes the ledger's encoding an
 * enhancement rather than the only way to reach the data.
 */
export function PostTable({
  posts,
  median,
}: {
  posts: ScoredPost[]
  median: number
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">
          Every post, its reach, and its multiple of your median of{" "}
          {median.toLocaleString("en-US")} views, in the same order as the chart
          it replaces — oldest first.
        </caption>
        <thead>
          <tr className="border-border border-b text-left">
            <th
              scope="col"
              className="text-muted-foreground py-2 pr-4 font-medium"
            >
              Date
            </th>
            <th
              scope="col"
              className="text-muted-foreground py-2 pr-4 font-medium"
            >
              Opening line
            </th>
            <th
              scope="col"
              className="text-muted-foreground py-2 pr-4 text-right font-medium"
            >
              Views
            </th>
            <th
              scope="col"
              className="text-muted-foreground py-2 text-right font-medium"
            >
              vs median
            </th>
          </tr>
        </thead>
        <tbody>
          {posts.map((post) => (
            <tr
              key={post.id}
              className="border-border/60 border-b last:border-0"
            >
              <td className="tabular text-muted-foreground py-2 pr-4 align-top whitespace-nowrap">
                {post.date}
              </td>
              <td className="max-w-[38ch] py-2 pr-4 align-top">
                <span className="line-clamp-1">{post.hook}</span>
              </td>
              <td className="tabular py-2 pr-4 text-right align-top">
                {post.impressions.toLocaleString("en-US")}
              </td>
              <td
                className={cn(
                  "tabular py-2 text-right align-top font-medium",
                  post.multiple >= 1 ? "text-gain-ink" : "text-shortfall-ink"
                )}
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

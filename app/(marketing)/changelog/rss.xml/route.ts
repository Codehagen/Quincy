import { readChangelog, type ChangelogDay } from "@/lib/changelog"
import { BASE_URL } from "@/lib/metadata"

/**
 * The changelog feed. See plans/023.
 *
 * **Static, without saying so.** `readChangelog` reads the filesystem at module
 * scope and `GET` takes no request, so under `cacheComponents` this prerenders
 * at build and is served from the CDN — a feed reader polling every fifteen
 * minutes must not wake a function to hand back a file that only changes on
 * deploy.
 *
 * `export const dynamic = "force-static"` was here and the build rejected it:
 * Next 16 refuses route segment config alongside `cacheComponents`, because the
 * two describe the same thing in disagreeing vocabularies. Staticness is now
 * inferred from what the handler actually touches, which is the point of the
 * flag. Adding a `request` parameter to `GET` is what would quietly turn this
 * dynamic.
 *
 * **`/changelog/rss.xml` has to be in `PUBLIC` in proxy.ts**, and it is. It is
 * fetched by machines that will never hold a cookie — the same trap
 * `/robots.txt` and `/sitemap.xml` are already in that set to avoid. Left out,
 * it answers 307 to `/login`, which a reader follows into an HTML page that is
 * not a feed, and the failure looks like a healthy response the whole way.
 */

/**
 * One item per day, not per entry.
 *
 * The files are per-day, the landing page groups per-day, and a feed that fires
 * seven times for one afternoon's work teaches people to mute it. The day is
 * the unit of "we shipped something".
 */
function itemFor(day: ChangelogDay) {
  const link = `${BASE_URL}/changelog#${day.date}`

  // Titles as headings, bodies as paragraphs. Deliberately not a markdown
  // render: a feed reader gets a fragment of HTML, and running the entries
  // through a converter here would mean a second rendering path that can
  // disagree with the page. The bodies are plain prose — the one thing they
  // need is their paragraph breaks kept.
  const body = day.entries
    .map((entry) => {
      const paragraphs = entry.body
        .split(/\n{2,}/)
        .map((block) => block.trim())
        .filter(Boolean)
        .map((block) => `<p>${escapeXml(block)}</p>`)
        .join("")

      return `<h3>${escapeXml(entry.title)}</h3>${paragraphs}`
    })
    .join("")

  return [
    "<item>",
    `<title>${escapeXml(`${day.label} — ${day.entries.length} ${day.entries.length === 1 ? "change" : "changes"}`)}</title>`,
    `<link>${escapeXml(link)}</link>`,
    // Not a permalink in the RSS sense — it is a fragment on one page rather
    // than a page of its own — so `isPermaLink` says so. A reader that treated
    // it as a document URL would fetch the whole changelog for every item.
    `<guid isPermaLink="false">${escapeXml(link)}</guid>`,
    // Midday UTC rather than midnight. A date-only entry parsed as 00:00 lands
    // on the previous day for every reader west of Greenwich, which is most of
    // them, and a changelog dated a day early is a small lie repeated forever.
    `<pubDate>${new Date(`${day.date}T12:00:00Z`).toUTCString()}</pubDate>`,
    `<description><![CDATA[${cdataSafe(body)}]]></description>`,
    "</item>",
  ].join("")
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

/**
 * A CDATA section ends at the first `]]>`, so one inside the payload would cut
 * the description in half and leave the rest of the feed as loose text. Nothing
 * we write contains it today; a changelog entry quoting XML would.
 */
function cdataSafe(value: string) {
  return value.replace(/]]>/g, "]]&gt;")
}

export function GET() {
  const days = readChangelog()

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "<channel>",
    "<title>Quincy — Changelog</title>",
    `<link>${BASE_URL}/changelog</link>`,
    "<description>Everything that shipped in Quincy, dated, including the fixes.</description>",
    "<language>en</language>",
    // Self-reference, which every validator asks for and most feeds omit.
    `<atom:link href="${BASE_URL}/changelog/rss.xml" rel="self" type="application/rss+xml"/>`,
    // The newest entry's date rather than build time. A `new Date()` here would
    // restamp the feed on every deploy and tell readers the log changed when it
    // did not — the same reason app/sitemap.ts refuses to stamp static pages.
    days[0]
      ? `<lastBuildDate>${new Date(`${days[0].date}T12:00:00Z`).toUTCString()}</lastBuildDate>`
      : "",
    ...days.map(itemFor),
    "</channel>",
    "</rss>",
  ].join("")

  return new Response(xml, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control":
        "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  })
}

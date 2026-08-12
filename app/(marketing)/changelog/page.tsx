import Link from "next/link"

import { readChangelog } from "@/lib/changelog"
import { BASE_URL, constructMetadata } from "@/lib/metadata"
import { Markdown } from "@/components/ui/markdown"

const base = constructMetadata({
  title: "Changelog",
  description:
    "Everything that shipped in Quincy, dated, including the fixes. A roadmap is a promise; this is a receipt.",
  canonicalUrl: "/changelog",
})

/**
 * The `alternates.types` entry is feed autodiscovery — it renders the
 * `<link rel="alternate" type="application/rss+xml">` that lets a reader
 * subscribe from the page URL alone, without being handed the feed address.
 * Merged rather than replaced, because `constructMetadata` has already put the
 * canonical in `alternates` and overwriting it would drop it silently.
 */
export const metadata = {
  ...base,
  alternates: {
    ...base.alternates,
    types: {
      "application/rss+xml": [
        { url: `${BASE_URL}/changelog/rss.xml`, title: "Quincy — Changelog" },
      ],
    },
  },
}

/**
 * The whole log. See plans/023.
 *
 * `/` shows three days and stops, because a landing page that is mostly a
 * changelog has stopped being a landing page. This is where the rest lives, and
 * it is the only surface that renders the prose bodies — `lib/changelog.ts`
 * has always parsed them and until now nothing read them.
 *
 * **Bodies are optional and most entries have none.** That is deliberate, not
 * an unfinished state: the subjects in this repo are written as claims, so a
 * bare heading already says something. An entry earns a paragraph when the
 * reason is more interesting than the change. A page of headings with the
 * occasional argument under one reads as a log; padding every entry to look
 * uniform would read as marketing.
 *
 * Static, like the landing page: `readChangelog` touches the filesystem at
 * module scope, which under `cacheComponents` happens at build. Adding
 * `revalidate` here would move that read into a request. Don't.
 */
export default function ChangelogPage() {
  const days = readChangelog()

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-16 px-6 pt-16 pb-24">
      <section className="flex flex-col items-start gap-4">
        {/* A claim, not a label. Every other h1 on this surface says something
            a reader can disagree with, and "Changelog" is the one word the nav
            link, the tab title and the RSS title already carry three times.
            The argument was buried in the paragraph under it; it belongs on
            top, and the paragraph keeps the facts. */}
        <h1 className="max-w-[24ch] text-display text-balance">
          A roadmap is a promise. This is a receipt.
        </h1>
        <p className="max-w-[55ch] text-body-lg text-pretty text-muted-foreground">
          Everything that shipped, dated, the fixes included.
        </p>
        <p className="text-caption text-muted-foreground">
          <a
            href="/changelog/rss.xml"
            className="rounded-sm underline underline-offset-4 ring-ring outline-hidden transition-colors duration-150 hover:text-foreground focus-visible:ring-2"
          >
            RSS
          </a>
        </p>
      </section>

      {days.length === 0 ? (
        // An empty log is a real state — it is what the first deploy looked
        // like — and it gets a sentence rather than a blank page.
        <p className="text-body text-muted-foreground">
          Nothing here yet. The first entry lands with the next deploy.
        </p>
      ) : (
        <ol className="flex flex-col gap-12">
          {days.map((day) => (
            <li
              key={day.date}
              // The anchor each RSS item points at. `scroll-mt` so arriving
              // from a feed does not put the date flush against the top edge.
              id={day.date}
              className="flex scroll-mt-16 flex-col gap-4"
            >
              <h2 className="text-eyebrow text-muted-foreground uppercase">
                <time dateTime={day.date}>{day.label}</time>
              </h2>

              <ul className="flex flex-col gap-6">
                {day.entries.map((entry) => (
                  <li key={entry.title} className="flex flex-col gap-1.5">
                    <h3 className="max-w-[60ch] text-section text-balance">
                      {entry.title}
                    </h3>
                    {/* The body is prose, so it goes through the typeset
                        system rather than the role scale. `Markdown` owns that
                        container and takes layout only — a `text-*` utility in
                        here would put two rhythm systems on one paragraph. */}
                    {entry.body ? (
                      <Markdown className="max-w-[65ch]">{entry.body}</Markdown>
                    ) : null}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}

      <section className="flex flex-col items-start gap-3 border-t border-border/60 pt-10">
        <h2 className="text-section">Want to be in it?</h2>
        <p className="max-w-[55ch] text-body text-pretty text-muted-foreground">
          Quincy is opening in small groups, in the order people asked.
        </p>
        <Link
          href="/#join"
          className="rounded-sm text-body underline underline-offset-4 ring-ring outline-hidden transition-colors duration-150 hover:text-muted-foreground focus-visible:ring-2"
        >
          Join the waitlist
        </Link>
      </section>
    </div>
  )
}

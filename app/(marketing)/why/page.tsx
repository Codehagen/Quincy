import { readFile } from "node:fs/promises"
import path from "node:path"

import { constructMetadata } from "@/lib/metadata"
import { Markdown } from "@/components/ui/markdown"

/**
 * The argument the product is built on.
 *
 * **Public, and in the marketing group rather than the app.** It used to sit
 * behind the session and redirect strangers to /login, which meant the clearest
 * case for buying the product could only be read by people who had already
 * bought it. The headline promises something odd on purpose — "it never speaks
 * for you" — and this is the page that answers *why would I want that*.
 *
 * The route is still `/why`, because a route group is not part of the URL. Both
 * existing links (the user menu, the foot of /rhythm) keep working untouched,
 * and so does the `outputFileTracingIncludes` key in next.config.ts — that key
 * is the route path, not the file path.
 *
 * Still reached from the user menu and the foot of /rhythm inside the app, and
 * now from the marketing footer as well — never from the sidebar. A page you
 * read once does not earn a permanent nav row.
 *
 * `docs/vision.md` stays the single source. next.config.ts traces it into the
 * bundle rather than this route carrying a second copy that drifts. Note what
 * that means editorially: **this file publishes whatever is in that document.**
 * Anything written there is written for strangers now.
 *
 * 65ch and `.typeset-wiki`, matching components/brain/prose-editor.tsx — long
 * prose is the one thing in this app that already had its measure settled. It
 * deliberately reads as a document rather than a landing section; the
 * credibility comes from it looking like something written for ourselves.
 */
export const metadata = constructMetadata({
  title: "Why Quincy works this way",
  description:
    "The argument this product is built on: interest media, why the merit lives in the individual post, and what we deliberately do not build.",
  canonicalUrl: "/why",
})

export default async function WhyPage() {
  // The document changes only when a deploy ships a new copy, and the cache
  // key includes the build id — so "cache forever" means "until the next
  // deploy", which is exactly the file's real lifetime. Without the directive
  // cacheComponents treats the read as per-request data and refuses to
  // prerender the page.
  "use cache"

  const source = await readFile(
    path.join(process.cwd(), "docs", "vision.md"),
    "utf8"
  )

  return (
    <div className="mx-auto w-full max-w-[65ch] px-8 py-10">
      <Markdown>{source}</Markdown>
    </div>
  )
}

import type { MetadataRoute } from "next"

import { readChangelog } from "@/lib/changelog"
import { BASE_URL } from "@/lib/metadata"

/**
 * The public surface, and nothing else.
 *
 * Keep this in step with the `PUBLIC` set in `proxy.ts`. A URL listed here that
 * answers 307 to a signed-out crawler is worse than an omission — it is a
 * claim we cannot honour, and it is how a sitemap stops being trusted.
 *
 * No `lastModified` on static pages. A build-time `new Date()` restamps every
 * URL on every deploy, so a crawler learns that the dates carry no information
 * and ignores them. Changelog entries will carry their real dates when they
 * exist; until then, an absent signal beats a false one.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  // The newest entry's date. This is the one page whose `lastModified` carries
  // real information, which is exactly the case the note above reserves it for
  // — it changes when the log changes, not when the site is rebuilt.
  const newest = readChangelog()[0]?.date

  return [
    {
      url: `${BASE_URL}/`,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${BASE_URL}/changelog`,
      ...(newest ? { lastModified: new Date(`${newest}T12:00:00Z`) } : {}),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/why`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    // Was missing while sitting in `PUBLIC`, which is the drift this file's
    // own note warns about — in the harmless direction, but drift either way.
    {
      url: `${BASE_URL}/pricing`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/privacy`,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ]
}

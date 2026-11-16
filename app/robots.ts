import type { MetadataRoute } from "next"

import { BASE_URL } from "@/lib/metadata"

/**
 * What a crawler may look at.
 *
 * Everything signed-in is already unreachable to a crawler — `proxy.ts`
 * redirects it to `/login` — so this file is not the gate any more than the
 * proxy is. It exists so the refusal is a stated policy rather than a side
 * effect of route gating, and so a crawler stops spending its budget on paths
 * that will only ever answer 307.
 *
 * `/prototypes` is the one that matters. Those are design explorations kept
 * deliberately (`56a5cdb`) and each page already sets `robots: { index: false }`
 * for itself. Both belong: the per-page directive covers a page reached
 * directly, this covers the crawl.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/prototypes/"],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  }
}

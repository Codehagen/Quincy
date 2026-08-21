import type { Metadata } from "next"

/**
 * Absolute base URL for the site. Feeds `metadataBase`, canonical URLs, the
 * sitemap and robots.
 *
 * Deliberately `BETTER_AUTH_URL` rather than a new `NEXT_PUBLIC_*` variable.
 * That value is already per-environment, already correct in every deployment,
 * and already the origin two other modules resolve absolute URLs against
 * (`lib/auth-email.ts:14`, `lib/channels-email.ts:13`) — with this exact
 * fallback. A second variable meaning the same thing is a second thing to get
 * wrong on a preview deployment, and the failure is silent: cards render
 * against the wrong host and nobody notices until a link is shared.
 *
 * `lib/channels.ts:118` throws when it is unset, because an OAuth redirect URI
 * derived from the wrong origin is a security question. This is not that — a
 * canonical URL pointing at production is the right guess when nothing says
 * otherwise, so it falls back instead of throwing.
 */
export const BASE_URL = process.env.BETTER_AUTH_URL ?? "https://hirequincy.com"

const BRAND = "Quincy"

/**
 * The em dash matches what the privacy page already shipped
 * ("Privacy Policy — Quincy"), not the pipe other projects use.
 */
const TITLE_SUFFIX = ` — ${BRAND}`

/**
 * Positioning, not category.
 *
 * This used to read "Quincy. An AI Head of Content", which is a role a
 * competitor already uses in exactly those words — and a role is a metaphor
 * anyone can hire. What they cannot say is the second clause: their product
 * schedules and posts on its own, and this one stops at the draft. A behaviour
 * has to be rebuilt to be copied.
 *
 * The old description was the bigger problem: "drafts in your voice, schedules,
 * and publishes" against their "drafts, schedules, and checks back" was close
 * enough that the two products were indistinguishable in a search result.
 *
 * **If autoposting ever ships, this line is a public retraction.** That is the
 * bet: docs/vision.md treats approval as the spine of the product rather than a
 * default that might drift. Whoever changes that decision changes this file in
 * the same commit.
 */
const DEFAULT_TITLE = "Quincy — writes like you, never speaks for you"

const DEFAULT_DESCRIPTION =
  "Hand over the raw material. Quincy drafts it in your voice, from a brain you can open and correct. Nothing goes out in your name until you approve it."

/**
 * Single source of truth for page metadata. Call it from a `layout.tsx` or
 * `page.tsx` with only the fields that differ from the defaults.
 *
 * @example
 * export const metadata = constructMetadata({
 *   title: "Pricing",
 *   description: "One day free, then $49 a month.",
 *   canonicalUrl: "/pricing",
 * })
 */
export function constructMetadata({
  title,
  fullTitle,
  description = DEFAULT_DESCRIPTION,
  image,
  canonicalUrl,
  type = "website",
  publishedTime,
  noIndex = false,
}: {
  /** Page name; rendered as `${title} — Quincy`. */
  title?: string
  /** Complete title, used verbatim (bypasses the suffix). */
  fullTitle?: string
  description?: string
  /**
   * OG/Twitter image URL; relative paths resolve against `metadataBase`.
   * Omit for the branded default. `null` opts out entirely.
   */
  image?: string | null
  /** Canonical path or URL; relative resolves against `metadataBase`. */
  canonicalUrl?: string
  /** OG type; "article" for changelog entries and long-form pages. */
  type?: "website" | "article"
  /** ISO date for `article:published_time`; ignored unless type is "article". */
  publishedTime?: string
  /** Keep it out of the index — `/prototypes`, and anything not finished. */
  noIndex?: boolean
} = {}): Metadata {
  /**
   * Every page names the image explicitly rather than inheriting it.
   *
   * A file-based `opengraph-image` is inherited only until a segment defines
   * its own `openGraph` object — and this helper always defines one. So a page
   * that called `constructMetadata()` and trusted inheritance would ship a card
   * with no image at all, which is the exact failure this file exists to fix.
   */
  const ogImage =
    image === null
      ? null
      : (image ?? {
          url: "/opengraph-image",
          width: 1200,
          height: 630,
          alt: "Quincy — it writes like you, and never speaks for you",
        })

  return {
    metadataBase: new URL(BASE_URL),
    title: fullTitle || (title ? `${title}${TITLE_SUFFIX}` : DEFAULT_TITLE),
    description,
    openGraph: {
      title: fullTitle || (title ? `${title}${TITLE_SUFFIX}` : DEFAULT_TITLE),
      description,
      siteName: BRAND,
      locale: "en_US",
      // og:url mirrors the canonical; relative values resolve against
      // `metadataBase`.
      ...(canonicalUrl && { url: canonicalUrl }),
      ...(ogImage && { images: ogImage }),
      ...(type === "article"
        ? {
            type: "article" as const,
            ...(publishedTime && { publishedTime }),
          }
        : { type: "website" as const }),
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle || (title ? `${title}${TITLE_SUFFIX}` : DEFAULT_TITLE),
      description,
      ...(ogImage && { images: [ogImage] }),
    },
    ...(canonicalUrl && { alternates: { canonical: canonicalUrl } }),
    ...(noIndex && { robots: { index: false, follow: false } }),
  }
}

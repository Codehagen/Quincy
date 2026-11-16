import * as React from "react"

import { Text } from "./text"

export type KitPageProps = {
  /** The page's one `h1`, at the title size (28px, 600), after the landing. */
  title: string
  /**
   * One line of muted copy under the title, against the person's own
   * baseline ("3 ideas waiting. Your usual week clears 5."), as the
   * landing's subline sits under its headline. May hold a Count, live or
   * not. One line: anything longer is a Stage's lead.
   */
  summary?: React.ReactNode
  /**
   * At most two controls at the header's end: a quiet Button or ButtonLink
   * ("New conversation"), an IconButton, a Menu. Never the blue action: the
   * one action on a view belongs to the object it acts on (actions.md).
   */
  actions?: React.ReactNode
  /** The Stages, in reading order, with plain Text between them if any. */
  children: React.ReactNode
  /**
   * `h1` (default). `p` only where a KitPage is shown as a specimen inside
   * another page (the kit lab), so that page keeps its one h1.
   */
  titleAs?: "h1" | "p"
  /**
   * `page` (default): the 720px column (`max-w-kit-page`) every page reads
   * in. `wide`: up to 1280px (`max-w-kit-wide`), for a page whose list and
   * open item stand side by side once the stage is wide enough (Drafts, when it moves;
   * docs/design/page.md, "Wide"). Only for list and detail: a page of prose
   * or of single objects stays `page`, because a wide column is a long line.
   */
  width?: "page" | "wide"
}

const WIDTH: Record<NonNullable<KitPageProps["width"]>, string> = {
  page: "max-w-kit-page",
  wide: "max-w-kit-wide",
}

/**
 * The page shell, inside the app frame (docs/design/app-shell.md): a 720px
 * column (`max-w-kit-page`, or 1280 with `width="wide"`), centred, on the white ground, with a 16px side
 * gutter on a phone and 32px from 40rem (`kit-page-gutter`), 64px from the
 * top, 96px of floor, and 56px between the title and each Stage
 * (`kit-page-gap`).
 *
 * Not a landmark. The frame around it owns `<main>` (the app shell, the
 * marketing shell, a prototype frame), so a page that has not moved to the
 * kit yet still sits in one, and a kit page never nests a second.
 *
 * A shared component: no hooks, no `"use client"`, no server-only imports,
 * so it renders the same from page.tsx or from inside a client screen. Keep
 * it that way: a screen whose summary holds a live Count renders KitPage
 * itself. What it must never be is under a `<Suspense>` that waits on data,
 * because the title would wait with it (docs/design/page.md).
 */
export function KitPage({
  title,
  summary,
  actions,
  children,
  titleAs = "h1",
  width = "page",
}: KitPageProps) {
  return (
    <div
      data-slot="kit-page"
      // From 40rem every Card on the page takes the landing's object padding
      // (28 × 24); on a phone it keeps 18, as the landing does.
      className={`mx-auto flex w-full ${WIDTH[width]} flex-col gap-kit-page-gap px-kit-page-gutter pt-kit-page-top pb-kit-page-bottom sm:[--kit-object-pad-x:var(--spacing-kit-pad-x)] sm:[--kit-object-pad-y:var(--spacing-kit-pad-y)]`}
    >
      <header className="flex flex-wrap items-end justify-between gap-x-kit-group gap-y-kit-related">
        <div className="flex min-w-0 flex-col gap-kit-related">
          <Text as={titleAs} variant="title">
            {title}
          </Text>
          {summary != null ? <Text tone="muted">{summary}</Text> : null}
        </div>
        {actions != null ? (
          <div className="flex shrink-0 items-center gap-kit-controls">{actions}</div>
        ) : null}
      </header>
      {children}
    </div>
  )
}

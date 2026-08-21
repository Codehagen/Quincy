"use client"

import Link from "next/link"
import { PencilEdit02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { cn } from "@/lib/utils"

export type TreeItem = {
  slug: string
  label: string
  /**
   * Marks a compiled page you have since corrected. The inverse of what this
   * used to carry, and the inversion is the point: everything inside a group is
   * compiled by construction, so a mark on all of them says nothing. The rare
   * state is the one worth a glyph — correcting a page takes it out of
   * Heartbeat's loop for good.
   */
  corrected?: boolean
}

export type TreeGroup = {
  label: string
  items: TreeItem[]
  /** Shown inside the disclosure when the group is empty, never in the nav. */
  empty: string
}

/**
 * The brain's table of contents.
 *
 * Two shapes, because the brain has two kinds of page and one flat list made
 * them look alike. The pages you own are a fixed set that always exists, so
 * they are a plain list. Material and the notebook are collections Quincy
 * fills, so they are disclosures — which also means an empty one is a closed
 * row with a zero on it rather than two lines of prose explaining itself in the
 * middle of the navigation.
 *
 * No section headings. There were four for five pages, two of them labelling
 * nothing, and one that stuttered against the single item beneath it. The
 * disclosure triangle carries the grouping now.
 *
 * Anchors, not buttons: each page is a real URL, so it is linkable, opens in a
 * new tab, and survives a reload. A button with client state would look the
 * same and lose all three.
 */
export function BrainTree({
  pages,
  groups,
  active,
  onSelect,
}: {
  pages: TreeItem[]
  groups: TreeGroup[]
  active: string
  /**
   * Selects a page without leaving the route. The rows stay anchors — they are
   * still real, linkable, middle-clickable URLs — but a plain left click is
   * intercepted, because the pages are already in the client cache and asking
   * the server to re-render for data it already sent is the round trip this
   * whole surface was rebuilt to avoid.
   */
  onSelect: (slug: string) => void
}) {
  return (
    <nav
      aria-label="Brain"
      className={cn(
        "flex shrink-0 flex-col gap-4 overflow-y-auto border-sidebar-border bg-sidebar p-3",
        // Stacked on a phone, not hidden. Hiding it left the small screen on
        // whichever page it loaded with and no way to reach another one, which
        // is a dead end rather than a missing feature. Capped so the editor is
        // still the larger half.
        "max-h-56 w-full border-b",
        // 52 rather than 60. The labels are one word each now, and the two
        // sidebars together were taking 496px of a 1280px window before any
        // content appeared.
        "md:max-h-none md:w-52 md:border-e md:border-b-0"
      )}
    >
      <ul role="list" className="flex flex-col gap-0.5">
        {pages.map((item) => (
          <li key={item.slug}>
            <TreeLink item={item} active={active} onSelect={onSelect} />
          </li>
        ))}
      </ul>

      {groups.map((group) => (
        // Uncontrolled <details>: the open state is the browser's to keep, it
        // needs no hydration, and it is keyboard-operable without writing any
        // of that. Open when there is something inside, closed when there is
        // not — an empty group should cost one row, not five.
        <details
          key={group.label}
          open={group.items.length > 0}
          className="group/disclosure"
        >
          <summary
            className={cn(
              "flex cursor-default list-none items-center gap-1.5 rounded-sm px-2 py-1.5 text-body",
              "text-muted-foreground transition-colors duration-150 hover:text-foreground",
              "outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              "[&::-webkit-details-marker]:hidden"
            )}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 12 12"
              className="size-3 shrink-0 transition-transform duration-150 group-open/disclosure:rotate-90"
            >
              <path
                d="M4.5 3 8 6l-3.5 3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="min-w-0 flex-1 truncate">{group.label}</span>
            {/* Tabular so the column does not shuffle as counts tick between
                9 and 10. */}
            <span className="tabular text-caption">{group.items.length}</span>
          </summary>

          {group.items.length === 0 ? (
            <p className="px-2 pt-1 pb-2 pl-7 text-caption text-pretty text-muted-foreground">
              {group.empty}
            </p>
          ) : (
            <ul role="list" className="flex flex-col gap-0.5 pt-1 pl-4">
              {group.items.map((item) => (
                <li key={item.slug}>
                  <TreeLink item={item} active={active} onSelect={onSelect} />
                </li>
              ))}
            </ul>
          )}
        </details>
      ))}
    </nav>
  )
}

function TreeLink({
  item,
  active,
  onSelect,
}: {
  item: TreeItem
  active: string
  onSelect: (slug: string) => void
}) {
  const isActive = item.slug === active

  return (
    <Link
      href={`/brain?page=${encodeURIComponent(item.slug)}`}
      aria-current={isActive ? "page" : undefined}
      onClick={(event) => {
        // Only the plain left click. Modifier-clicks and middle-clicks are how
        // people open a page in a new tab, and swallowing those would take a
        // real capability away in exchange for saving a round trip they were
        // never going to pay.
        if (
          event.defaultPrevented ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          event.button !== 0
        ) {
          return
        }
        event.preventDefault()
        onSelect(item.slug)
      }}
      className={cn(
        "flex items-center gap-2 rounded-sm px-2 py-1.5 text-body",
        // Named properties. Weight never changes between states — a semibold
        // active row would shift every label under it by a fraction as you move
        // down the list.
        "transition-colors duration-150",
        "hover:bg-sidebar-accent-subtle",
        "outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-muted-foreground"
      )}
    >
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.corrected ? (
        // An icon with real text behind it, not a dot with a title. A title
        // attribute is invisible to touch and to the keyboard, which was the
        // whole audience for the one distinction this page turns on.
        <span title="You corrected this" className="shrink-0 leading-none">
          <HugeiconsIcon
            icon={PencilEdit02Icon}
            size={13}
            aria-hidden="true"
            className="text-muted-foreground"
          />
          <span className="sr-only">You corrected this</span>
        </span>
      ) : null}
    </Link>
  )
}

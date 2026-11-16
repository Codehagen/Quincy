import * as React from "react"
import Link from "next/link"
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"

import { FOCUS_RING } from "./control-styles"

// One row look for lists and navigation, after the landing's idea rows
// (IdeasPicture): 16px side inset, quiet grey hover (gated on hover-capable
// pointers by Tailwind v4) one step lighter than selected, a small press, and
// selected/current in the selected grey with ink, never blue. A selected row
// keeps the selected grey on hover, so hover never reads as picking. 44px tall minimum, so the hit area IS
// the row. Rows sit inside a List (a Card with a 6px kit-row-inset), so the
// 12px row radius nests in the 18px object (inner = outer − padding).
const ROW =
  `relative flex w-full min-w-0 items-center gap-kit-related rounded-kit-control px-kit-row-x text-left text-kit-body select-none ${FOCUS_RING} focus-visible:outline-offset-0 ` +
  "transition-[scale,background-color,color] duration-[var(--kit-duration-press),var(--kit-duration-state),var(--kit-duration-state)] ease-kit-out motion-reduce:transition-none " +
  "text-kit-ink hover:not-data-[selected]:not-data-disabled:bg-kit-row-hover active:scale-[0.985] motion-reduce:active:scale-100 " +
  "data-[selected]:bg-kit-selected " +
  "data-disabled:cursor-default data-disabled:opacity-50 data-disabled:active:scale-100"

export type ListRowProps = Omit<
  ButtonPrimitive.Props,
  "className" | "style" | "children" | "render" | "nativeButton"
> & {
  /** The row's title. One line by default; it truncates. */
  children: React.ReactNode
  /**
   * `1` (default) truncates the title to one line. `2` lets it wrap and
   * clamps at two, for titles that are sentences (a hook, a riff's first
   * line) on a phone, where one line would cut them to three words.
   */
  titleLines?: 1 | 2
  /** A muted second line. */
  description?: string
  /** Before the title: an avatar, a dot, a hugeicon element. */
  leading?: React.ReactNode
  /** After the title, right-aligned: usually a kit Mono (a time, a count). */
  meta?: React.ReactNode
  /**
   * The row whose detail is showing. Announced as `aria-current="true"`;
   * the selected grey marks it, as the landing's picked idea.
   *
   * `"visual"` draws the selected grey and announces nothing, for a row
   * whose state is said elsewhere: the shell's account trigger, lit while
   * you are on a page its menu holds (the menu row carries
   * `aria-current="page"`; a menu button announced as current would be a
   * lie about what it is).
   */
  selected?: boolean | "visual"
}

/**
 * A pressable row in a list (a riff, a person, a draft). A real button: it
 * does one thing, usually opening the thing it names. For a row that goes to
 * a page, use NavRow.
 */
export function ListRow({
  children,
  description,
  leading,
  meta,
  selected = false,
  titleLines = 1,
  type = "button",
  ...props
}: ListRowProps) {
  return (
    <ButtonPrimitive
      {...props}
      type={type}
      aria-current={selected === true ? "true" : undefined}
      data-selected={selected ? "" : undefined}
      data-slot="kit-list-row"
      className={`${ROW} min-h-11 ${description || titleLines === 2 ? "py-kit-row-y" : ""}`}
    >
      {leading ? <span className="flex shrink-0 items-center">{leading}</span> : null}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={`font-kit-strong ${titleLines === 2 ? "line-clamp-2 text-pretty" : "truncate"}`}>
          {children}
        </span>
        {description ? (
          <span className="truncate text-kit-small text-kit-ink-muted">{description}</span>
        ) : null}
      </span>
      {meta ? <span className={`shrink-0 ${titleLines === 2 ? "self-start" : ""}`}>{meta}</span> : null}
    </ButtonPrimitive>
  )
}

export type NavRowDensity = "row" | "compact"

export type NavRowProps = Omit<
  React.ComponentPropsWithRef<typeof Link>,
  "className" | "style" | "children" | "aria-current"
> & {
  children: string
  /** Leading hugeicon. Decorative beside the label, so aria-hidden. */
  icon?: IconSvgElement
  /**
   * Before the label, in place of `icon`: a GlyphTile, an Avatar, a
   * SourceMark. Whatever it is, it is decoration beside the label.
   */
  leading?: React.ReactNode
  /** A muted second line ("Connected as @ada"). Truncates. */
  description?: string
  /**
   * After the label, right-aligned: usually a kit Mono (a time, a date).
   * Not beside `count` or `waiting`: one mark per row.
   */
  meta?: React.ReactNode
  /** The page you are on: `aria-current="page"` and the selected grey. */
  current?: boolean
  /** A count after the label, mono and muted ("12"). Omit at zero. */
  count?: number
  /**
   * Something on that page waits for the person (lab 36): a small dot at the
   * row's end, and ", 2 waiting" in the row's name. Omit, or 0, when nothing
   * waits. Opening the page is what clears it, so the caller passes 0 for
   * the current page. Never beside `count`: one mark per row.
   */
  waiting?: number
  /**
   * `row` (default): 44px, as every ListRow. `compact`: 36px under a fine
   * pointer and still 44px under a coarse one, for the app sidebar only,
   * where a dozen rows have to fit above the fold.
   */
  density?: NavRowDensity
}

const DENSITY: Record<NavRowDensity, string> = {
  row: "min-h-11",
  compact: "min-h-kit-control-md pointer-coarse:min-h-11",
}

/** A row that navigates (sidebar, settings sections). A Next.js Link. */
export function NavRow({
  children,
  icon,
  leading,
  description,
  meta,
  current = false,
  count,
  waiting,
  density = "row",
  ...props
}: NavRowProps) {
  return (
    <Link
      {...props}
      aria-current={current ? "page" : undefined}
      data-selected={current || undefined}
      data-slot="kit-nav-row"
      className={`${ROW} ${DENSITY[density]} ${description ? "py-kit-row-y" : ""}`}
    >
      {leading != null ? (
        <span aria-hidden className="flex shrink-0 items-center">{leading}</span>
      ) : icon ? (
        <HugeiconsIcon
          icon={icon}
          size={18}
          strokeWidth={2}
          aria-hidden
          className={`shrink-0 ${current ? "" : "text-kit-ink-muted"}`}
        />
      ) : null}
      {description ? (
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-kit-strong">{children}</span>
          <span className="truncate text-kit-small text-kit-ink-muted">{description}</span>
        </span>
      ) : (
        <span className="min-w-0 flex-1 truncate font-kit-strong">{children}</span>
      )}
      {meta != null ? <span className="shrink-0">{meta}</span> : null}
      {count ? (
        <span
          className={`shrink-0 font-kit-mono text-kit-mono tabular-nums ${current ? "" : "text-kit-ink-muted"}`}
        >
          {count}
        </span>
      ) : null}
      {waiting ? (
        <>
          {/* "Your next step" in the primary ink (the app has no blue
              control since 2026-11-16). A mark, not a fill: 6px, decorative,
              the words in the name carry it. */}
          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-kit-primary" />
          <span className="sr-only">, {waiting} waiting</span>
        </>
      ) : null}
    </Link>
  )
}

import * as React from "react"

/**
 * Text tones. There is no "faint": --kit-ink-faint is 2.4:1 and is for
 * non-text marks only, so no text component can reach it.
 */
export type TextTone = "ink" | "muted"

/**
 * `h1` is the page title: one per page, `variant="title"` (KitPage renders
 * it). Every other heading is `weight="strong"` at body size: inside a page,
 * hierarchy is weight and grey.
 */
type TextElement = "p" | "span" | "div" | "h1" | "h2" | "h3" | "h4" | "li" | "dt" | "dd"

type TextVariant =
  /** Hierarchy is weight and grey: a heading is `weight="strong"` at body size. */
  | { variant?: "body" | "small"; weight?: "regular" | "strong" }
  /** The number on its own line. Always a block, 600, tabular. Never a heading. */
  | { variant: "figure"; weight?: never }
  /**
   * The app page's one `h1` (KitPage): 28px at 600, the landing's display-md
   * at its phone size. Once per page; every other heading is body at 560.
   */
  | { variant: "title"; weight?: never }

export type TextProps = Omit<
  React.HTMLAttributes<HTMLElement>,
  "className" | "style" | "children"
> &
  TextVariant & {
    children: React.ReactNode
    tone?: TextTone
    as?: TextElement
    ref?: React.Ref<HTMLElement>
  }

const VARIANT = {
  body: "text-kit-body",
  small: "text-kit-small",
  figure: "block text-kit-figure tabular-nums",
  title: "text-kit-title text-balance",
} as const

const TONE: Record<TextTone, string> = {
  ink: "text-kit-ink",
  muted: "text-kit-ink-muted",
}

/** All copy in the kit. */
export function Text({
  children,
  variant = "body",
  weight = "regular",
  tone = "ink",
  as: As = "p",
  ...props
}: TextProps) {
  const strong = variant !== "figure" && variant !== "title" && weight === "strong"
  // createElement, because JSX cannot type one ref across an element union.
  return React.createElement(
    As,
    {
      ...props,
      className: `${VARIANT[variant]} ${TONE[tone]}${strong ? " font-kit-strong" : ""}`,
    },
    children,
  )
}

/** The grey continuation, inline inside a line of ink. */
export function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-kit-ink-muted">{children}</span>
}

/**
 * "**Bold lead.** grey continuation." Stage renders its own; use this only
 * for the same pattern inside an object, such as an empty state.
 */
export function Lead({ bold, rest }: { bold: string; rest?: string }) {
  return (
    <p className="text-kit-body text-kit-ink">
      <span className="font-kit-strong">{bold}</span>
      {rest ? (
        <>
          {" "}
          <Muted>{rest}</Muted>
        </>
      ) : null}
    </p>
  )
}

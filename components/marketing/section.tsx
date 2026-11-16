/**
 * A marketing page is a column of Sections. Each one is a headline with its
 * line, then what proves it: a picture, the actions, a form. The parts set
 * every gap, so a page never guesses one (docs/design/marketing.md).
 */

export type SectionPosition = "first" | "middle" | "last"
export type SectionLayout = "stack" | "split"

const POSITION: Record<SectionPosition, string> = {
  first: "pt-kit-section-top",
  middle: "mt-kit-section scroll-mt-kit-under-mark",
  last: "mt-kit-section scroll-mt-kit-under-mark pb-kit-section-end",
}

const LAYOUT: Record<SectionLayout, string> = {
  stack: "flex flex-col items-center",
  split: "grid items-center gap-kit-to-picture lg:grid-cols-[2fr_3fr] lg:gap-kit-to-picture-lg",
}

export type SectionProps = {
  /** The SectionHeading's `id`: the section is named by its headline. */
  labelledBy: string
  /** An anchor the header or a CTA links to (`how`, `join`). */
  id?: string
  /** `first` sits under the header (the hero), `last` above the footer. Default `middle`. */
  position?: SectionPosition
  /**
   * `stack` (default): headline centred over its proof. `split`: headline
   * left, picture right from 64rem, for the one section that argues beside
   * its picture instead of over it.
   */
  layout?: SectionLayout
  children: React.ReactNode
}

export function Section({ labelledBy, id, position = "middle", layout = "stack", children }: SectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={`mx-auto w-full max-w-kit-marketing px-kit-page-gutter ${POSITION[position]} ${LAYOUT[layout]}`}
    >
      {children}
    </section>
  )
}

export type SectionHeadingSize = "xl" | "lg" | "md" | "price"

const HEADLINE: Record<SectionHeadingSize, string> = {
  xl: "text-kit-display-xl",
  lg: "text-kit-display-lg",
  md: "text-kit-display-md",
  price: "text-kit-display-price tabular-nums",
}

export type SectionHeadingProps = {
  /** Referenced by the Section's `labelledBy`. */
  id: string
  /**
   * One line, or two. Two is the page's voice: a pair of claims, each on its
   * own line from the first breakpoint, never a break `text-balance` picks.
   */
  title: string | readonly [string, string]
  /**
   * `xl` is the page's one h1 (with the larger lede); every other size is an
   * h2. Default `lg`. `md` is for a split section, `price` for the price.
   */
  size?: SectionHeadingSize
  /** Default `center`. `start` in a split section. */
  align?: "center" | "start"
  /** The subline: one or two sentences, muted. */
  children?: React.ReactNode
}

export function SectionHeading({ id, title, size = "lg", align = "center", children }: SectionHeadingProps) {
  const Tag = size === "xl" ? "h1" : "h2"
  const lines = typeof title === "string" ? [title] : title
  const lede = size === "xl"
  return (
    <div className={`flex flex-col ${align === "center" ? "items-center text-center" : "items-start text-left"}`}>
      <Tag id={id} className={`${HEADLINE[size]} text-balance text-kit-ink`}>
        {lines[0]}
        {lines[1] ? <span className="block">{lines[1]}</span> : null}
      </Tag>
      {children ? (
        <p
          className={
            lede
              ? "mt-kit-to-lede max-w-kit-lede text-kit-display-lede text-pretty text-kit-ink-muted"
              : "mt-kit-to-subline max-w-kit-subline text-kit-display-body text-pretty text-kit-ink-muted"
          }
        >
          {children}
        </p>
      ) : null}
    </div>
  )
}

export type SectionPictureWidth = "sm" | "md" | "lg" | "full"

const PICTURE_WIDTH: Record<SectionPictureWidth, string> = {
  sm: "max-w-kit-picture-sm",
  md: "max-w-kit-picture-md",
  lg: "max-w-kit-picture-lg",
  full: "",
}

export type SectionPictureProps = {
  /** `sm` 45rem (a thread), `md` 60rem (one object), `lg` 67rem (two side by side), `full` (the picture caps itself). */
  width: SectionPictureWidth
  /** `md` (default) under a section line; `lg` under the hero, or before a whole object on the ground. */
  gap?: "md" | "lg"
  children: React.ReactNode
}

/** The proof under a stack Section's headline. In a split Section, put the picture in directly. */
export function SectionPicture({ width, gap = "md", children }: SectionPictureProps) {
  return (
    <div className={`mx-auto w-full ${PICTURE_WIDTH[width]} ${gap === "lg" ? "mt-kit-to-picture-lg" : "mt-kit-to-picture"}`}>
      {children}
    </div>
  )
}

/** The actions or the form under a headline, centred, wrapping on a phone. */
export function SectionActions({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-kit-to-actions flex w-full flex-wrap items-center justify-center gap-x-kit-to-subline gap-y-kit-related">{children}</div>
  )
}

/** The friend over a headline, where Quincy itself is the subject. Once per page. */
export function SectionMark({ children }: { children: React.ReactNode }) {
  return <div className="mb-kit-under-mark pointer-events-none select-none">{children}</div>
}

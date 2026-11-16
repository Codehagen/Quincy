import * as React from "react"

/**
 * Where the stage edge cuts the object. `none` keeps it whole; `bottom` runs
 * it off the stage's bottom edge; `corner` off the bottom and the right.
 * Cropping only means something inside a Stage.
 */
export type Crop = "none" | "bottom" | "corner"

/**
 * `full` spans the stage. `with-margin` leaves the margin column free for
 * MarginNote / BeatBracket notes. Under a 32rem stage, or outside any Stage,
 * it is full width, because the notes sit under their lines there.
 */
export type CardWidth = "full" | "with-margin"

export type CardLayout =
  | { crop?: "none" | "bottom"; width?: CardWidth }
  /** A corner crop runs past the right edge, so it is always full width. */
  | { crop: "corner"; width?: "full" }

export type CardBaseProps = Omit<
  React.ComponentPropsWithRef<"div">,
  "className" | "style" | "children"
> & {
  children: React.ReactNode
  /** `none` drops the padding, for an object that lays out its own rows. */
  inset?: "normal" | "none"
}

export type CardProps = CardBaseProps & CardLayout

const CROP: Record<Crop, string> = {
  none: "",
  // The stage pads its bottom by its gutter (30, or 18 on a narrow stage,
  // published as --kit-stage-gutter), so a crop pulls past both. A Stage on
  // the ground publishes 0 for both, so there a crop is a whole object: a
  // cut only reads as "the product continues" against a grey recess.
  bottom:
    "mb-[calc(-1*(var(--kit-stage-gutter,var(--spacing-kit-gutter))+var(--kit-crop-bleed,var(--spacing-kit-bleed))))]",
  corner:
    "mb-[calc(-1*(var(--kit-stage-gutter,var(--spacing-kit-gutter))+var(--kit-crop-bleed,var(--spacing-kit-bleed))))] w-[calc(100%+var(--kit-stage-gutter,var(--spacing-kit-gutter))+var(--kit-crop-bleed,var(--spacing-kit-bleed)))] max-w-none",
}

const WIDTH: Record<CardWidth, string> = {
  full: "self-stretch",
  // Mobile-first, like the notes: full width unless a Stage ≥ 32rem gives
  // the margin column room.
  "with-margin":
    "w-full @lg/kit-stage:w-[calc(100%-var(--spacing-kit-margin)-var(--spacing-kit-margin-gap))]",
}

/**
 * The white object: a hairline ring and a very soft fall, no border.
 *
 * Padding is 18 by default. A page that opts in (KitPage does, from 40rem)
 * sets `--kit-object-pad-x` / `--kit-object-pad-y` to the landing's held
 * draft, 28 by 24, and every Card inside takes it. Opt-in rather than the
 * default because the landing's own pictures render this Card at 18.
 *
 * It publishes its side padding as `--kit-card-pad` so a margin note or a
 * Rule inside can place itself against the object's outer edge.
 */
export function Card({
  children,
  crop = "none",
  width = "full",
  inset = "normal",
  ...props
}: CardProps) {
  const pad =
    inset === "normal"
      ? "[--kit-card-pad:var(--kit-object-pad-x,var(--spacing-kit-pad))] px-(--kit-card-pad) py-[var(--kit-object-pad-y,var(--spacing-kit-pad))]"
      : "[--kit-card-pad:0px]"
  return (
    <div
      {...props}
      data-slot="kit-card"
      data-crop={crop}
      data-width={crop === "corner" ? "full" : width}
      className={`relative box-border flex-none rounded-kit-object bg-kit-object shadow-kit-object ${pad} ${crop === "corner" ? "self-start" : WIDTH[width]} ${CROP[crop]}`}
    >
      {children}
    </div>
  )
}

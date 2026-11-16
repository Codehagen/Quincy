import * as React from "react"

import { Lead } from "./text"

export type StageBackdrop = "ground" | "recess" | "grid" | /** @deprecated Use `recess`. */ "plain"

type StageProps = Omit<
  React.ComponentPropsWithRef<"section">,
  "className" | "style" | "children"
> & {
  /**
   * The bold sentence. One sentence, first person or about the person.
   * Leave it out only when the object opens with its own `Lead` (the empty
   * state), so the stage would say two bold sentences, or for a showcase
   * of controls (docs/design/layout.md, "A Stage without a lead").
   * A string on purpose: a lead is copy, so a Count, a link or a button
   * belongs in the object under it, never in the lead.
   */
  lead?: string
  /** The grey continuation after the lead. Needs a `lead`. */
  rest?: string
  /**
   * `ground` (default): no frame. The lead and the object sit on the white
   * page, as the landing's held draft does: the grey is not a page
   * background (2026-11-16). `recess`: the grey frame that crops the object
   * at its foot, for a picture of the product (the landing's Crop). `grid`:
   * the recess with faint graph paper, behind a showcase of controls.
   * `plain` is the old name of `recess`, kept so call sites compile.
   */
  backdrop?: StageBackdrop
  /** The object(s) under the lead: normally one Card or Window. */
  children: React.ReactNode
}

/**
 * How a Stage stacks its objects: 14 apart, left-aligned, and an Arrive (an
 * UndoBar) that takes its gap inside its own clip. Exported for a column
 * inside a Stage that stacks the same way (the list column of a wide list
 * and detail, docs/design/page.md), so the fold of a closed UndoBar is the
 * Stage's own and not a copy of it.
 */
export const STAGE_STACK =
  "flex flex-col items-start gap-kit-stack [&>[data-slot=kit-arrive]]:self-stretch " +
  "[&>*+[data-slot=kit-arrive]]:mt-[calc(-1*var(--spacing-kit-stack))] " +
  "[&>*+[data-slot=kit-arrive]>div>[data-slot=kit-arrive-body]]:pt-kit-stack"

const GRID =
  "bg-[linear-gradient(var(--kit-grid-line)_1px,transparent_1px),linear-gradient(90deg,var(--kit-grid-line)_1px,transparent_1px)] bg-size-[var(--spacing-kit-grid)_var(--spacing-kit-grid)]"

/**
 * A section of a page: "**Bold.** grey rest", then the object(s) under it.
 * On the ground by default; in a grey recess (`recess`, `grid`) only when it
 * is a picture, where one white object sits low and is cropped by the
 * frame's edge. One object per stage; split stages were discarded. Stacking
 * a small object above the main one is fine, and only the last one should
 * crop.
 *
 * It is a size container (`kit-stage`): under 32rem there is no room for a
 * margin column, so MarginNote and BeatBracket drop their notes under the
 * line they mark instead of being cut off by the edge.
 */
export function Stage({
  lead,
  rest,
  backdrop = "ground",
  children,
  ...props
}: StageProps) {
  const recess = backdrop !== "ground"
  return (
    <section
      {...props}
      data-slot="kit-stage"
      data-backdrop={backdrop === "plain" ? "recess" : backdrop}
      className={
        recess
          ? `@container/kit-stage relative overflow-hidden rounded-kit-stage bg-kit-stage ${backdrop === "grid" ? GRID : ""}`
          : // On the ground nothing clips, so an object's shadow is whole, and
            // gutter and bleed are 0, so a `crop` Card stays whole too.
            "@container/kit-stage relative [--kit-crop-bleed:0px] [--kit-stage-gutter:0px]"
      }
    >
      {/* The gutter is 30, and 18 on a stage under 28rem (a phone). It is
          published as --kit-stage-gutter so a cropped Card pulls past the
          gutter it actually has. A container query, not a media query: a
          narrow stage on a wide screen is narrow too. */}
      <div
        className={
          recess
            ? "p-(--kit-stage-gutter) [--kit-stage-gutter:var(--spacing-kit-gutter)] @max-md/kit-stage:[--kit-stage-gutter:var(--spacing-kit-gutter-sm)]"
            : undefined
        }
      >
        {lead ? (
          <div className="mb-kit-lead-gap max-w-kit-lead text-pretty">
            <Lead bold={lead} rest={rest} />
          </div>
        ) : null}
        {/* items-start, so a crop="corner" object keeps its own width. An
            Arrive (or an UndoBar, which is one) stretches: it is a wrapper,
            and the object inside it sets its own width. An Arrive after
            another object takes the stack gap inside its clip instead of
            from the flex gap, so a closed one (an UndoBar waiting, a
            dismissed detail) leaves no 14px behind, and the gap folds with
            the motion. */}
        <div className={STAGE_STACK}>
          {children}
        </div>
      </div>
    </section>
  )
}

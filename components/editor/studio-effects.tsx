"use client"

import * as React from "react"
import {
  ColorsIcon,
  ContrastIcon,
  DropletIcon,
  PaintBoardIcon,
  PaintBucketIcon,
  SunIcon,
  ZoomInAreaIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"

import { effectGroups, type EffectSpec } from "@/lib/editor/effect-catalogue"
import type { EffectType } from "@/lib/editor/types"
import { cn } from "@/lib/utils"

/**
 * What you can put on the clip you are looking at.
 *
 * Nine effects render and, until this, five of them could not be reached by any
 * means at all — not a button, not an op, not a tool. The panel is the way in;
 * the lane chip and the toolbar are where they get tuned afterwards.
 *
 * Rows rather than a grid of tiles. At 260px a two-column grid gives each cell
 * about 120px, which fits an icon and a word and leaves no room to say what
 * "Colour shift" or "Invert" actually do to your footage — and those are
 * exactly the two nobody can guess.
 */

const ICON: Record<EffectType, IconSvgElement> = {
  zoom: ZoomInAreaIcon,
  brightness: SunIcon,
  contrast: ContrastIcon,
  saturation: PaintBoardIcon,
  blur: DropletIcon,
  hue: ColorsIcon,
  // One glyph for the three looks, matching the lane. They are the same kind of
  // decision and three near-identical paint icons would be three ways of saying
  // "look" that nobody can tell apart.
  grayscale: PaintBucketIcon,
  sepia: PaintBucketIcon,
  invert: PaintBucketIcon,
}

export function StudioEffects({
  /** What the clip under the playhead already carries. */
  applied,
  hasClip,
  onApply,
  onRemove,
  locked,
}: {
  applied: Set<EffectType>
  hasClip: boolean
  onApply: (type: EffectType) => void
  onRemove: (type: EffectType) => void
  locked?: boolean
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center border-b border-border/60 px-4">
        <span className="text-xs font-medium">Effects</span>
      </div>

      {hasClip ? (
        <div className="min-h-0 flex-1 overflow-y-auto py-2">
          {effectGroups().map((group) => (
            <section key={group.kind} className="px-2 pb-2">
              <h3 className="px-2 py-1.5 text-[10px] tracking-wide text-muted-foreground uppercase">
                {group.title}
              </h3>

              <div className="flex flex-col gap-0.5">
                {group.effects.map((spec) => (
                  <EffectRow
                    key={spec.type}
                    spec={spec}
                    on={applied.has(spec.type)}
                    disabled={locked}
                    onApply={() => onApply(spec.type)}
                    onRemove={() => onRemove(spec.type)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <Empty />
      )}
    </div>
  )
}

/**
 * One effect, and whether it is already on.
 *
 * The row toggles. Clicking an effect that is already applied takes it off
 * rather than writing it again — `applyEffect` replaces rather than stacks, so
 * a second click would otherwise be a revision that costs an undo and changes
 * nothing, which is the worst kind of button.
 */
function EffectRow({
  spec,
  on,
  disabled,
  onApply,
  onRemove,
}: {
  spec: EffectSpec
  on: boolean
  disabled?: boolean
  onApply: () => void
  onRemove: () => void
}) {
  return (
    <button
      type="button"
      onClick={on ? onRemove : onApply}
      disabled={disabled}
      aria-pressed={on}
      title={
        on ? `Take ${spec.label.toLowerCase()} back off` : spec.description
      }
      className={cn(
        // items-start, not items-center. Centred on a two-line row, a 16px
        // icon lands against the description rather than the label it belongs
        // to — measured at 254px against a label at 237px, which reads as the
        // icon labelling the wrong line.
        "group flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left",
        // Named rather than `all`: this row has a transform on it, and
        // transitioning everything would animate the layout each time the
        // panel re-renders under a moving playhead.
        "transition-[color,background-color,transform] duration-150 ease-out",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-50",
        // 0.99 rather than the 0.96 the small buttons use. The same ratio on a
        // 240px row is a lurch; press feedback should be felt, not watched.
        "active:scale-[0.99]",
        on
          ? "bg-effect-surface text-effect-foreground"
          : "text-foreground hover:bg-secondary"
      )}
    >
      <HugeiconsIcon
        aria-hidden="true"
        icon={ICON[spec.type]}
        size={16}
        // A 16px glyph against a 15px line box sits a pixel proud of the cap
        // height. Optical, not arithmetic.
        className="mt-px shrink-0"
      />

      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs leading-tight">
          {spec.label}
        </span>
        <span
          className={cn(
            "mt-0.5 block text-[11px] leading-snug",
            // Full strength on the filled row, not /75. Dimmed it measured
            // 3.76:1 against the effect surface — under the 4.5 floor at 11px,
            // and the same mistake the caption chip made for the same reason:
            // a quiet surface does not need quiet text on top of it as well.
            on ? "text-effect-foreground" : "text-muted-foreground"
          )}
        >
          {spec.description}
        </span>
      </span>

      {on ? (
        <span
          aria-hidden="true"
          // Against the label, where the eye goes first. A dot centred on a
          // two-line row floats between the two and belongs to neither.
          className="mt-1.5 size-1.5 shrink-0 rounded-full bg-current"
        />
      ) : null}
    </button>
  )
}

/**
 * No clip under the playhead.
 *
 * An effect belongs to a clip, so with nothing under the head there is nothing
 * any of these rows could apply to. Nine disabled rows would say "broken";
 * this says what to do instead.
 */
function Empty() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-6">
      <p className="text-center text-[13px] leading-6 text-muted-foreground">
        Move the playhead over a clip,
        <br />
        and its effects show up here.
      </p>
    </div>
  )
}

"use client"

/*
 * On Base UI's Menu (the kit Menu's parts and panel), as every existing kit
 * popup. No ui-sdk here.
 */

import * as React from "react"
import { Menu as MenuPrimitive } from "@base-ui/react/menu"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import { ArrowDown01Icon, Tick02Icon } from "@hugeicons/core-free-icons"

import { FOCUS_RING, HIT_44, ICON_DENSE, ICON_DENSE_CHEVRON, PANEL, PANEL_ROW } from "./control-styles"
import { PORTAL_TYPE } from "./overlay-styles"

export type FilterOption<V extends string> = {
  value: V
  label: string
  /** How many rows picking it would leave, with the other filters as they are. */
  count: number
}

export type FilterMenuProps<V extends string> = {
  /** The filter's name, on the chip: "Source", "Shape". */
  label: string
  value: V
  /**
   * Every value, the first one being "any" (the filter off): "All sources".
   * A separator follows it.
   */
  options: readonly FilterOption<V>[]
  onValueChange: (value: V) => void
  /** Leading hugeicon on the chip. Decorative. */
  icon?: IconSvgElement
}

/**
 * A filter as a 28px chip in a filter Toolbar: "Source" while it is off,
 * "Source  GitHub" on a white chip while it is on. The menu lists every
 * value with how many rows it would leave, so a dead end shows before you
 * pick it: a 0 is disabled (unless it is the current value, which stays
 * reachable so you can see it is picked).
 *
 * Replaces Segmented used as a filter. A filter with two values and no
 * counts is still a Segmented (controls.md).
 */
export function FilterMenu<V extends string>({ label, value, options, onValueChange, icon }: FilterMenuProps<V>) {
  const on = value !== options[0]?.value
  const current = options.find((o) => o.value === value)
  return (
    <MenuPrimitive.Root>
      <MenuPrimitive.Trigger
        data-slot="kit-filter-menu"
        data-on={on || undefined}
        className={
          `relative inline-flex h-kit-control-xs shrink-0 items-center gap-1.5 rounded-full px-2.5 text-kit-dense font-kit-strong whitespace-nowrap select-none ${FOCUS_RING} ${HIT_44} ` +
          "text-kit-ink-muted shadow-kit-inset transition-[background-color,color,scale] duration-[var(--kit-duration-state),var(--kit-duration-state),var(--kit-duration-press)] ease-kit-out " +
          "hover:bg-kit-row-hover hover:text-kit-ink data-popup-open:bg-kit-row-hover data-popup-open:text-kit-ink active:scale-(--kit-press-scale) motion-reduce:transition-none motion-reduce:active:scale-100 " +
          // On: a white chip. Its hover is the control's own hover step,
          // never the row grey, which would read as off.
          "data-on:bg-kit-object data-on:text-kit-ink data-on:shadow-kit-control data-on:hover:bg-kit-control-hover data-on:data-popup-open:bg-kit-control-hover " +
          (icon ? "ps-2" : "")
        }
      >
        {icon ? <HugeiconsIcon icon={icon} {...ICON_DENSE} aria-hidden className="shrink-0" /> : null}
        <span>{label}</span>
        {on && current ? <span className="font-kit-regular text-kit-ink-muted">{current.label}</span> : null}
        {/* The glyph side reads 2px lighter than the text side (10 → 8).
            It turns over while the menu is open; reduced motion flips it. */}
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          {...ICON_DENSE_CHEVRON}
          aria-hidden
          className="-me-0.5 shrink-0 text-kit-ink-muted transition-[rotate] duration-(--kit-duration-state) ease-kit-out in-data-popup-open:rotate-180 motion-reduce:transition-none"
        />
      </MenuPrimitive.Trigger>
      <MenuPrimitive.Portal>
        <MenuPrimitive.Positioner side="bottom" align="start" sideOffset={6} className={`z-50 outline-hidden ${PORTAL_TYPE}`}>
          <MenuPrimitive.Popup data-slot="kit-filter-menu-panel" className={`${PANEL} min-w-52`}>
            <MenuPrimitive.RadioGroup value={value} onValueChange={(v) => onValueChange(v as V)}>
              {options.map((o, i) => (
                <React.Fragment key={o.value}>
                  {i === 1 ? <div aria-hidden className="mx-3 my-1 h-px bg-kit-hairline" /> : null}
                  <MenuPrimitive.RadioItem
                    value={o.value}
                    disabled={o.count === 0 && o.value !== value}
                    closeOnClick
                    className={`${PANEL_ROW} min-h-9 text-kit-ink`}
                  >
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    <span className="shrink-0 font-kit-mono text-kit-mono-sm text-kit-ink-muted tabular-nums">{o.count}</span>
                    <span className="flex w-4 shrink-0 justify-end">
                      <MenuPrimitive.RadioItemIndicator className="flex">
                        <HugeiconsIcon icon={Tick02Icon} size={16} strokeWidth={2} aria-hidden />
                      </MenuPrimitive.RadioItemIndicator>
                    </span>
                  </MenuPrimitive.RadioItem>
                </React.Fragment>
              ))}
            </MenuPrimitive.RadioGroup>
          </MenuPrimitive.Popup>
        </MenuPrimitive.Positioner>
      </MenuPrimitive.Portal>
    </MenuPrimitive.Root>
  )
}

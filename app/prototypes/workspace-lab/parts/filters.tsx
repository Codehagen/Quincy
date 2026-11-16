"use client"

import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { Menu as MenuPrimitive } from "@base-ui/react/menu"
import { Toggle } from "@base-ui/react/toggle"
import { ToggleGroup } from "@base-ui/react/toggle-group"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import { ArrowDown01Icon, Cancel01Icon, Search01Icon, Tick02Icon } from "@hugeicons/core-free-icons"

import { FOCUS_RING, HIT_44, PANEL, PANEL_ROW } from "@/components/kit/control-styles"
import { PORTAL_TYPE } from "@/components/kit/overlay-styles"

import { KeyHint } from "./toolbar"

/**
 * CANDIDATES — the filter row's controls. Behaviour is Base UI (Menu,
 * Input, ToggleGroup), as every existing kit control; no ui-sdk here.
 */

/* ── FilterMenu ──────────────────────────────────────────────────────── */

export type FilterOption<V extends string> = { value: V; label: string; count: number }

/**
 * A filter as a compact pill: "Source" while it is off, "Source  GitHub" in
 * ink while it is on. The menu lists every value with how many rows it would
 * leave, so a dead end shows before you pick it (a 0 is disabled). The first
 * option is "any", which turns the filter off.
 */
export function FilterMenu<V extends string>({
  label,
  value,
  options,
  onValueChange,
  icon,
}: {
  label: string
  value: V
  options: FilterOption<V>[]
  onValueChange: (v: V) => void
  icon?: IconSvgElement
}) {
  const on = value !== options[0]?.value
  const current = options.find((o) => o.value === value)
  return (
    <MenuPrimitive.Root>
      <MenuPrimitive.Trigger
        data-on={on || undefined}
        className={
          `ws-control relative inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 font-kit-strong whitespace-nowrap select-none ${FOCUS_RING} ${HIT_44} ` +
          "text-kit-ink-muted shadow-kit-inset transition-[background-color,color,scale] duration-[var(--kit-duration-state),var(--kit-duration-state),var(--kit-duration-press)] ease-kit-out " +
          "hover:bg-kit-row-hover hover:text-kit-ink data-popup-open:bg-kit-row-hover data-popup-open:text-kit-ink active:scale-(--kit-press-scale) motion-reduce:transition-none motion-reduce:active:scale-100 " +
          // On: a white chip. Its hover is the control's own hover step, never the row grey (which would read as off).
          "data-on:bg-kit-object data-on:text-kit-ink data-on:shadow-kit-control data-on:hover:bg-kit-control-hover data-on:data-popup-open:bg-kit-control-hover"
        }
      >
        {icon ? <HugeiconsIcon icon={icon} data-ws-icon aria-hidden className="shrink-0" /> : null}
        <span>{label}</span>
        {on && current ? <span className="font-kit-regular text-kit-ink-muted">{current.label}</span> : null}
        {/* -me-0.5: the trailing glyph side reads 2px lighter than the text side (10 → 8).
            It turns over while the menu is open; under reduced motion it simply flips. */}
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          size={14}
          strokeWidth={1.75}
          aria-hidden
          className="-me-0.5 shrink-0 text-kit-ink-muted transition-[rotate] duration-(--kit-duration-state) ease-kit-out in-data-popup-open:rotate-180 motion-reduce:transition-none"
        />
      </MenuPrimitive.Trigger>
      <MenuPrimitive.Portal>
        <MenuPrimitive.Positioner side="bottom" align="start" sideOffset={6} className={`z-50 outline-hidden ${PORTAL_TYPE}`}>
          <MenuPrimitive.Popup className={`${PANEL} min-w-52`}>
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
                    <span className="shrink-0 font-kit-mono text-kit-mono text-kit-ink-muted tabular-nums">{o.count}</span>
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

/* ── CompactSearch ───────────────────────────────────────────────────── */

/**
 * The kit SearchField one size down (32), flat (ring only, no fall: a field
 * in a toolbar is a slot, not an object), with the "/" that reaches it.
 * Escape clears, then a second Escape leaves (the page's key handler).
 */
export const CompactSearch = React.forwardRef<
  HTMLInputElement,
  { value: string; onValueChange: (v: string) => void; placeholder?: string; width?: string }
>(function CompactSearch({ value, onValueChange, placeholder = "Search", width = "w-56" }, ref) {
  const [focused, setFocused] = React.useState(false)
  const inner = React.useRef<HTMLInputElement | null>(null)
  return (
    <div className={`relative inline-flex min-w-0 ${width}`}>
      <HugeiconsIcon
        icon={Search01Icon}
        data-ws-icon
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-kit-ink-muted"
      />
      <InputPrimitive
        ref={(node) => {
          const el = node as HTMLInputElement | null
          inner.current = el
          if (typeof ref === "function") ref(el)
          else if (ref) ref.current = el
        }}
        type="search"
        value={value}
        onValueChange={(v) => onValueChange(v)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value !== "") {
            e.preventDefault()
            e.stopPropagation()
            onValueChange("")
          }
        }}
        aria-label={placeholder}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        className={
          `ws-control h-8 w-full min-w-0 rounded-full bg-kit-object pr-9 pl-8 text-kit-ink shadow-kit-inset placeholder:text-kit-ink-muted ${FOCUS_RING} focus-visible:outline-offset-0 ` +
          // Hover: the control's hover step, so the field reads as a place you can click into.
          "transition-[background-color] duration-(--kit-duration-state) ease-kit-out hover:not-focus:bg-kit-control-hover motion-reduce:transition-none " +
          "[&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
        }
      />
      <span className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center">
        {value !== "" ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              onValueChange("")
              inner.current?.focus()
            }}
            className={
              `relative grid size-4.5 place-items-center rounded-full bg-kit-track text-kit-ink-muted hover:text-kit-ink ${FOCUS_RING} after:absolute after:top-1/2 after:left-1/2 after:size-8 after:-translate-1/2 pointer-coarse:after:size-11 ` +
              "transition-[color,scale] duration-[var(--kit-duration-state),var(--kit-duration-press)] ease-kit-out active:scale-(--kit-press-scale) motion-reduce:transition-none motion-reduce:active:scale-100"
            }
          >
            <HugeiconsIcon icon={Cancel01Icon} size={10} strokeWidth={2.5} aria-hidden />
          </button>
        ) : !focused ? (
          <span className="pointer-coarse:hidden">
            <KeyHint k="/" />
          </span>
        ) : null}
      </span>
    </div>
  )
})

/* ── ViewSwitch ──────────────────────────────────────────────────────── */

/**
 * Two or three views of the same rows, as icons in one 28px track. Icon
 * only, so every item carries its name (aria-label) and the label shows on
 * hover (title): the icons are not self-evident enough to stand alone.
 */
export function ViewSwitch<V extends string>({
  value,
  onValueChange,
  options,
  label,
}: {
  value: V
  onValueChange: (v: V) => void
  options: { value: V; label: string; icon: IconSvgElement }[]
  label: string
}) {
  return (
    <ToggleGroup
      aria-label={label}
      value={[value]}
      onValueChange={(v) => {
        if (v[0]) onValueChange(v[0] as V)
      }}
      className="inline-flex h-7 shrink-0 items-center gap-0.5 rounded-full bg-kit-well p-0.5"
    >
      {options.map((o) => (
        <Toggle
          key={o.value}
          value={o.value}
          aria-label={o.label}
          title={o.label}
          className={
            `relative grid h-6 w-7 place-items-center rounded-full text-kit-ink-muted ${FOCUS_RING} focus-visible:outline-offset-0 ${HIT_44} ` +
            "transition-[background-color,color,box-shadow,scale] duration-[var(--kit-duration-state),var(--kit-duration-state),var(--kit-duration-state),var(--kit-duration-press)] ease-kit-out motion-reduce:transition-none " +
            "hover:text-kit-ink active:scale-(--kit-press-scale) motion-reduce:active:scale-100 data-pressed:bg-kit-object data-pressed:text-kit-ink data-pressed:shadow-kit-control"
          }
        >
          <HugeiconsIcon icon={o.icon} data-ws-icon aria-hidden />
        </Toggle>
      ))}
    </ToggleGroup>
  )
}

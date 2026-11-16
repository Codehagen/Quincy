"use client"

import * as React from "react"
import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion"
import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible"
import { ArrowDown01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { FOCUS_RING } from "./control-styles"

/**
 * The row that opens and closes: the summary in ink at 560, an optional
 * muted meta, a chevron that turns. 44px tall, grey on hover like a ListRow,
 * and pulled out by its own 12px inset so its words line up with the text
 * above and below it in the object.
 */
const TRIGGER =
  `group relative -mx-kit-recess flex min-h-11 w-[calc(100%+2*var(--spacing-kit-recess))] items-center gap-kit-related rounded-kit-control px-kit-recess text-left text-kit-body text-kit-ink select-none ${FOCUS_RING} focus-visible:outline-offset-0 ` +
  "transition-[background-color] duration-(--kit-duration-state) ease-kit-out motion-reduce:transition-none " +
  "not-data-disabled:hover:bg-kit-control-hover data-disabled:opacity-50"

const CHEVRON =
  "grid shrink-0 place-items-center text-kit-ink-muted transition-[rotate] duration-(--kit-duration-state) ease-kit-out motion-reduce:transition-none group-data-panel-open:rotate-180"

/**
 * The panel grows its height from 0 to Base UI's measured height and fades.
 * Only the vertical axis is clipped, so a focus ring or a margin note inside
 * is never cut at the sides (Arrive does the same). Reduced motion: it opens
 * at once.
 */
const PANEL =
  "overflow-x-visible overflow-y-clip transition-[height,opacity] duration-(--kit-duration-enter) ease-kit-out motion-reduce:transition-none " +
  "data-starting-style:opacity-0 data-ending-style:opacity-0"

function Summary({ summary, meta }: { summary: React.ReactNode; meta?: React.ReactNode }) {
  return (
    <>
      <span className="min-w-0 flex-1 font-kit-strong">{summary}</span>
      {meta != null ? <span className="shrink-0 text-kit-ink-muted tabular-nums">{meta}</span> : null}
      <span className={CHEVRON}>
        <HugeiconsIcon icon={ArrowDown01Icon} size={16} strokeWidth={2} aria-hidden />
      </span>
    </>
  )
}

export type DisclosureProps = Pick<
  CollapsiblePrimitive.Root.Props,
  "open" | "defaultOpen" | "onOpenChange" | "disabled"
> & {
  /** What is behind it, as a label: "Why Quincy picked this angle". */
  summary: React.ReactNode
  /** Muted, at the row's end: "3 sources", a Mono time. */
  meta?: React.ReactNode
  children: React.ReactNode
}

/**
 * One thing that can be shown or hidden in place: Quincy's reasoning under a
 * reply, the numbers behind an angle. Closed by default; the summary must say
 * enough that most people never open it. Several in one object that belong
 * together are an Accordion.
 */
export function Disclosure({ summary, meta, children, ...props }: DisclosureProps) {
  return (
    <CollapsiblePrimitive.Root {...props} data-slot="kit-disclosure" className="flex flex-col">
      <CollapsiblePrimitive.Trigger className={TRIGGER}>
        <Summary summary={summary} meta={meta} />
      </CollapsiblePrimitive.Trigger>
      <CollapsiblePrimitive.Panel
        className={`h-(--collapsible-panel-height) ${PANEL} data-starting-style:h-0 data-ending-style:h-0`}
      >
        <div className="pt-kit-tight pb-kit-related">{children}</div>
      </CollapsiblePrimitive.Panel>
    </CollapsiblePrimitive.Root>
  )
}

export type AccordionProps<V> = Pick<
  AccordionPrimitive.Root.Props<V>,
  "value" | "defaultValue" | "onValueChange" | "multiple" | "disabled"
> & {
  /** AccordionItems. */
  children: React.ReactNode
}

/**
 * Sections of one object that each open in place, divided by a hairline:
 * the parts of the brain, the weeks of a rhythm. One open at a time unless
 * `multiple`. Arrow keys move between the rows, Home and End jump.
 */
export function Accordion<V>({ children, ...props }: AccordionProps<V>) {
  return (
    <AccordionPrimitive.Root
      {...props}
      data-slot="kit-accordion"
      className="flex flex-col [&>*+*]:border-t [&>*+*]:border-kit-hairline"
    >
      {children}
    </AccordionPrimitive.Root>
  )
}

export type AccordionItemProps = Pick<AccordionPrimitive.Item.Props, "value" | "disabled"> & {
  summary: React.ReactNode
  meta?: React.ReactNode
  children: React.ReactNode
}

export function AccordionItem({ summary, meta, children, ...props }: AccordionItemProps) {
  return (
    <AccordionPrimitive.Item {...props} data-slot="kit-accordion-item" className="flex flex-col py-kit-tight">
      <AccordionPrimitive.Header className="m-0">
        <AccordionPrimitive.Trigger className={TRIGGER}>
          <Summary summary={summary} meta={meta} />
        </AccordionPrimitive.Trigger>
      </AccordionPrimitive.Header>
      <AccordionPrimitive.Panel
        className={`h-(--accordion-panel-height) ${PANEL} data-starting-style:h-0 data-ending-style:h-0`}
      >
        <div className="pt-kit-tight pb-kit-related">{children}</div>
      </AccordionPrimitive.Panel>
    </AccordionPrimitive.Item>
  )
}

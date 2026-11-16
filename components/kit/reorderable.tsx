"use client"

/*
 * Built on ui-sdk (@ui-sdk/core createReorder + createRovingFocus, composed
 * with definePrimitive and @ui-sdk/react/primitive createParts), not Base UI:
 * Base UI has no reorder. ui-sdk drags by pointer, moves by keyboard (Space
 * picks up, arrows move, Space drops, Escape puts back), and announces each
 * step ("Thread on pricing, position 2 of 5") through a live region.
 */

import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { DragDropVerticalIcon } from "@hugeicons/core-free-icons"
import {
  createChange,
  createReorder,
  createRovingFocus,
  definePrimitive,
  type ChangeDetails,
  type ReorderDraft,
  type ReorderMessage,
  type ReorderReason,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

import { FOCUS_RING } from "./control-styles"
import { useReducedMotion } from "./use-reduced-motion"

type ReorderState = {
  value: string[]
  focused: string | null
  moving: ReorderDraft | null
}

type ReorderOptions = {
  value?: string[]
  onValueChange?: (value: string[], details: ChangeDetails<ReorderReason>) => void
  /** The name each item is announced by. */
  labelOf?: (key: string) => string | undefined
  /** What a position means, said after "position 2 of 5" ("Tuesday 08:00"). */
  describePosition?: (position: number) => string | undefined
  disabled?: boolean
}

/**
 * ui-sdk's English messages (`reorderMessage`), with what the position
 * means added after it when the list knows: "Dropped Thread on pricing at
 * position 2 of 5, Tuesday 08:00." In a list where the slot carries the
 * day and time, the number alone does not say where the post now goes out.
 */
function kitMessage(
  { type, label: name, count, position, total }: ReorderMessage,
  describe: ReorderOptions["describePosition"],
) {
  const meaning = describe?.(position)
  const at = `position ${position} of ${total}${meaning ? `, ${meaning}` : ""}`
  const label = count > 1 ? `${count} items` : name
  if (type === "grab") return `Picked up ${label}, ${at}.`
  if (type === "move") return `${label}, ${at}.`
  if (type === "drop") return `Dropped ${label} at ${at}.`
  return `Moved ${label} back to ${at}.`
}

const reorderable = definePrimitive({
  name: "kit-reorderable",
  options: {
    value: "list",
    onValueChange: "callback",
    labelOf: "value",
    describePosition: "value",
    disabled: "boolean",
  },
  state: (options: ReorderOptions): ReorderState => ({
    value: options.value ?? [],
    focused: null,
    moving: null,
  }),
  sync: (options) => (options.value === undefined ? {} : { value: options.value }),
  api: (context) => {
    const change = createChange(context)
    return {
      roving: createRovingFocus<ReorderState, { value: string }>(context, {
        slot: "item",
        key: "focused",
      }),
      reorder: createReorder<ReorderState>(context, {
        slot: "item",
        key: "value",
        draft: "moving",
        label: (key) => context.options().labelOf?.(key),
        message: (message) => kitMessage(message, context.options().describePosition),
        disabled: () => Boolean(context.options().disabled),
        set: (value, details) => change("value", value, details),
      }),
    }
  },
  slots: (slot) => ({
    root: slot<object, { order: string[]; draft: ReorderDraft | null }>({
      state: (state, { api }) => ({ order: api.reorder.order(state), draft: state.moving }),
      attrs: () => ({
        role: "listbox",
        "aria-roledescription": "sortable list",
      }),
    }),
    item: slot<{ value: string }, { moving: boolean; dragging: boolean }>({
      props: { value: "string" },
      state: (state, { key, api }) => ({
        moving: api.reorder.moving(state, key),
        dragging: api.reorder.dragging(state, key),
      }),
      attrs: (state, part) => ({
        role: "option",
        "aria-roledescription": "sortable item",
        "aria-selected": String(state.moving?.key === part.key),
        tabindex: part.api.roving.tabIndex(state, part),
        "data-moving": part.api.reorder.moving(state, part.key) ? "" : undefined,
        "data-dragging": part.api.reorder.dragging(state, part.key) ? "" : undefined,
      }),
      on: {
        keydown: (event, { el, api, key }) =>
          api.reorder.keydown(event, key) || api.roving.keydown(event, el!),
      },
      bind: (el, part) => {
        const cleanups = [part.api.roving.bind(el, part), part.api.reorder.bind(el, part)]
        return () => cleanups.forEach((cleanup) => cleanup())
      },
    }),
    // Drag by the grip only, so the rest of the row still scrolls on touch.
    handle: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({ "aria-hidden": "true", style: "touch-action:none" }),
      on: {
        pointerdown: (event, { api, key }) => api.reorder.pointerdown(event, key),
      },
    }),
  }),
})

const parts = createParts(reorderable, { root: "ol", item: "li", handle: "span" })

export type ReorderableItemState = {
  /** 1-based, in the order shown now (moves with a drag). */
  position: number
  /** Picked up, by keyboard or pointer. */
  moving: boolean
}

export type ReorderableProps<T> = {
  items: readonly T[]
  /** A stable key per item: its id. */
  itemKey: (item: T) => string
  /** What a screen reader calls the item as it moves ("Thread on pricing"). */
  itemLabel: (item: T) => string
  /** The new order, once an item is dropped. Not called while it moves. */
  onReorder: (items: T[]) => void
  /** The row's content, beside the grip. */
  children: (item: T, state: ReorderableItemState) => React.ReactNode
  /** Names the list: "Lineup for this week". */
  "aria-label": string
  disabled?: boolean
  /**
   * The row whose detail is showing (a list and its detail, page.md). Drawn
   * in the selected grey, as a ListRow's `selected`, and announced with
   * `aria-current="true"`. Controlled: pair it with `onActiveChange`.
   */
  activeKey?: string | null
  /**
   * A row took focus: a click, or the arrow keys moving through the list.
   * Rows hold no controls (a button inside would fight the row for Space
   * and Enter), so focus is how a row is picked; the page shows its detail.
   */
  onActiveChange?: (key: string) => void
  /**
   * What a position means, when the slot carries it rather than the item
   * (in the Lineup a position is a day and a time). Added to every
   * announcement: "position 2 of 5, Tuesday 08:00". 1-based, like
   * `ReorderableItemState.position`.
   */
  describePosition?: (position: number) => string | undefined
}

/*
 * The shift: rows slide to their new slot instead of jumping (FLIP). After
 * each commit a row's layout top is compared with the last one; the row is
 * put back where it was with `translate` and played to zero. A step that lands
 * mid-slide starts from where the row is drawn now (the running animation's
 * current value), so fast arrows and a drag sweeping over rows retarget
 * rather than restart. Only `translate` moves: no layout is animated.
 *
 * The row a pointer holds is never animated: it follows the pointer 1:1. On
 * drop it settles from the pointer to its slot. Elements marked
 * `data-reorder-slot` (the position number, a day) belong to the slot, not
 * the row: they get the opposite translate on the same curve, so they stand
 * still while the row slides under them.
 */
type Shift = {
  tops: Map<string, number>
  running: Map<string, Animation[]>
  /** Rows settling from a pointer drop: their slot marks ride with them. */
  settling: Set<string>
}

const SLOT_MARK = "[data-reorder-slot]"

function rowsOf(list: HTMLElement) {
  return Array.from(list.children).filter(
    (el): el is HTMLElement => el instanceof HTMLElement && el.dataset.reorderKey !== undefined,
  )
}

function timing(list: HTMLElement): KeyframeAnimationOptions {
  const css = getComputedStyle(list)
  // The token may come back as "220ms" or, minified, ".22s".
  const raw = css.getPropertyValue("--kit-duration-shift").trim()
  const ms = (parseFloat(raw) || 0.22) * (raw.endsWith("ms") ? 1 : 1000)
  const easing = css.getPropertyValue("--ease-kit-out").trim() || "cubic-bezier(0.2, 0.8, 0.2, 1)"
  return { duration: ms, easing }
}

/** Where a running shift draws the row now, relative to its layout box. */
function drawnOffset(el: HTMLElement, running: Animation[] | undefined) {
  if (!running?.length || running[0].playState === "finished") return { x: 0, y: 0 }
  const [x = "0", y = "0"] = getComputedStyle(el).translate.split(" ")
  return { x: parseFloat(x) || 0, y: parseFloat(y) || 0 }
}

function stop(shift: Shift, key: string) {
  shift.running.get(key)?.forEach((a) => a.cancel())
  shift.running.delete(key)
}

function play(shift: Shift, list: HTMLElement, el: HTMLElement, key: string, x: number, y: number, marks: boolean) {
  stop(shift, key)
  if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5) {
    shift.settling.delete(key)
    return
  }
  const options = timing(list)
  const row = el.animate([{ translate: `${x}px ${y}px` }, { translate: "0px 0px" }], options)
  const all = [row]
  if (marks) {
    el.querySelectorAll<HTMLElement>(SLOT_MARK).forEach((mark) => {
      all.push(mark.animate([{ translate: `${-x}px ${-y}px` }, { translate: "0px 0px" }], options))
    })
  }
  shift.running.set(key, all)
  row.onfinish = () => {
    if (shift.running.get(key) === all) {
      shift.running.delete(key)
      shift.settling.delete(key)
    }
  }
}

function layoutShift(shift: Shift, list: HTMLElement, draft: ReorderDraft | null, reduced: boolean) {
  const seen = new Set<string>()
  for (const el of rowsOf(list)) {
    const key = el.dataset.reorderKey!
    seen.add(key)
    const top = el.offsetTop
    const before = shift.tops.get(key)
    shift.tops.set(key, top)

    if (reduced) {
      stop(shift, key)
      continue
    }
    const dy = before === undefined ? 0 : before - top
    const held = !!draft?.pointer && draft.keys.includes(key) && !shift.settling.has(key)
    if (held) {
      // Under the pointer: never animated. ui-sdk set --drag-y against the
      // old layout before this commit and corrects it a frame later; correct
      // it now, so the held row does not jump one row for a frame.
      stop(shift, key)
      if (dy !== 0) {
        const drag = parseFloat(el.style.getPropertyValue("--drag-y")) || 0
        el.style.setProperty("--drag-y", `${drag + dy}px`)
      }
      continue
    }
    // Same slot: let a running shift (or a drop settling) play on.
    if (dy === 0) continue
    const now = drawnOffset(el, shift.running.get(key))
    play(shift, list, el, key, now.x, now.y + dy, !shift.settling.has(key))
  }
  for (const key of Array.from(shift.tops.keys())) {
    if (!seen.has(key)) {
      shift.tops.delete(key)
      stop(shift, key)
    }
  }
}

/** Renders nothing; runs the shift after every commit of the list. */
function ShiftEffect({
  shift,
  list,
  draft,
}: {
  shift: Shift
  list: React.RefObject<HTMLOListElement | null>
  draft: ReorderDraft | null
}) {
  const reduced = useReducedMotion()
  React.useLayoutEffect(() => {
    if (list.current) layoutShift(shift, list.current, draft, reduced)
  })
  return null
}

const ROW =
  `relative flex min-h-11 w-full min-w-0 items-center gap-3 rounded-kit-control bg-kit-object py-2 pr-4 pl-1.5 text-kit-body text-kit-ink select-none ${FOCUS_RING} focus-visible:outline-offset-0 ` +
  "transition-[box-shadow,scale,background-color] duration-(--kit-duration-state) ease-kit-out motion-reduce:transition-none " +
  // z-10 stays inside the list: the root is `isolate`, so a lifted row rises
  // over its neighbours and never over a menu or the sidebar.
  // The row whose detail is showing: the selected grey, as ListRow.
  "data-active:bg-kit-selected " +
  "data-moving:z-10 data-moving:shadow-kit-lifted data-moving:scale-(--kit-lift-scale) motion-reduce:data-moving:scale-100 " +
  // While a pointer drags it, it stays under the pointer.
  "data-dragging:[translate:var(--drag-x,0px)_var(--drag-y,0px)] data-dragging:transition-[box-shadow]"

/**
 * An ordered list you rearrange: the week's lineup, a thread's posts. Drag
 * by the grip, or focus a row and press Space, the arrows, Space again;
 * Escape puts it back. Every step is announced. The picked-up row lifts
 * (`shadow-kit-lifted`). The active row (`activeKey`, the one whose detail
 * is open) takes the selected grey; nothing else changes colour.
 *
 * Rows sit flush in a List-like column with the 6px row inset, so their
 * 12px radius nests in an 18px object.
 */
export function Reorderable<T>({
  items,
  itemKey,
  itemLabel,
  onReorder,
  children,
  "aria-label": ariaLabel,
  disabled = false,
  activeKey = null,
  onActiveChange,
  describePosition,
}: ReorderableProps<T>) {
  const byKey = React.useMemo(() => new Map(items.map((it) => [itemKey(it), it])), [items, itemKey])
  const keys = React.useMemo(() => items.map(itemKey), [items, itemKey])
  const hintId = React.useId()
  const listRef = React.useRef<HTMLOListElement>(null)
  // Mutable bookkeeping, read and written only in effects and handlers.
  const [shift] = React.useState<Shift>(() => ({ tops: new Map(), running: new Map(), settling: new Set() }))

  // A pointer drop (or Escape mid-drag): ui-sdk clears --drag-x/y before the
  // drop commits, which would snap the row to its slot. Read the offset first,
  // in the capture phase, and settle the row from there.
  React.useEffect(() => {
    const settle = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== "Escape") return
      const list = listRef.current
      const el = list?.querySelector<HTMLElement>(":scope > [data-dragging]")
      const key = el?.dataset.reorderKey
      if (!list || !el || key === undefined) return
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
      const x = parseFloat(el.style.getPropertyValue("--drag-x")) || 0
      const y = parseFloat(el.style.getPropertyValue("--drag-y")) || 0
      shift.settling.add(key)
      play(shift, list, el, key, x, y, false)
    }
    const types = ["pointerup", "pointercancel", "keydown"] as const
    types.forEach((type) => window.addEventListener(type, settle, true))
    return () => types.forEach((type) => window.removeEventListener(type, settle, true))
  }, [shift])

  if (items.length === 0) {
    return (
      <p className="px-4 py-3 text-kit-ink-muted">Nothing to order yet.</p>
    )
  }

  return (
    <>
      <span id={hintId} className="sr-only">
        Press Space to pick up, arrow keys to move, Space to drop, Escape to cancel.
      </span>
      <parts.Root
        ref={listRef}
        aria-label={ariaLabel}
        aria-describedby={hintId}
        value={keys}
        disabled={disabled}
        describePosition={describePosition}
        // focusin bubbles, so one listener hears a click and the arrows.
        onFocus={(event: React.FocusEvent<HTMLOListElement>) => {
          if (!onActiveChange) return
          const row = (event.target as HTMLElement).closest<HTMLElement>("[data-reorder-key]")
          const key = row?.dataset.reorderKey
          if (key !== undefined && key !== activeKey) onActiveChange(key)
        }}
        labelOf={(key: string) => {
          const it = byKey.get(key)
          return it === undefined ? undefined : itemLabel(it)
        }}
        onValueChange={(next: string[]) => {
          onReorder(next.map((k) => byKey.get(k)).filter((it): it is T => it !== undefined))
        }}
        // `relative` makes the list each row's offsetParent, so the FLIP
        // reads `offsetTop` against the list and not against whatever
        // positioned ancestor the page happens to have (which moves on scroll
        // or on a banner above, and made the offsets drift).
        className={`relative isolate flex flex-col gap-0.5 ${disabled ? "opacity-50" : ""}`}
        data-slot="kit-reorderable"
      >
        {({ order, draft }: { order: string[]; draft: ReorderDraft | null }) => [
          ...order.map((key, index) => {
            const item = byKey.get(key)
            if (item === undefined) return null
            return (
              <parts.Item
                key={key}
                value={key}
                data-reorder-key={key}
                data-active={activeKey === key ? "" : undefined}
                aria-current={activeKey === key ? "true" : undefined}
                className={ROW}
              >
                {(state: { moving: boolean }) => (
                  <>
                    <parts.Handle
                      value={key}
                      className={
                        "relative grid h-8 w-6 shrink-0 place-items-center rounded-kit-chip text-kit-ink-muted " +
                        "transition-[color] duration-(--kit-duration-state) ease-kit-out motion-reduce:transition-none " +
                        (disabled ? "cursor-default " : "cursor-grab hover:text-kit-ink active:cursor-grabbing ") +
                        // 40 square to a mouse, 44 to a finger. Room on both sides:
                        // 6px to the row edge, 12 to the position number.
                        "after:absolute after:top-1/2 after:left-1/2 after:size-10 after:-translate-1/2 pointer-coarse:after:size-11"
                      }
                    >
                      <HugeiconsIcon icon={DragDropVerticalIcon} size={16} strokeWidth={2} aria-hidden />
                    </parts.Handle>
                    <span data-reorder-slot="" className="min-w-4 shrink-0 text-right font-kit-mono text-kit-mono text-kit-ink-muted tabular-nums">
                      {index + 1}
                    </span>
                    <span className="flex min-w-0 flex-1 items-center gap-3">
                      {children(item, { position: index + 1, moving: state.moving })}
                    </span>
                  </>
                )}
              </parts.Item>
            )
          }),
          <ShiftEffect key="\u0000shift" shift={shift} list={listRef} draft={draft} />,
        ]}
      </parts.Root>
    </>
  )
}

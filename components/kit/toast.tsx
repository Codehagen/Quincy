"use client"

import * as React from "react"
import { Toast as ToastPrimitive } from "@base-ui/react/toast"
import { Cancel01Icon } from "@hugeicons/core-free-icons"

import { Button } from "./button"
import { IconButton } from "./icon-button"
import { FLOATING_ELEVATION, PORTAL_TYPE } from "./overlay-styles"

/** A plain toast leaves after 5s; one with an action stays 10s. Both pause while pointed at or focused. */
const PLAIN_MS = 5000
const WITH_ACTION_MS = 10000

export type ToastAction = {
  /** One word or two: "Undo", "View", "Open draft". */
  label: string
  onClick: () => void
}

export type ToastOptions = {
  /** At most one, and never the only way to do it. */
  action?: ToastAction
}

type ToastData = { action?: ToastAction }

/**
 * Mount once, around the app frame (AppShell, the lab). It holds the one
 * place toasts appear: bottom centre, above the home indicator.
 *
 * One at a time (`limit` 1): a new toast replaces the last, as a second
 * removal replaces the UndoBar's sentence. They never stack.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <ToastPrimitive.Provider limit={1} timeout={PLAIN_MS}>
      {children}
      <ToastPrimitive.Portal>
        <ToastPrimitive.Viewport
          className={`fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 z-50 w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 outline-hidden ${PORTAL_TYPE}`}
        >
          <ToastList />
        </ToastPrimitive.Viewport>
      </ToastPrimitive.Portal>
    </ToastPrimitive.Provider>
  )
}

/**
 * `show("Scheduled for Thursday 07:45.")`, optionally with one action.
 * Returns the toast's id, for `close`.
 *
 * Toast or UndoBar? Both stay; they answer different questions:
 * - **UndoBar** — the thing was removed from where the person is looking.
 *   The Undo stands in its place, takes focus, and never times out. Every
 *   in-place removal uses it (docs/design/removing.md).
 * - **Toast** — the result lands somewhere the person is not looking: a
 *   dialog closed on Schedule, Quincy finished a draft in the background,
 *   a sheet was dismissed after saving. It does not take focus (F6 reaches
 *   it) and it leaves on its own, so nothing in it may be the only way to
 *   do something. An Undo in a toast is fine only when the item's own
 *   place is not on screen; otherwise it is an UndoBar.
 */
export function useToast() {
  const manager = ToastPrimitive.useToastManager()
  return React.useMemo(
    () => ({
      show(message: string, options: ToastOptions = {}) {
        return manager.add<ToastData>({
          description: message,
          timeout: options.action ? WITH_ACTION_MS : PLAIN_MS,
          data: { action: options.action },
        })
      },
      close(id: string) {
        manager.close(id)
      },
    }),
    [manager],
  )
}

// Transforms are written out so the swipe offset and the enter/exit offset
// compose in one property. Under reduced motion it fades in place.
const ROOT =
  `absolute inset-x-0 bottom-0 flex min-h-12 items-center gap-kit-controls rounded-kit-stage bg-kit-object py-kit-row-inset pr-kit-row-inset pl-kit-cta-md text-kit-ink ${FLOATING_ELEVATION} outline-hidden select-none ` +
  "[transform:translateX(var(--toast-swipe-movement-x))_translateY(var(--toast-swipe-movement-y))] " +
  "transition-[transform,opacity] duration-(--kit-duration-enter) ease-kit-out data-swiping:duration-0 " +
  "data-starting-style:opacity-0 data-starting-style:[transform:translateY(calc(100%+1rem))] " +
  "data-ending-style:opacity-0 data-ending-style:[transform:translateY(calc(100%+1rem))] " +
  "data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))] " +
  "data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+120%))] " +
  "data-ending-style:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-movement-x)-120%))] " +
  "data-limited:pointer-events-none data-limited:opacity-0 " +
  "motion-reduce:data-starting-style:[transform:none]! motion-reduce:data-ending-style:[transform:none]! " +
  "focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kit-focus"

function ToastList() {
  const { toasts, close } = ToastPrimitive.useToastManager()
  return toasts.map((toast) => {
    const action = (toast.data as ToastData | undefined)?.action
    return (
      <ToastPrimitive.Root
        key={toast.id}
        toast={toast}
        swipeDirection={["down", "left", "right"]}
        data-slot="kit-toast"
        className={ROOT}
      >
        {/* 48 tall at one line, so the 24 radius makes a pill and the 36px
            buttons inside sit 6px in: 18 = 24 − 6, concentric. Two lines
            keep the same corners. */}
        <ToastPrimitive.Description className="min-w-0 flex-1 py-kit-row-inset text-kit-body text-pretty" />
        {action ? (
          <Button
            onClick={() => {
              action.onClick()
              close(toast.id)
            }}
          >
            {action.label}
          </Button>
        ) : null}
        <ToastPrimitive.Close render={<IconButton icon={Cancel01Icon} aria-label="Dismiss" />} />
      </ToastPrimitive.Root>
    )
  })
}

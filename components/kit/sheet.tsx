"use client"

import * as React from "react"
import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer"
import { Cancel01Icon } from "@hugeicons/core-free-icons"

import { Button, type ButtonProps } from "./button"
import { ModalBody, ModalFoot, ModalHeader } from "./dialog"
import { IconButton } from "./icon-button"
import { MODAL_FOOTER, PORTAL_TYPE, SCRIM } from "./overlay-styles"

type Unstyled<P> = Omit<P, "className" | "style">

// Tailwind's `sm` (40rem). The layout reads it in CSS, so a sheet open on
// the first paint is already the right shape; only the swipe direction, which
// matters once a finger is on it, is read in JS after mount.
const WIDE = "(min-width: 40rem)"

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(WIDE)
  mq.addEventListener("change", onChange)
  return () => mq.removeEventListener("change", onChange)
}

/** From 40rem the sheet is a side panel; under it, a bottom sheet. */
function useWide() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(WIDE).matches,
    () => false,
  )
}

export type SheetProps = Omit<DrawerPrimitive.Root.Props, "swipeDirection" | "snapPoints">

/**
 * A task that needs room and keeps the page in view behind it: record a
 * thought, read a source, edit a rhythm. A side panel from 40rem, a bottom
 * sheet under it, and on both you can swipe it away (right, or down), on
 * Base UI's Drawer. Like the app shell's phone sidebar it is modal: a scrim,
 * focus trapped, Escape and the scrim close it, focus goes back to the
 * trigger.
 *
 * A short question is a Dialog; a sheet is for something you work in.
 */
export function Sheet(props: SheetProps) {
  const wide = useWide()
  return <DrawerPrimitive.Root {...props} swipeDirection={wide ? "right" : "down"} />
}

export type SheetTriggerProps = Omit<Unstyled<DrawerPrimitive.Trigger.Props>, "render"> & {
  /** The kit control that opens it: `render={<Button icon={Mic01Icon}>Record</Button>}`. */
  render: React.ReactElement
}

export function SheetTrigger(props: SheetTriggerProps) {
  return <DrawerPrimitive.Trigger {...props} />
}

export type SheetPanelProps = Pick<
  Unstyled<DrawerPrimitive.Popup.Props>,
  "initialFocus" | "finalFocus" | "id"
> & {
  title: string
  description?: React.ReactNode
  children?: React.ReactNode
  /** A SheetFooter. Stays at the foot while the body scrolls. */
  footer?: React.ReactNode
  closeLabel?: string
}

// Transforms are written out (not translate-*) so the swipe offset Base UI
// publishes and the enter/exit offset compose in one property. While a
// finger is on it nothing transitions; on release it settles in the enter
// duration. Reduced motion: no travel, a fade only. The swipe itself still
// follows the finger, because the person is moving it.
const POPUP =
  "fixed z-50 flex flex-col overflow-hidden bg-kit-object text-kit-ink shadow-kit-lifted outline-hidden " +
  "transition-[transform,opacity] duration-(--kit-duration-enter) ease-kit-out data-swiping:duration-0 data-swiping:select-none " +
  // Bottom sheet (a phone): edge to edge, the top corners round, the
  // home-indicator inset under the last line.
  "max-sm:inset-x-0 max-sm:bottom-0 max-sm:max-h-[calc(100dvh-3rem)] max-sm:rounded-t-kit-stage " +
  "max-sm:pb-[calc(var(--spacing-kit-pad)+env(safe-area-inset-bottom))] sm:pb-kit-pad-y " +
  "max-sm:[transform:translateY(var(--drawer-swipe-movement-y))] " +
  "max-sm:data-starting-style:[transform:translateY(100%)] max-sm:data-ending-style:[transform:translateY(100%)] " +
  // Side panel: a white object floating 8px off the right edge, 400 wide.
  "sm:inset-y-2 sm:right-2 sm:w-[min(25rem,calc(100vw-1rem))] sm:rounded-kit-stage " +
  "sm:[transform:translateX(var(--drawer-swipe-movement-x))] " +
  "sm:data-starting-style:[transform:translateX(calc(100%+0.5rem))] sm:data-ending-style:[transform:translateX(calc(100%+0.5rem))] " +
  "motion-reduce:data-starting-style:opacity-0 motion-reduce:data-ending-style:opacity-0 " +
  "motion-reduce:data-starting-style:[transform:none]! motion-reduce:data-ending-style:[transform:none]!"

/** The panel: header with its close button, a scrolling body, an optional footer. */
export function SheetPanel({
  title,
  description,
  children,
  footer,
  closeLabel = "Close",
  ...props
}: SheetPanelProps) {
  return (
    <DrawerPrimitive.Portal>
      <DrawerPrimitive.Backdrop
        // The scrim thins as the sheet is swiped away.
        className={`${SCRIM} opacity-[calc(1-var(--drawer-swipe-progress,0))] data-swiping:duration-0`}
      />
      <DrawerPrimitive.Viewport className={`fixed inset-0 z-50 ${PORTAL_TYPE}`}>
        <DrawerPrimitive.Popup
          {...props}
          data-slot="kit-sheet"
          className={POPUP}
        >
          {/* The grab handle, on a phone: a mark, not a control. Swipe and
              the close button do the work. */}
          <span aria-hidden className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-kit-track sm:hidden" />
          <DrawerPrimitive.Content className="flex min-h-0 flex-1 flex-col">
            <ModalHeader
              title={<DrawerPrimitive.Title className="text-kit-body font-kit-strong text-pretty">{title}</DrawerPrimitive.Title>}
              description={
                description != null ? (
                  <DrawerPrimitive.Description className="text-kit-body text-kit-ink-muted text-pretty">
                    {description}
                  </DrawerPrimitive.Description>
                ) : null
              }
              close={
                <DrawerPrimitive.Close
                  render={<IconButton icon={Cancel01Icon} aria-label={closeLabel} />}
                />
              }
            />
            {children != null ? <ModalBody>{children}</ModalBody> : null}
            {footer != null ? <ModalFoot>{footer}</ModalFoot> : null}
          </DrawerPrimitive.Content>
        </DrawerPrimitive.Popup>
      </DrawerPrimitive.Viewport>
    </DrawerPrimitive.Portal>
  )
}

/** The buttons at the sheet's foot, as DialogFooter. */
export function SheetFooter({ children }: { children: React.ReactNode }) {
  return <div className={MODAL_FOOTER}>{children}</div>
}

export type SheetCloseProps = Omit<ButtonProps, "render" | "nativeButton" | "variant">

/** A quiet Button that closes the sheet. */
export function SheetClose({ children, ...props }: SheetCloseProps) {
  return <DrawerPrimitive.Close render={<Button {...props}>{children}</Button>} />
}

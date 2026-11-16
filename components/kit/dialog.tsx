"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { Cancel01Icon } from "@hugeicons/core-free-icons"

import { Button, type ButtonProps } from "./button"
import { IconButton } from "./icon-button"
import {
  MODAL_FOOTER,
  MODAL_MOTION,
  MODAL_OBJECT,
  MODAL_PAD_BOTTOM,
  MODAL_PAD_X,
  PORTAL_TYPE,
  SCRIM,
} from "./overlay-styles"

type Unstyled<P> = Omit<P, "className" | "style">

export type DialogProps = DialogPrimitive.Root.Props

/**
 * Root. Holds open state: `open` + `onOpenChange`, or `defaultOpen`.
 *
 * A Dialog is a short task that has to be finished or abandoned before the
 * page goes on: schedule a post, adapt a draft, name a rhythm. A question
 * with no way back is an AlertDialog; a destructive action an Undo can take
 * back is a HoldButton or an UndoBar, never a Dialog (docs/design/removing.md).
 */
export function Dialog(props: DialogProps) {
  return <DialogPrimitive.Root {...props} />
}

export type DialogTriggerProps = Omit<Unstyled<DialogPrimitive.Trigger.Props>, "render"> & {
  /**
   * The kit control that opens it, Base UI's pattern (not asChild):
   * `<DialogTrigger render={<Button>Schedule</Button>} />`.
   */
  render: React.ReactElement
}

export function DialogTrigger(props: DialogTriggerProps) {
  return <DialogPrimitive.Trigger {...props} />
}

export type DialogPanelProps = Pick<
  Unstyled<DialogPrimitive.Popup.Props>,
  "initialFocus" | "finalFocus" | "id"
> & {
  /** The dialog's name, read when it opens. A short question or a verb: "Schedule this post". */
  title: string
  /** One sentence under the title, muted. Becomes the dialog's description. */
  description?: React.ReactNode
  /** The body: fields, a preview, a list. Scrolls when it outgrows the screen. */
  children?: React.ReactNode
  /** A DialogFooter. Stays put while the body scrolls. */
  footer?: React.ReactNode
  /** `md` (440) for a question or a field or two; `lg` (560) for a preview. */
  size?: "md" | "lg"
  /** The close button's name. Default "Close". */
  closeLabel?: string
}

const WIDTH = { md: "sm:max-w-110", lg: "sm:max-w-140" } as const

/**
 * The white object over the scrim, centred at every width. On a phone it
 * keeps a 16px gutter rather than becoming a bottom sheet: a dialog cannot
 * be swiped away, and a panel rising from the bottom edge promises that it
 * can. The bottom sheet is Sheet's, which can.
 *
 * Focus goes to the first field or button inside (Base UI), is trapped while
 * open, and returns to the trigger on close; pass `finalFocus` when the
 * trigger is gone by then. Escape, the scrim and the close button all close.
 */
export function DialogPanel({
  title,
  description,
  children,
  footer,
  size = "md",
  closeLabel = "Close",
  ...props
}: DialogPanelProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop className={SCRIM} />
      <DialogPrimitive.Viewport
        className={`fixed inset-0 z-50 grid place-items-center p-4 ${PORTAL_TYPE}`}
      >
        <DialogPrimitive.Popup
          {...props}
          data-slot="kit-dialog"
          className={`${MODAL_OBJECT} ${MODAL_MOTION} ${MODAL_PAD_BOTTOM} max-h-[calc(100dvh-2rem)] w-full ${WIDTH[size]}`}
        >
          <ModalHeader
            title={<DialogPrimitive.Title className="text-kit-body font-kit-strong text-pretty">{title}</DialogPrimitive.Title>}
            description={
              description != null ? (
                <DialogPrimitive.Description className="text-kit-body text-kit-ink-muted text-pretty">
                  {description}
                </DialogPrimitive.Description>
              ) : null
            }
            close={
              <DialogPrimitive.Close
                render={<IconButton icon={Cancel01Icon} aria-label={closeLabel} />}
              />
            }
          />
          {children != null ? <ModalBody>{children}</ModalBody> : null}
          {footer != null ? <ModalFoot>{footer}</ModalFoot> : null}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Viewport>
    </DialogPrimitive.Portal>
  )
}

/** The buttons at the foot: quiet ones first, the one action last. */
export function DialogFooter({ children }: { children: React.ReactNode }) {
  return <div className={MODAL_FOOTER}>{children}</div>
}

export type DialogCloseProps = Omit<ButtonProps, "render" | "nativeButton" | "variant"> & {
  /** Default `quiet`: closing is the way out, never the action. */
  variant?: "quiet"
}

/** A quiet Button that closes the dialog: "Cancel", "Not now". */
export function DialogClose({ children, ...props }: DialogCloseProps) {
  return <DialogPrimitive.Close render={<Button {...props}>{children}</Button>} />
}

/* ── Internal layout, shared with AlertDialog and Sheet ── */

export function ModalHeader({
  title,
  description,
  close,
}: {
  title: React.ReactNode
  description: React.ReactNode
  close?: React.ReactNode
}) {
  return (
    <div className={`flex shrink-0 items-start gap-kit-related ${MODAL_PAD_X} pt-kit-pad sm:pt-kit-pad-y`}>
      {/* The close button is pulled out by the same amount on both axes, so
          its icon sits square in the corner (14 off the edge on a phone,
          20 from 40rem). The text drops by that pull (kit-tight, 4), so a
          one-line title centres on the 36px button: its middle is 4 + 10
          down, the button's 18 − 4. */}
      <div className="flex min-w-0 flex-1 flex-col gap-kit-tight pt-kit-tight">
        {title}
        {description}
      </div>
      {close != null ? <div className="-mt-kit-tight -mr-kit-tight shrink-0 sm:-mr-2">{close}</div> : null}
    </div>
  )
}

export function ModalBody({ children }: { children: React.ReactNode }) {
  return (
    <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${MODAL_PAD_X} pt-kit-group`}>
      {children}
    </div>
  )
}

export function ModalFoot({ children }: { children: React.ReactNode }) {
  return <div className={`shrink-0 ${MODAL_PAD_X} pt-kit-group`}>{children}</div>
}

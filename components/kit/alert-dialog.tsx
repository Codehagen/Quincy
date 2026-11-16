"use client"

import * as React from "react"
import { AlertDialog as AlertPrimitive } from "@base-ui/react/alert-dialog"

import { Button, type ButtonProps } from "./button"
import { ModalHeader } from "./dialog"
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

export type AlertDialogProps = AlertPrimitive.Root.Props

/**
 * For a step that cannot be taken back, and only that: discard the last
 * version of a piece (the piece goes with it), publish now (a post cannot be
 * unsent), cancel the plan. It asks, in words, before anything happens.
 *
 * When to use what (docs/design/removing.md):
 * - An Undo can take it back → do it at once and show an UndoBar.
 * - It cannot be undone, but the person is already looking at the thing
 *   and the action is one press among others on it (disconnect a channel,
 *   dismiss a riff for good) → HoldButton. The hold IS the confirmation, so
 *   there is no second click to become a reflex.
 * - It cannot be undone and the consequence is not on screen (the whole
 *   piece goes, not only this version; a post goes out to 2,000 people) →
 *   AlertDialog, whose sentence says what the person cannot see.
 *
 * Unlike Dialog it has no close button and the scrim does not close it: it
 * wants an answer. Escape is still "Keep it", except while the action runs:
 * then nothing dismisses it until the step has settled.
 */
export function AlertDialog({ onOpenChange, ...props }: AlertDialogProps) {
  const [busy, setBusyState] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  // Read synchronously by onOpenChange: the Escape that lands in the same
  // tick as the press must already see the action as running.
  const busyRef = React.useRef(false)
  const errorId = React.useId()
  const state = React.useMemo<AlertState>(
    () => ({
      busy,
      setBusy: (next) => {
        busyRef.current = next
        setBusyState(next)
      },
      error,
      setError,
      errorId,
    }),
    [busy, error, errorId],
  )
  return (
    <AlertContext.Provider value={state}>
      <AlertPrimitive.Root
        {...props}
        onOpenChange={(open, details) => {
          // While the irreversible step runs, nothing dismisses the dialog:
          // "Keep it" would be a lie once the action has started.
          if (!open && busyRef.current) {
            details.cancel()
            return
          }
          if (!open) setError(null)
          onOpenChange?.(open, details)
        }}
      />
    </AlertContext.Provider>
  )
}

type AlertState = {
  busy: boolean
  setBusy: (busy: boolean) => void
  error: string | null
  setError: (error: string | null) => void
  errorId: string
}

const AlertContext = React.createContext<AlertState | null>(null)

function useAlertState() {
  const state = React.useContext(AlertContext)
  if (!state) throw new Error("AlertDialog parts must sit inside <AlertDialog>.")
  return state
}

export type AlertDialogTriggerProps = Omit<Unstyled<AlertPrimitive.Trigger.Props>, "render"> & {
  /** The kit control that opens it: `render={<Button variant="danger">Discard</Button>}`. */
  render: React.ReactElement
}

export function AlertDialogTrigger(props: AlertDialogTriggerProps) {
  return <AlertPrimitive.Trigger {...props} />
}

export type AlertDialogPanelProps = Pick<
  Unstyled<AlertPrimitive.Popup.Props>,
  "finalFocus" | "id"
> & {
  /** The question: "Discard “Shipped the export”?". */
  title: string
  /**
   * What happens that the person cannot see from here, and that it cannot
   * be brought back. Required: an alert without its sentence is a reflex.
   */
  description: React.ReactNode
  /** An AlertDialogCancel and an AlertDialogAction, in that order. */
  children: React.ReactNode
}

/**
 * The same white object as Dialog, 400 wide. Focus starts on Cancel, so
 * Enter on a reflex keeps the thing; the action is one deliberate Tab away.
 */
export function AlertDialogPanel({ title, description, children, ...props }: AlertDialogPanelProps) {
  const popupRef = React.useRef<HTMLDivElement>(null)
  const { error, errorId } = useAlertState()
  return (
    <AlertPrimitive.Portal>
      <AlertPrimitive.Backdrop className={SCRIM} />
      <AlertPrimitive.Viewport className={`fixed inset-0 z-50 grid place-items-center p-4 ${PORTAL_TYPE}`}>
        <AlertPrimitive.Popup
          {...props}
          ref={popupRef}
          initialFocus={() =>
            popupRef.current?.querySelector<HTMLElement>('[data-kit-alert="cancel"]') ?? true
          }
          data-slot="kit-alert-dialog"
          className={`${MODAL_OBJECT} ${MODAL_MOTION} ${MODAL_PAD_BOTTOM} max-h-[calc(100dvh-2rem)] w-full sm:max-w-100`}
        >
          <ModalHeader
            title={<AlertPrimitive.Title className="text-kit-body font-kit-strong text-pretty">{title}</AlertPrimitive.Title>}
            description={
              <AlertPrimitive.Description className="text-kit-body text-kit-ink-muted text-pretty">
                {description}
              </AlertPrimitive.Description>
            }
          />
          <div className={`flex shrink-0 flex-col gap-kit-tight ${MODAL_PAD_X} pt-kit-group`}>
            {/* Beside the action it belongs to: above it, at the same edge. */}
            {error ? (
              <p id={errorId} role="alert" className="text-kit-small text-kit-danger text-pretty sm:text-right">
                {error}
              </p>
            ) : null}
            <div className={MODAL_FOOTER}>{children}</div>
          </div>
        </AlertPrimitive.Popup>
      </AlertPrimitive.Viewport>
    </AlertPrimitive.Portal>
  )
}

export type AlertDialogCancelProps = Omit<ButtonProps, "render" | "nativeButton" | "variant">

/**
 * The way out, quiet, and where focus starts: "Keep it". Disabled while the
 * action runs: once the step has started, keeping the thing is not on offer.
 */
export function AlertDialogCancel({ children, disabled, ...props }: AlertDialogCancelProps) {
  const { busy } = useAlertState()
  return (
    <AlertPrimitive.Close
      data-kit-alert="cancel"
      disabled={disabled || busy}
      render={<Button {...props} disabled={disabled || busy}>{children}</Button>}
    />
  )
}

export type AlertDialogActionProps = Omit<ButtonProps, "render" | "nativeButton" | "variant" | "onClick"> & {
  /**
   * `danger` (default) when something is lost; `action` when nothing is lost
   * but nothing can be taken back either ("Publish now").
   */
  variant?: "danger" | "action"
  /**
   * Runs, then the dialog closes. May be async: the button shows
   * `pendingLabel` meanwhile, and Cancel, Escape and the scrim do nothing
   * until it settles. A throw keeps it open with the error's message beside
   * the action (or `errorMessage`), so the person can retry or keep the thing.
   */
  onConfirm: () => void | Promise<void>
  /** Shown when `onConfirm` throws without a message of its own. */
  errorMessage?: string
}

/** The irreversible step, named with its verb ("Discard", "Publish now"). */
export function AlertDialogAction({
  children,
  variant = "danger",
  onConfirm,
  errorMessage = "That didn’t go through. Try again.",
  ...props
}: AlertDialogActionProps) {
  const { busy, setBusy, error, setError, errorId } = useAlertState()
  const closeRef = React.useRef<HTMLButtonElement>(null)
  return (
    <>
      <Button
        {...props}
        variant={variant}
        pending={busy || props.pending}
        aria-describedby={error ? errorId : props["aria-describedby"]}
        onClick={async () => {
          if (busy) return
          setError(null)
          setBusy(true)
          try {
            await onConfirm()
          } catch (err) {
            // Stay open: the person can retry or keep it.
            setBusy(false)
            const message = err instanceof Error && err.message.trim() !== "" ? err.message : errorMessage
            setError(message)
            return
          }
          // Released before the close, so the guard in AlertDialog lets it through.
          setBusy(false)
          closeRef.current?.click()
        }}
      >
        {children}
      </Button>
      {/* Closing through Base UI's own Close keeps its focus return and
          close reason; it is hidden and never tabbed to. */}
      <AlertPrimitive.Close ref={closeRef} hidden tabIndex={-1} aria-hidden />
    </>
  )
}

"use client"

import * as React from "react"

import { BUTTON_BASE, BUTTON_SIZE, BUTTON_VARIANT, type ButtonSize } from "./control-styles"
import { useOneAction } from "./use-one-action"
import { PendingAnnouncer, StableLabel } from "./stable-label"

export type ButtonAnchorVariant = "action" | "quiet"

export type ButtonAnchorProps = Omit<
  React.ComponentPropsWithRef<"a">,
  "className" | "style" | "children" | "role"
> & {
  href: string
  children: string
  variant?: ButtonAnchorVariant
  size?: ButtonSize
  /**
   * What the label says once the click has gone through and the page is on
   * its way out ("Opening LinkedIn…"). The label reserves the wider of the
   * two, so nothing beside it moves.
   */
  pendingLabel?: string
}

/**
 * The Button look on a plain `<a>`, for a link that leaves the app: an OAuth
 * consent flow, a route handler that redirects off this origin. ButtonLink is
 * next/link, which would try a client-side navigation (and a prefetch) to a
 * route that is not a page.
 *
 * The click is never prevented; the pending label is presentational, so a
 * button that stays idle through the round trip does not read as a click that
 * missed. A modified click (⌘, Ctrl, Shift, Alt, middle button) opens a tab
 * and leaves this page where it is, so it does not go pending; nor does a
 * `target="_blank"` link, for the same reason.
 *
 * `leaving` resets when the page comes back: from the back/forward cache
 * (`pageshow` with `persisted`), or when the tab is shown again after a
 * navigation that never unloaded it (a download, an external protocol).
 * Otherwise the button would sit on "Opening LinkedIn…" for good.
 */
export function ButtonAnchor({
  children,
  variant = "quiet",
  size = "md",
  pendingLabel,
  onClick,
  ...props
}: ButtonAnchorProps) {
  const one = useOneAction(variant === "action")
  const [leaving, setLeaving] = React.useState(false)
  const labels = pendingLabel ? [children, pendingLabel] : [children]

  React.useEffect(() => {
    if (!leaving) return
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) setLeaving(false)
    }
    function onVisibility() {
      if (document.visibilityState === "visible") setLeaving(false)
    }
    window.addEventListener("pageshow", onPageShow)
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      window.removeEventListener("pageshow", onPageShow)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [leaving])

  return (
    <>
      <a
        {...props}
        {...one}
        data-slot="kit-button-anchor"
        data-variant={variant}
        aria-busy={leaving || undefined}
        onClick={(event) => {
          onClick?.(event)
          if (
            event.defaultPrevented ||
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey ||
            props.target === "_blank"
          ) {
            return
          }
          setLeaving(true)
        }}
        className={`${BUTTON_BASE} ${BUTTON_SIZE[size]} ${BUTTON_VARIANT[variant]}`}
      >
        <StableLabel current={leaving && pendingLabel ? 1 : 0} labels={labels} />
      </a>
      {pendingLabel ? <PendingAnnouncer message={leaving ? pendingLabel : null} /> : null}
    </>
  )
}

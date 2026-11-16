"use client"

import * as React from "react"

import { devWarn } from "./dev-warn"

/**
 * Development only: warn once when a second `action` is on screen in the
 * same view (docs/design/actions.md). The view is the KitPage, else the
 * Stage, else the Card. Content the person cannot see or reach does not
 * count: inside a closed Arrive (`inert`), inside a `hidden` element (a
 * keepMounted TabPanel that is not the open tab), or not rendered at all
 * (`display: none`). So an Approve that swaps for its Undo is fine, and so
 * is a submit in a tab that is not open.
 *
 * Returns the attributes to spread on the control. It finds itself by a
 * `useId` attribute rather than a ref, so callers keep their own `ref`.
 */
export function useOneAction(isAction: boolean) {
  const id = React.useId()
  React.useEffect(() => {
    if (process.env.NODE_ENV === "production" || !isAction) return
    const el = document.querySelector(`[data-kit-one="${CSS.escape(id)}"]`)
    if (!el) return
    const view =
      el.closest('[data-slot="kit-page"]') ??
      el.closest('[data-slot="kit-stage"]') ??
      el.closest('[data-slot="kit-card"]')
    if (!view) return
    const live = [...view.querySelectorAll('[data-kit-action="true"]')].filter(
      (b) =>
        !b.closest("[inert],[hidden]") &&
        // display:none from a class or a stylesheet, which `hidden` misses.
        (typeof b.checkVisibility !== "function" || b.checkVisibility()),
    )
    if (live.length > 1) {
      devWarn(
        "one-action",
        `${live.length} action buttons are on screen in one ${view.getAttribute("data-slot")?.replace("kit-", "")}. One action per view: make the others quiet (docs/design/actions.md).`,
      )
    }
  }, [id, isAction])
  return { "data-kit-one": id, "data-kit-action": isAction ? "true" : undefined } as const
}

"use client"

import * as React from "react"

import { cancelPlan, keepPlan } from "@/app/(app)/settings/billing/actions"
import { Button, HoldButton, Rule, Text } from "@/components/kit"

/**
 * The bottom of the billing card for an active plan: a hold to cancel, or,
 * once cancelled, a plain button to keep the plan.
 *
 * One component for both, rendered in the same place, so it stays mounted
 * when the action's revalidation swaps `ending`. That is what lets focus move
 * from the hold (which has gone) to the button that replaced it, instead of
 * dropping onto the page.
 */
export function PlanCancel({
  ending,
  endsOn,
}: {
  /** cancelAtPeriodEnd, from the server's snapshot. */
  ending: boolean
  /** The period end, formatted in the person's zone by the page. */
  endsOn?: string
}) {
  const [error, setError] = React.useState<string | null>(null)
  const [keeping, setKeeping] = React.useState(false)
  const swapped = React.useRef(false)
  const controlRef = React.useRef<HTMLDivElement>(null)
  const describedBy = React.useId()

  // After a change the server renders the other control. Focus goes to it,
  // and the muted line under it (a live region) says what changed.
  React.useEffect(() => {
    if (!swapped.current) return
    swapped.current = false
    controlRef.current?.querySelector("button")?.focus()
  }, [ending])

  // `swapped` is set before the call, not after: the revalidated render can
  // commit before the awaited result comes back, and the effect has to see it.
  async function cancel() {
    setError(null)
    swapped.current = true
    const result = await cancelPlan()
    if (!result.ok) {
      swapped.current = false
      setError(result.message)
      // A throw returns the hold to idle, so it can be held again.
      throw new Error(result.message)
    }
  }

  async function keep() {
    setError(null)
    setKeeping(true)
    swapped.current = true
    const result = await keepPlan()
    // Released either way: on success the button is about to go, and it must
    // not come back pending if the plan is cancelled again later.
    setKeeping(false)
    if (!result.ok) {
      swapped.current = false
      setError(result.message)
    }
  }

  return (
    <>
      <Rule />
      <div className="flex flex-col items-start gap-kit-related">
        <Text tone="muted" id={describedBy} role="status">
          <span className="text-pretty">
            {ending
              ? `Keep the plan and it renews ${endsOn ? `on ${endsOn}` : "at the end of the period"} as before.`
              : `Cancel and the plan stays on until ${endsOn ?? "the end of the period"}, then stops. Nothing is refunded for the period already paid, and your brain, drafts and conversations stay.`}
          </span>
        </Text>
        <div ref={controlRef}>
          {ending ? (
            <Button type="button" onClick={keep} pending={keeping} pendingLabel="Keeping the plan…">
              Keep my plan
            </Button>
          ) : (
            <HoldButton
              onConfirm={cancel}
              pendingLabel="Cancelling…"
              doneLabel="Cancelled"
              aria-describedby={describedBy}
            >
              Cancel subscription
            </HoldButton>
          )}
        </div>
        {/* A refusal, not destruction (states.md): ink, no red, announced. */}
        {error ? <Text role="status">{error}</Text> : null}
      </div>
    </>
  )
}

"use client"

import * as React from "react"

import { Button } from "@/components/kit"

/**
 * A demo that plays once holds its ending; Replay remounts it at the story
 * boundary (Stageshow kit.md, "Explicit replay"). The click is the cause of
 * the return to the opening frame, so the reset never needs one of its own.
 */
export function Replay({
  label,
  children,
}: {
  /** What is replayed, for the button's accessible name. */
  label: string
  children: React.ReactNode
}) {
  const [run, setRun] = React.useState(0)
  return (
    <div className="flex flex-col gap-3">
      <React.Fragment key={run}>{children}</React.Fragment>
      <div className="flex justify-end">
        <Button aria-label={`Replay the ${label}`} onClick={() => setRun((n) => n + 1)}>
          Replay
        </Button>
      </div>
    </div>
  )
}

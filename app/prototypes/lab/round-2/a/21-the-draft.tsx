"use client"

import * as React from "react"
import { Tick02Icon } from "@hugeicons/core-free-icons"

import {
  ActionButton,
  Arrive,
  Avatar,
  BeatBracket,
  Beats,
  Card,
  Mono,
  QuietButton,
  Rule,
  Stage,
  Text,
  u,
} from "../kit"

/**
 * The draft as it sits in Studio: three beats in the blue pen, the number on
 * its own line, against the person's own median. Approve swaps the actions
 * for the slot it goes into; Undo swaps them back (a transition, so it
 * retargets mid-way).
 */
export default function TheDraft() {
  const [approved, setApproved] = React.useState(false)
  const approveRef = React.useRef<HTMLButtonElement>(null)
  const undoRef = React.useRef<HTMLButtonElement>(null)
  const moved = React.useRef(false)

  // The pressed button goes inert, so focus follows to its counterpart.
  React.useEffect(() => {
    if (!moved.current) return
    ;(approved ? undoRef : approveRef).current?.focus()
  }, [approved])

  const toggle = (next: boolean) => {
    moved.current = true
    setApproved(next)
  }

  return (
    <Stage
      lead="Every draft reads in three beats."
      rest="Nothing goes out in your name until you approve it."
    >
      <Card width={330}>
        <div style={{ display: "flex", alignItems: "center", gap: u(10), marginBottom: u(14) }}>
          <Avatar initials="C" />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <Text weight="strong" as="span">
              Draft for X
            </Text>
            <Mono>onboarding-email.md · 186 chars</Mono>
          </div>
        </div>

        <Beats>
          <div style={{ display: "flex", flexDirection: "column", gap: u(12) }}>
            <BeatBracket beat="did">
              <Text>I cut our onboarding email down to one question.</Text>
            </BeatBracket>
            <BeatBracket beat="happened">
              <Text>Replies in the first week:</Text>
              <Text size="figure">31</Text>
              <Text size="small" tone="muted">
                Your median is 6.
              </Text>
            </BeatBracket>
            <BeatBracket beat="meant">
              <Text>People answer a question. They skip a brochure.</Text>
            </BeatBracket>
          </div>
        </Beats>

        <Rule />

        <Arrive show={!approved}>
          <div style={{ display: "flex", gap: u(6) }}>
            <ActionButton ref={approveRef} icon={Tick02Icon} onClick={() => toggle(true)}>
              Approve
            </ActionButton>
            <QuietButton>Edit</QuietButton>
          </div>
        </Arrive>
        <Arrive show={approved} from="below">
          <div
            role="status"
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: u(34) }}
          >
            <Text as="span">
              Goes out <Mono tone="ink">Thu 07:45</Mono>
            </Text>
            <QuietButton ref={undoRef} onClick={() => toggle(false)}>
              Undo
            </QuietButton>
          </div>
        </Arrive>
      </Card>
    </Stage>
  )
}

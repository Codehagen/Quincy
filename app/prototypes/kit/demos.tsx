"use client"

import * as React from "react"
import { Tick02Icon } from "@hugeicons/core-free-icons"

import {
  Arrive,
  BeatBracket,
  Beats,
  Button,
  Card,
  Count,
  Highlight,
  MarginNote,
  Mono,
  Muted,
  Rule,
  Segmented,
  Text,
} from "@/components/kit"

/**
 * Approve swaps for the slot it goes into, and Undo swaps it back. Arrive is
 * a transition, so pressing Undo mid-way retargets instead of restarting.
 * The pressed button goes inert, so focus moves to its counterpart.
 */
function useApproveSwap() {
  const [approved, setApproved] = React.useState(false)
  const approveRef = React.useRef<HTMLButtonElement>(null)
  const undoRef = React.useRef<HTMLButtonElement>(null)
  const moved = React.useRef(false)

  React.useEffect(() => {
    if (!moved.current) return
    ;(approved ? undoRef : approveRef).current?.focus()
  }, [approved])

  const set = (next: boolean) => {
    moved.current = true
    setApproved(next)
  }
  return { approved, set, approveRef, undoRef }
}

function ApproveRow() {
  const { approved, set, approveRef, undoRef } = useApproveSwap()
  return (
    <>
      <Arrive show={!approved}>
        <div className="flex gap-1.5">
          <Button
            ref={approveRef}
            variant="action"
            icon={Tick02Icon}
            onClick={() => set(true)}
          >
            Approve
          </Button>
          <Button>Edit</Button>
        </div>
      </Arrive>
      <Arrive show={approved} from="below">
        <div
          role="status"
          className="flex min-h-kit-control-md items-center justify-between gap-3"
        >
          <Text as="span">
            Goes out <Mono tone="ink">Thu 07:45</Mono>
          </Text>
          <Button ref={undoRef} onClick={() => set(false)}>
            Undo
          </Button>
        </div>
      </Arrive>
    </>
  )
}

/** Lab 21, on the kit: the draft in Studio, three beats in the blue pen. */
export function TheDraft() {
  return (
    <Card width="with-margin">
      <div className="mb-3.5 flex flex-col">
        <Text as="span" weight="strong">
          Draft for X
        </Text>
        <Mono>onboarding-email.md · 186 chars</Mono>
      </div>
      <Beats>
        <div className="flex flex-col gap-3">
          <BeatBracket beat="did">
            <Text>I cut our onboarding email down to one question.</Text>
          </BeatBracket>
          <BeatBracket beat="happened">
            <Text>Replies in the first week:</Text>
            <Text variant="figure">31</Text>
            <Text variant="small" tone="muted">
              Your median is 6.
            </Text>
          </BeatBracket>
          <BeatBracket beat="meant">
            <Text>People answer a question. They skip a brochure.</Text>
          </BeatBracket>
        </div>
      </Beats>
      <Rule />
      <ApproveRow />
    </Card>
  )
}

/** The swap on its own, for the motion section. */
export function ApproveSwap() {
  return (
    <Card>
      <div className="mb-3 flex flex-col">
        <Text as="span" weight="strong">
          The call that changed our pricing page
        </Text>
        <Mono>Thursday · LinkedIn</Mono>
      </div>
      <ApproveRow />
    </Card>
  )
}

type Hour = "07:45" | "12:30" | "17:00"

const HOURS: Record<Hour, { posts: number; median: number; say: string; note: string }> = {
  "07:45": { posts: 9, median: 1700, say: "That is 1.4× your usual week.", note: "read before standup. your best hour" },
  "12:30": { posts: 6, median: 1260, say: "About what you usually get.", note: "fine. the lunch scroll is crowded" },
  "17:00": { posts: 4, median: 710, say: "A little over half your usual.", note: "they've gone home. I wouldn't" },
}

const HOUR_OPTIONS = (Object.keys(HOURS) as Hour[]).map((h) => ({ value: h, label: h }))

/**
 * Lab 28 on the kit: pick another hour and the number counts to what you
 * actually get there, and Quincy's margin note changes its mind with it.
 */
export function WhyThisHour() {
  const [hour, setHour] = React.useState<Hour>("07:45")
  const h = HOURS[hour]
  return (
    <Card width="with-margin">
      <div className="flex items-baseline gap-2">
        <Text as="span" weight="strong">
          Thursday
        </Text>
        <Mono>Nov 19 · LinkedIn</Mono>
      </div>
      <Rule />
      <div className="flex flex-wrap items-center gap-2.5">
        <Text as="span" tone="muted">
          Goes out at
        </Text>
        <Segmented aria-label="Hour" options={HOUR_OPTIONS} value={hour} onValueChange={setHour} />
      </div>
      <div className="mt-3.5 flex flex-col gap-1">
        <Text tone="muted">
          Your last {h.posts} LinkedIn posts at {hour}:
        </Text>
        <MarginNote note={h.note} timing="after-highlight">
          <Text variant="figure">
            <Count value={h.median} /> views
          </Text>
        </MarginNote>
        <div aria-live="polite">
          <Text>
            <Highlight>{h.say}</Highlight> <Muted>1,210 is your median.</Muted>
          </Text>
        </div>
      </div>
    </Card>
  )
}

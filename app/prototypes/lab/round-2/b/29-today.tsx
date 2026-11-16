"use client"

import * as React from "react"
import { Tick02Icon } from "@hugeicons/core-free-icons"

import {
  ActionButton,
  Arrive,
  Card,
  MarginNote,
  Mono,
  QuietButton,
  Stage,
  Text,
  u,
} from "../kit"
import { color } from "../tokens"

/**
 * 29 — Today. What Quincy has ready for you this morning, in the order it
 * matters. Only the top item is open, with its one action; clearing it folds
 * it away and the next rises into its place. The margin note is Quincy's
 * reason for the order, and it moves on with the list.
 */

const ITEMS = [
  {
    title: "Approve the changelog post",
    detail: "It goes out at 09:00. I tightened the first line; the rest is yours.",
    action: "Approve",
    note: "first. it can't wait",
  },
  {
    title: "Six people replied to Friday's post",
    detail: "I drafted an answer to each. You send them.",
    action: "Read the replies",
    note: "two of them are new to you",
  },
  {
    title: "A riff from Thursday's call",
    detail: "“We priced for the buyer we wanted, not the one we had.”",
    action: "Read the riff",
    note: "this one's for next week",
  },
] as const

export default function Today() {
  const [done, setDone] = React.useState(0)
  const all = done >= ITEMS.length
  const current = ITEMS[done]
  const actionRef = React.useRef<HTMLButtonElement>(null)
  const againRef = React.useRef<HTMLButtonElement>(null)

  const first = React.useRef(true)
  React.useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    // Wait for the next item to open before moving focus onto its action.
    const t = window.setTimeout(() => {
      ;(all ? againRef : actionRef).current?.focus({ preventScroll: true })
    }, 40)
    return () => window.clearTimeout(t)
  }, [done, all])

  return (
    <Stage
      lead="Your morning, in order."
      rest="Quincy lines it up overnight. You clear it before your first meeting."
    >
      <Card width={330}>
        <MarginNote note={current ? current.note : "that's everything"}>
          <div style={{ display: "flex", alignItems: "baseline", gap: u(8) }}>
            <Text as="span" weight="strong">
              Monday
            </Text>
            <Mono>08:08</Mono>
            <span style={{ marginLeft: "auto" }} aria-live="polite">
              <Mono>{all ? "all clear" : `${ITEMS.length - done} for you`}</Mono>
            </span>
          </div>
        </MarginNote>

        <ol style={{ listStyle: "none", margin: `${u(10)} 0 0`, padding: 0 }}>
          {ITEMS.map((item, i) => {
            const open = i === done
            return (
              <li key={item.title}>
                <Arrive show={i >= done}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: `${u(20)} 1fr`,
                      padding: `${u(10)} 0`,
                      borderTop: `1px solid ${color.hairline}`,
                    }}
                  >
                    <Mono tone={open ? "ink" : "faint"}>{i + 1}</Mono>
                    <div>
                      <Text weight={open ? "strong" : "regular"} tone={open ? "ink" : "muted"}>
                        {item.title}
                      </Text>
                      <Arrive show={open}>
                        <div style={{ paddingTop: u(4) }}>
                          <Text tone="muted">{item.detail}</Text>
                          <div style={{ display: "flex", gap: u(4), marginTop: u(12) }}>
                            <ActionButton
                              ref={open ? actionRef : undefined}
                              icon={i === 0 ? Tick02Icon : undefined}
                              onClick={() => setDone(i + 1)}
                            >
                              {item.action}
                            </ActionButton>
                            <QuietButton onClick={() => setDone(i + 1)}>Later</QuietButton>
                          </div>
                        </div>
                      </Arrive>
                    </div>
                  </div>
                </Arrive>
              </li>
            )
          })}
        </ol>

        <Arrive show={all} from="below">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: u(8),
              paddingTop: u(10),
              borderTop: `1px solid ${color.hairline}`,
            }}
          >
            <Text as="span" tone="muted">
              Next post goes out Wed 09:00.
            </Text>
            <span style={{ marginLeft: "auto" }}>
              <QuietButton ref={againRef} onClick={() => setDone(0)}>
                Start over
              </QuietButton>
            </span>
          </div>
        </Arrive>
      </Card>
    </Stage>
  )
}

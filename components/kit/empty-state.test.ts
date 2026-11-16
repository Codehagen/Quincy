import * as React from "react"
import { describe, expect, it } from "vitest"

import { Friend } from "@/components/mascot/friend"

import { EmptyState, emptyStateMedia } from "./empty-state"

/**
 * Not rendered: vitest runs `environment: "node"` and this repo has no DOM
 * test setup. EmptyState has no hooks, so calling it returns the element
 * tree, and the tree is searched for the Friend.
 *
 * The rule: every EmptyState on an app page shows the friend above the
 * words (docs/design/quincy-chat.md, "EmptyState").
 */

type Props = { children?: React.ReactNode; state?: string; size?: number }

function findFriends(node: React.ReactNode): React.ReactElement<Props>[] {
  if (!React.isValidElement<Props>(node)) {
    return Array.isArray(node) ? node.flatMap(findFriends) : []
  }
  const here = node.type === Friend ? [node] : []
  return [...here, ...React.Children.toArray(node.props.children).flatMap(findFriends)]
}

describe("emptyStateMedia", () => {
  it("is the idle friend at 40 when nothing is passed", () => {
    const media = emptyStateMedia(undefined)
    expect(React.isValidElement(media)).toBe(true)
    const el = media as React.ReactElement<Props>
    expect(el.type).toBe(Friend)
    expect(el.props.state).toBe("idle")
    expect(el.props.size).toBe(40)
  })

  it("is nothing when null is passed on purpose", () => {
    expect(emptyStateMedia(null)).toBeNull()
  })

  it("keeps what the caller passed", () => {
    const own = React.createElement(Friend, { size: 40, state: "resting" })
    expect(emptyStateMedia(own)).toBe(own)
  })
})

describe("EmptyState", () => {
  it("shows the friend by default, framed or not", () => {
    for (const frame of ["card", "none"] as const) {
      const tree = EmptyState({ bold: "Nothing planned for this week.", frame })
      expect(findFriends(tree)).toHaveLength(1)
    }
  })

  it("shows no friend with media={null}", () => {
    const tree = EmptyState({ bold: "Nothing planned for this week.", media: null })
    expect(findFriends(tree)).toHaveLength(0)
  })
})

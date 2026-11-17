import { describe, expect, it } from "vitest"

import type { Draft, Version } from "@/lib/drafts"

import { NO_FILTERS, buildRows, matches, optionsFor } from "./draft-rows"

function version(id: string, extra: Partial<Version> = {}): Version {
  return { id, channel: "x", label: "X", text: `Opening of ${id}\n\nMore.`, state: "writing", goingOut: null, hasSlot: true, sent: null, ...extra }
}

function draft(id: string, versions: Version[], adapted = false): Draft {
  return {
    id,
    idea: `Idea ${id}`,
    from: {
      riffHook: "",
      sourceId: adapted ? "x" : "github",
      sourceLabel: adapted ? "Saved post" : "GitHub",
      at: "Today",
      adaptedFrom: adapted ? { url: `https://x.com/h/status/${id}`, handle: "h" } : null,
    },
    versions,
  }
}

// getDrafts reads oldest first.
const DRAFTS = [
  draft("old", [version("v1")], true),
  draft("sent", [version("v2", { state: "approved", sent: { state: "published", url: null, at: "Mon 08:00" } })]),
  draft("new", [version("v3"), version("v4", { channel: "linkedin", label: "LinkedIn" })]),
  draft("stuck", [version("v5", { state: "approved", hasSlot: false })]),
]

describe("buildRows", () => {
  it("puts waiting first, newest first inside the group, then the decided groups", () => {
    expect(buildRows(DRAFTS).map((r) => [r.id, r.bucket])).toEqual([
      ["new", "waiting"],
      ["old", "waiting"],
      ["stuck", "no-time"],
      ["sent", "sent"],
    ])
  })

  it("titles the row with the opening as edited", () => {
    const [row] = buildRows(DRAFTS, { edits: { v3: "\nA new first line\nrest" } })
    expect(row!.opening).toBe("A new first line")
  })

  it("reads what this page's own approval returned", () => {
    const rows = buildRows(DRAFTS, {
      session: (v) => (v.id === "v1" ? { placement: { scheduled: false, reason: "slots-full" } } : {}),
    })
    expect(rows.find((r) => r.id === "old")?.bucket).toBe("no-time")
  })
})

describe("filters", () => {
  const rows = buildRows(DRAFTS)

  it("counts each option against the other filters", () => {
    const from = optionsFor(rows, { ...NO_FILTERS, status: "waiting" }, "from")
    expect(from).toEqual([
      { value: "any", label: "Anywhere", count: 2 },
      { value: "saved", label: "Posts you saved", count: 1 },
      { value: "own", label: "Your own work", count: 1 },
    ])
  })

  it("offers only the channels the drafts are written for", () => {
    expect(optionsFor(rows, NO_FILTERS, "channel").map((o) => o.value)).toEqual(["any", "x", "linkedin"])
  })

  it("searches the idea, the handle and every version's text", () => {
    const q = (text: string) => rows.filter((r) => matches(r, { ...NO_FILTERS, q: text })).map((r) => r.id)
    expect(q("opening of v4")).toEqual(["new"])
    expect(q("idea stuck")).toEqual(["stuck"])
  })
})

import { describe, expect, it } from "vitest"

import {
  goingOutLine,
  goingOutOfEntry,
  goingOutOfPreview,
  goingOutOfVersion,
  type GoingOutVersion,
} from "./going-out"

const approved: GoingOutVersion = {
  state: "approved",
  goingOut: null,
  hasSlot: false,
  sent: null,
}
const fmt = (at: Date, beyond: boolean) => `${beyond ? "far " : ""}${at.toISOString()}`

describe("goingOutOfVersion", () => {
  it("is writing before anything is decided", () => {
    expect(goingOutOfVersion({ ...approved, state: "writing" })).toEqual({ kind: "writing" })
  })

  it("reads the queued time from the server row", () => {
    expect(goingOutOfVersion({ ...approved, goingOut: "Thu 07:45" })).toEqual({
      kind: "scheduled",
      at: "Thu 07:45",
      beyondThisWeek: false,
    })
  })

  it("published beats every plan, the session included", () => {
    const g = goingOutOfVersion(
      { ...approved, goingOut: "Thu 07:45", sent: { state: "published", url: "https://x.com/1", at: "09:12" } },
      { posted: { ok: false, message: "nope" } }
    )
    expect(g).toEqual({ kind: "published", at: "09:12", url: "https://x.com/1" })
  })

  it("a Post now result beats a stale queued row", () => {
    expect(
      goingOutOfVersion({ ...approved, goingOut: "Thu 07:45" }, { posted: { ok: true, url: "u" } })
    ).toEqual({ kind: "published", at: "just now", url: "u" })
    expect(goingOutOfVersion(approved, { posted: { ok: false, message: "No account" } })).toEqual({
      kind: "failed",
      error: "No account",
    })
  })

  it("sending and failed come from the row", () => {
    expect(goingOutOfVersion({ ...approved, sent: { state: "sending" } })).toEqual({ kind: "sending" })
    expect(goingOutOfVersion({ ...approved, sent: { state: "failed", error: null } })).toEqual({
      kind: "failed",
      error: null,
    })
  })

  it("formats a fresh placement through the injected formatter", () => {
    const at = new Date("2026-11-19T06:45:00Z")
    expect(
      goingOutOfVersion(
        { ...approved, state: "writing" },
        { placement: { scheduled: true, at, beyondThisWeek: true }, formatAt: fmt }
      )
    ).toEqual({ kind: "scheduled", at: `far ${at.toISOString()}`, beyondThisWeek: true })
  })

  it("tells the three ways to have no time apart", () => {
    expect(
      goingOutOfVersion(approved, { placement: { scheduled: false, reason: "slots-full" } }).kind
    ).toBe("slots-full")
    expect(goingOutOfVersion({ ...approved, hasSlot: true }).kind).toBe("slot-came-later")
    expect(goingOutOfVersion(approved).kind).toBe("no-slot")
    expect(
      goingOutOfVersion({ ...approved, state: "writing" }, { placement: { scheduled: false, reason: "no-slot" } }).kind
    ).toBe("no-slot")
  })
})

describe("goingOutOfEntry", () => {
  it("maps every scheduled state", () => {
    const e = { time: "07:45", url: null, error: null }
    expect(goingOutOfEntry({ ...e, state: "queued" }, "Thu")).toEqual({
      kind: "scheduled",
      at: "Thu 07:45",
      beyondThisWeek: false,
    })
    expect(goingOutOfEntry({ ...e, state: "sending" }).kind).toBe("sending")
    expect(goingOutOfEntry({ ...e, state: "published", url: "u" })).toEqual({
      kind: "published",
      at: "07:45",
      url: "u",
    })
    expect(goingOutOfEntry({ ...e, state: "failed", error: "Rate limited" })).toEqual({
      kind: "failed",
      error: "Rate limited",
    })
  })
})

describe("goingOutOfPreview", () => {
  it("reads the chat receipt", () => {
    expect(goingOutOfPreview(null)).toEqual({ kind: "approved" })
    expect(goingOutOfPreview({ ok: false, message: "x" })).toEqual({ kind: "approved" })
    expect(
      goingOutOfPreview({ ok: true, timezone: "Europe/Oslo", goingOut: "Thu 07:45", beyondThisWeek: false })
    ).toEqual({ kind: "scheduled", at: "Thu 07:45", beyondThisWeek: false })
    expect(goingOutOfPreview({ ok: true, timezone: "Europe/Oslo", reason: "slots-full" }).kind).toBe(
      "slots-full"
    )
    expect(goingOutOfPreview({ ok: true, timezone: "Europe/Oslo", reason: "no-slot" }).kind).toBe("no-slot")
  })
})

describe("goingOutLine", () => {
  it("keeps the time apart for Mono, and joins the sentence", () => {
    const l = goingOutLine({ kind: "scheduled", at: "Thu 07:45", beyondThisWeek: false }, "X")
    expect(l).toMatchObject({ before: "Goes out", at: "Thu 07:45", after: ".", text: "Goes out Thu 07:45." })
    expect(l).toMatchObject({ undoable: true, postable: true, placeable: false, tone: "plain" })
  })

  it("says past the week when it is", () => {
    expect(goingOutLine({ kind: "scheduled", at: "Mon 30 Nov 08:00", beyondThisWeek: true }, "X").text).toBe(
      "Goes out Mon 30 Nov 08:00, past the week Lineup shows."
    )
  })

  it("names the channel when it has no slot", () => {
    expect(goingOutLine({ kind: "no-slot" }, "LinkedIn").text).toMatch(/^No LinkedIn slot yet/)
    expect(goingOutLine({ kind: "slots-full" }, "LinkedIn").text).toMatch(/^Every LinkedIn slot/)
  })

  it("only the slot-came-later state is placeable", () => {
    expect(goingOutLine({ kind: "slot-came-later" }, "X").placeable).toBe(true)
    expect(goingOutLine({ kind: "no-slot" }, "X").placeable).toBe(false)
  })

  it("offers nothing while sending, and no undo once out", () => {
    expect(goingOutLine({ kind: "sending" }, "X")).toMatchObject({ undoable: false, postable: false })
    expect(goingOutLine({ kind: "published", at: "09:12", url: "u" }, "X")).toMatchObject({
      undoable: false,
      postable: false,
      url: "u",
      text: "Posted 09:12.",
    })
  })

  it("a failure says the platform's words, or ours when there are none", () => {
    expect(goingOutLine({ kind: "failed", error: "Token expired." }, "X")).toMatchObject({
      text: "Token expired.",
      tone: "wrong",
      postable: true,
    })
    expect(goingOutLine({ kind: "failed", error: null }, "X").text).toBe("It did not go out.")
  })

  it("writing has no time and no actions", () => {
    expect(goingOutLine({ kind: "writing" }, "X")).toMatchObject({
      at: null,
      undoable: false,
      postable: false,
    })
  })
})

import { describe, expect, it } from "vitest"

import { copyElement, duplicateElement, pasteElement } from "./clipboard"
import { applyAsUser, documentOf, threeClipScene } from "./test-fixture"
import { findMainTrack } from "./timeline"
import { secondsToUs } from "./time"
import type { VideoElement } from "./types"

const spineOf = (doc: ReturnType<typeof documentOf>) =>
  findMainTrack(doc.scenes[0])!.elements as VideoElement[]

describe("duplicateElement", () => {
  it("puts a copy of a spine clip right after it and moves the rest along", () => {
    const doc = documentOf(threeClipScene())
    const first = spineOf(doc)[0]

    const after = applyAsUser(doc, duplicateElement(doc.scenes[0], first.id))
    const spine = spineOf(after)

    expect(spine).toHaveLength(4)
    expect(spine[1].trimStartUs).toBe(first.trimStartUs)
    expect(spine[1].id).not.toBe(first.id)
    expect(spine[3].startUs).toBe(secondsToUs(30))
  })
})

describe("pasteElement", () => {
  it("pastes a spine clip into the clip under the playhead, splitting it", () => {
    const doc = documentOf(threeClipScene())
    const item = copyElement(doc.scenes[0], spineOf(doc)[2].id)!

    const after = applyAsUser(
      doc,
      pasteElement(doc.scenes[0], item, secondsToUs(5))
    )
    const spine = spineOf(after)

    expect(spine).toHaveLength(5)
    expect(spine[0].durationUs).toBe(secondsToUs(5))
    expect(spine[1].trimStartUs).toBe(secondsToUs(20))
    expect(spine[2].trimStartUs).toBe(secondsToUs(5))
    expect(spine.reduce((sum, e) => sum + e.durationUs, 0)).toBe(
      secondsToUs(40)
    )
  })

  it("does not copy a caption", () => {
    const doc = documentOf(threeClipScene())
    expect(copyElement(doc.scenes[0], "nope")).toBeNull()
  })
})

describe("removeElements", () => {
  it("takes several spine clips out in one go and closes the cut once", async () => {
    const { removeElements } = await import("./edits")
    const doc = documentOf(threeClipScene())
    const [a, , c] = spineOf(doc)

    const after = applyAsUser(doc, removeElements(doc.scenes[0], [a.id, c.id]))
    const spine = spineOf(after)

    expect(spine).toHaveLength(1)
    expect(spine[0].startUs).toBe(0)
    expect(spine[0].trimStartUs).toBe(secondsToUs(10))
  })

  it("never empties the spine", async () => {
    const { removeElements } = await import("./edits")
    const doc = documentOf(threeClipScene())
    expect(
      removeElements(
        doc.scenes[0],
        spineOf(doc).map((e) => e.id)
      )
    ).toEqual([])
  })
})

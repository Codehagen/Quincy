import { describe, expect, it } from "vitest"

import { deleteTimelineRange } from "./edits"
import { placeMarkers, toggleMarker } from "./markers"
import { applyAsUser, documentOf, threeClipScene } from "./test-fixture"
import { secondsToUs } from "./time"

describe("markers", () => {
  it("adds a marker at the playhead, and M on it again takes it away", () => {
    const doc = documentOf(threeClipScene())
    const scene = doc.scenes[0]

    const added = applyAsUser(
      doc,
      toggleMarker(scene, doc.metadata, secondsToUs(12))
    )
    expect(placeMarkers(added.scenes[0], added.metadata.markers)).toEqual([
      secondsToUs(12),
    ])

    const removed = applyAsUser(
      added,
      toggleMarker(added.scenes[0], added.metadata, secondsToUs(12))
    )
    expect(removed.metadata.markers).toBeUndefined()
  })

  it("stays on its word when a cut before it moves everything left", () => {
    const doc = documentOf(threeClipScene())
    const marked = applyAsUser(
      doc,
      toggleMarker(doc.scenes[0], doc.metadata, secondsToUs(25))
    )
    const cut = applyAsUser(
      marked,
      deleteTimelineRange(marked.scenes[0], secondsToUs(2), secondsToUs(5))
    )

    expect(placeMarkers(cut.scenes[0], cut.metadata.markers)).toEqual([
      secondsToUs(22),
    ])
  })

  it("is not shown while its moment is cut out", () => {
    const doc = documentOf(threeClipScene())
    const marked = applyAsUser(
      doc,
      toggleMarker(doc.scenes[0], doc.metadata, secondsToUs(3))
    )
    const cut = applyAsUser(
      marked,
      deleteTimelineRange(marked.scenes[0], secondsToUs(2), secondsToUs(5))
    )

    expect(placeMarkers(cut.scenes[0], cut.metadata.markers)).toEqual([])
    expect(cut.metadata.markers).toHaveLength(1)
  })
})

import { describe, expect, it } from "vitest"

import { detachSound } from "./detach-sound"
import { trimEdge } from "./edits"
import { DEFAULT_FREEZE_US, freezeFrame } from "./freeze"
import { applyAsUser, documentOf, threeClipScene } from "./test-fixture"
import { findMainTrack, sourceToTimelineUs } from "./timeline"
import { secondsToUs } from "./time"
import type { AudioElement, VideoElement } from "./types"

const spineOf = (doc: ReturnType<typeof documentOf>) =>
  findMainTrack(doc.scenes[0])!.elements as VideoElement[]

describe("freezeFrame", () => {
  it("splits the clip at the playhead and holds that frame between the halves", () => {
    const doc = documentOf(threeClipScene())
    const after = applyAsUser(doc, freezeFrame(doc.scenes[0], secondsToUs(4)))
    const spine = spineOf(after)

    expect(spine).toHaveLength(5)
    expect(spine[0].durationUs).toBe(secondsToUs(4))
    const still = spine[1]
    expect(still.frozen).toBe(true)
    expect(still.startUs).toBe(secondsToUs(4))
    expect(still.durationUs).toBe(DEFAULT_FREEZE_US)
    expect(still.trimStartUs).toBe(secondsToUs(4))
    expect(still.trimEndUs).toBe(still.trimStartUs)
    // The footage plays on from where it stopped, two seconds later.
    expect(spine[2].trimStartUs).toBe(secondsToUs(4))
    expect(spine[2].startUs).toBe(secondsToUs(6))
    expect(spine[4].startUs).toBe(secondsToUs(22))
  })

  it("keeps the words at the held instant with the footage after the hold", () => {
    const doc = documentOf(threeClipScene())
    const after = applyAsUser(doc, freezeFrame(doc.scenes[0], secondsToUs(4)))
    const spine = findMainTrack(after.scenes[0])!

    expect(sourceToTimelineUs(spine, "va-1", secondsToUs(4))).toBe(
      secondsToUs(6)
    )
  })

  it("does nothing past the end of the cut", () => {
    const doc = documentOf(threeClipScene())
    expect(freezeFrame(doc.scenes[0], secondsToUs(45))).toEqual([])
  })

  it("lengthens a still by its end without touching the source", () => {
    const doc = documentOf(threeClipScene())
    const frozen = applyAsUser(doc, freezeFrame(doc.scenes[0], secondsToUs(4)))
    const scene = frozen.scenes[0]
    const spine = findMainTrack(scene)!
    const still = spine.elements[1] as VideoElement

    const after = applyAsUser(
      frozen,
      trimEdge(scene, spine.id, still.id, "end", secondsToUs(3))
    )
    const held = spineOf(after)[1]
    expect(held.durationUs).toBe(secondsToUs(5))
    expect(held.trimStartUs).toBe(still.trimStartUs)
    expect(held.trimEndUs).toBe(still.trimStartUs)
  })
})

describe("detachSound", () => {
  it("puts the clip's sound on a lane of its own and quiets the clip", () => {
    const doc = documentOf(threeClipScene())
    const scene = doc.scenes[0]
    const spine = findMainTrack(scene)!
    const clip = spine.elements[1] as VideoElement

    const after = applyAsUser(doc, detachSound(scene, spine.id, clip.id))
    const quiet = spineOf(after)[1]
    expect(quiet.muted).toBe(true)

    const sound = after.scenes[0].tracks
      .flatMap((track) => track.elements)
      .find((element) => element.kind === "audio") as AudioElement
    expect(sound.mediaId).toBe(clip.mediaId)
    expect(sound.startUs).toBe(clip.startUs)
    expect(sound.durationUs).toBe(clip.durationUs)
    expect(sound.trimStartUs).toBe(clip.trimStartUs)
    expect(sound.trimEndUs).toBe(clip.trimEndUs)
  })

  it("refuses a clip already quiet, and a still", () => {
    const doc = documentOf(threeClipScene())
    const scene = doc.scenes[0]
    const spine = findMainTrack(scene)!
    const first = applyAsUser(
      doc,
      detachSound(scene, spine.id, spine.elements[0].id)
    )
    expect(
      detachSound(first.scenes[0], spine.id, spine.elements[0].id)
    ).toEqual([])

    const frozen = applyAsUser(doc, freezeFrame(scene, secondsToUs(4)))
    const still = spineOf(frozen)[1]
    expect(detachSound(frozen.scenes[0], spine.id, still.id)).toEqual([])
  })
})

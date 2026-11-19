import { describe, expect, it } from "vitest"

import { audioFades, setAudioFades } from "./audio-fades"
import { createTrack } from "./document"
import { newElement } from "./ops"
import { applyAsUser, documentOf, threeClipScene } from "./test-fixture"
import { secondsToUs, us } from "./time"
import type { AudioElement, Scene } from "./types"

function withMusic(): { scene: Scene; trackId: string; elementId: string } {
  const scene = threeClipScene()
  const track = { ...createTrack("audio", { name: "Music" }), id: "music" }
  const bed = newElement<AudioElement>(
    {
      kind: "audio",
      name: "bed",
      mediaId: "mu-1",
      startUs: us(0),
      durationUs: secondsToUs(20),
      trimStartUs: us(0),
      trimEndUs: secondsToUs(20),
      sourceDurationUs: secondsToUs(60),
      volume: 1,
      muted: false,
      animations: { channels: {} },
    },
    "user"
  )
  track.elements = [bed]
  scene.tracks.push(track)
  return { scene, trackId: track.id, elementId: bed.id }
}

const bedOf = (doc: ReturnType<typeof documentOf>) =>
  doc.scenes[0].tracks.find((t) => t.id === "music")!
    .elements[0] as AudioElement

describe("audio fades", () => {
  it("writes both fades and reads them back", () => {
    const { scene, trackId, elementId } = withMusic()
    const doc = applyAsUser(
      documentOf(scene),
      setAudioFades(scene, trackId, elementId, {
        inUs: 2_000_000,
        outUs: 3_000_000,
      })
    )
    expect(audioFades(bedOf(doc))).toEqual({
      inUs: 2_000_000,
      outUs: 3_000_000,
    })
  })

  it("never lets the two fades cross", () => {
    const { scene, trackId, elementId } = withMusic()
    const doc = applyAsUser(
      documentOf(scene),
      setAudioFades(scene, trackId, elementId, {
        inUs: 30_000_000,
        outUs: 10_000_000,
      })
    )
    const fades = audioFades(bedOf(doc))
    expect(fades.inUs + fades.outUs).toBeLessThanOrEqual(secondsToUs(20))
  })

  it("clears the channel when both are zero", () => {
    const { scene, trackId, elementId } = withMusic()
    const doc = applyAsUser(
      documentOf(scene),
      setAudioFades(scene, trackId, elementId, { inUs: 0, outUs: 0 })
    )
    expect(bedOf(doc).animations.channels["volume"]).toBeUndefined()
  })
})

import { describe, expect, it } from "vitest"

import { chapterLines, chaptersFor, placeChapters } from "./chapters"
import { createScene } from "./document"
import { applyToScene, newElement } from "./ops"
import { findMainTrack } from "./timeline"
import { secondsToUs, us } from "./time"
import { removeSilences } from "./tools"
import type { Scene, VideoElement } from "./types"

function scene(): Scene {
  const base = createScene({})
  findMainTrack(base)!.elements = [
    newElement<VideoElement>(
      {
        kind: "video",
        name: "take.mp4",
        mediaId: "va-1",
        startUs: us(0),
        durationUs: secondsToUs(60),
        trimStartUs: us(0),
        trimEndUs: secondsToUs(60),
        sourceDurationUs: secondsToUs(60),
        transform: {
          position: { x: 0, y: 0 },
          scaleX: 1,
          scaleY: 1,
          rotate: 0,
        },
        opacity: 1,
        blendMode: "normal",
        volume: 1,
        muted: false,
        effects: [],
        animations: { channels: {} },
      },
      "user"
    ),
  ]
  return base
}

describe("chaptersFor", () => {
  it("binds chapters to the source and reads them back", () => {
    const verdict = chaptersFor(scene(), [
      { title: "Intro", atUs: 0 },
      { title: "The fix", atUs: secondsToUs(20) },
    ])
    expect(verdict.ok).toBe(true)
    if (!verdict.ok) return
    expect(chapterLines(placeChapters(scene(), verdict.chapters))).toBe(
      "0:00 Intro\n0:20 The fix"
    )
  })

  it("refuses chapters that read wrong", () => {
    const s = scene()
    expect(chaptersFor(s, [{ title: "Late", atUs: secondsToUs(3) }]).ok).toBe(
      false
    )
    expect(chaptersFor(s, [{ title: " ", atUs: 0 }]).ok).toBe(false)
    expect(
      chaptersFor(s, [
        { title: "A", atUs: 0 },
        { title: "B", atUs: secondsToUs(2) },
      ]).ok
    ).toBe(false)
    expect(
      chaptersFor(s, [
        { title: "A", atUs: 0 },
        { title: "B", atUs: secondsToUs(90) },
      ]).ok
    ).toBe(false)
  })

  it("keeps a chapter on its sentence after a cut moves it", () => {
    const base = scene()
    const verdict = chaptersFor(base, [
      { title: "Intro", atUs: 0 },
      { title: "Later", atUs: secondsToUs(30) },
    ])
    if (!verdict.ok) throw new Error(verdict.error)
    const words = [
      {
        text: "a",
        startUs: secondsToUs(1),
        endUs: secondsToUs(1.5),
        confidence: 1,
      },
      {
        text: "b",
        startUs: secondsToUs(30),
        endUs: secondsToUs(30.5),
        confidence: 1,
      },
    ]
    const cut = applyToScene(
      base,
      removeSilences(base, words, {
        mediaId: "va-1",
        author: "agent",
        sourceDurationUs: secondsToUs(60),
      }),
      "agent"
    )
    const [, later] = placeChapters(cut, verdict.chapters)
    expect(later.atUs).toBeLessThan(secondsToUs(30))
  })
})

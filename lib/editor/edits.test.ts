import { describe, expect, it } from "vitest"

import { createScene, DEFAULT_CAPTION_STYLE } from "./document"
import {
  applyEffect,
  clampTrimDelta,
  clearZoom,
  cropClip,
  cropSpine,
  deleteAndRipple,
  deleteSpeech,
  fade,
  MINIMUM_CLIP_US,
  moveEffect,
  punchIn,
  removeEffect,
  removeEffectsOfType,
  resizeEffect,
  setEffectAmount,
  reframe,
  splitAt,
  trimEdge,
  trimPreviewDeltaUs,
} from "./edits"
import { applyOps, newElement } from "./ops"
import { findMainTrack } from "./timeline"
import { secondsToUs, us } from "./time"
import {
  UNLOCKED,
  type CaptionElement,
  type Scene,
  type VideoElement,
} from "./types"

/** A spine of three ten-second clips, laid end to end. */
function scene(): Scene {
  const base = createScene({})
  const main = findMainTrack(base)!

  main.elements = [0, 1, 2].map((index) =>
    newElement<VideoElement>(
      {
        kind: "video",
        name: `clip ${index}`,
        mediaId: "va-1",
        startUs: secondsToUs(index * 10),
        durationUs: secondsToUs(10),
        trimStartUs: secondsToUs(index * 10),
        trimEndUs: secondsToUs(index * 10 + 10),
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
    )
  )

  return base
}

function run(base: Scene, ops: ReturnType<typeof splitAt>) {
  const document = {
    version: 1,
    metadata: {
      id: "vp-1",
      name: "t",
      durationUs: us(0),
      createdAt: "",
      updatedAt: "",
    },
    settings: {
      fps: 30,
      canvas: { width: 1920, height: 1080 },
      background: { type: "color" as const, color: "#000" },
    },
    scenes: [base],
    currentSceneId: base.id,
  }

  const result = applyOps({ document, revision: 0, lock: UNLOCKED }, ops, {
    author: "user",
  })

  return findMainTrack(result.snapshot.document.scenes[0])!.elements
}

describe("splitAt", () => {
  it("cuts a clip into two that together play what one did", () => {
    const base = scene()
    const trackId = findMainTrack(base)!.id

    const elements = run(base, splitAt(base, trackId, secondsToUs(13)))

    expect(elements).toHaveLength(4)

    const [, left, right] = elements
    expect(left.durationUs).toBe(secondsToUs(3))
    expect(right.durationUs).toBe(secondsToUs(7))

    // The trims are what make it a cut and not a duplication. Both halves
    // playing the whole source looks right on the timeline and plays as a
    // stutter.
    expect((left as VideoElement).trimEndUs).toBe(secondsToUs(13))
    expect((right as VideoElement).trimStartUs).toBe(secondsToUs(13))
    expect((right as VideoElement).trimEndUs).toBe(secondsToUs(20))
  })

  it("leaves the timeline continuous", () => {
    const base = scene()
    const trackId = findMainTrack(base)!.id
    const elements = run(base, splitAt(base, trackId, secondsToUs(13)))

    const sorted = [...elements].sort((a, b) => a.startUs - b.startUs)
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].startUs).toBe(
        sorted[i - 1].startUs + sorted[i - 1].durationUs
      )
    }
  })

  it("gives each half its own id", () => {
    // The halves used to inherit the original's id, because newElement honours
    // an id it is handed and the clip was spread in whole. Nothing looked
    // wrong — two clips, right lengths, right places — until remove_element
    // matched on id, found both, and deleting one half deleted the cut.
    const base = scene()
    const trackId = findMainTrack(base)!.id
    const original = findMainTrack(base)!.elements[1].id

    const elements = run(base, splitAt(base, trackId, secondsToUs(13)))
    const ids = elements.map((element) => element.id)

    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).not.toContain(original)
  })

  it("survives deleting one of its own halves", () => {
    // The failure the duplicate id produced, as a test in its own right:
    // splitting and then deleting the first half left an empty timeline.
    const base = scene()
    const trackId = findMainTrack(base)!.id

    const afterSplit = run(base, splitAt(base, trackId, secondsToUs(13)))
    expect(afterSplit).toHaveLength(4)

    const sceneAfter: Scene = {
      ...base,
      tracks: base.tracks.map((track) =>
        track.id === trackId ? { ...track, elements: afterSplit } : track
      ),
    }

    const remaining = run(
      sceneAfter,
      deleteAndRipple(sceneAfter, trackId, afterSplit[1].id)
    )

    expect(remaining).toHaveLength(3)
  })

  it("credits a half to whoever made the cut, not the original author", () => {
    // Provenance was spread along with the id. A half cut out of an agent's
    // clip should belong to the person who cut it, or undoing the agent's run
    // would take the user's cut with it.
    const base = createScene({})
    const main = findMainTrack(base)!
    main.elements = [
      newElement<VideoElement>(
        {
          kind: "video",
          name: "agent clip",
          mediaId: "va-1",
          startUs: us(0),
          durationUs: secondsToUs(10),
          trimStartUs: us(0),
          trimEndUs: secondsToUs(10),
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
        "agent"
      ),
    ]

    const elements = run(base, splitAt(base, main.id, secondsToUs(4)))

    expect(elements[0].provenance.createdBy).toBe("user")
    expect(elements[1].provenance.createdBy).toBe("user")
  })

  it("refuses to cut on a boundary", () => {
    // A zero-length clip cannot be rendered or selected, so it must not be
    // creatable.
    const base = scene()
    const trackId = findMainTrack(base)!.id

    expect(splitAt(base, trackId, secondsToUs(10))).toEqual([])
    expect(splitAt(base, trackId, us(0))).toEqual([])
  })

  it("puts the cut in the right frame on a retimed clip", () => {
    // The trim window and the timeline duration are only equal at normal speed.
    // Assuming otherwise misplaces the cut on exactly the clips someone cared
    // enough about to retime.
    const base = createScene({})
    const main = findMainTrack(base)!
    main.elements = [
      newElement<VideoElement>(
        {
          kind: "video",
          name: "half speed",
          mediaId: "va-1",
          startUs: us(0),
          // Twenty seconds of timeline from ten seconds of source.
          durationUs: secondsToUs(20),
          trimStartUs: us(0),
          trimEndUs: secondsToUs(10),
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

    const elements = run(base, splitAt(base, main.id, secondsToUs(10)))
    const [left] = elements

    // Halfway along the timeline is five seconds into the source, not ten.
    expect((left as VideoElement).trimEndUs).toBe(secondsToUs(5))
  })
})

describe("deleteAndRipple", () => {
  it("closes the gap it leaves", () => {
    // A hole in the spine is a hole in the cut. Making the user close it is
    // making "delete" a two-step operation where step two is remembering.
    const base = scene()
    const trackId = findMainTrack(base)!.id
    const middle = findMainTrack(base)!.elements[1].id

    const elements = run(base, deleteAndRipple(base, trackId, middle))

    expect(elements).toHaveLength(2)
    expect(elements[0].startUs).toBe(0)
    expect(elements[1].startUs).toBe(secondsToUs(10))
  })

  it("does nothing for a clip that is not there", () => {
    const base = scene()
    const trackId = findMainTrack(base)!.id

    expect(deleteAndRipple(base, trackId, "ve-nope")).toEqual([])
  })
})

describe("trimEdge", () => {
  it("moves the source edge with the timeline edge", () => {
    // Two views of one edge. Moving only the duration slides the content under
    // it; moving only the trim leaves a gap the ripple then closes.
    const base = scene()
    const trackId = findMainTrack(base)!.id
    const first = findMainTrack(base)!.elements[0]

    const elements = run(
      base,
      trimEdge(base, trackId, first.id, "end", -secondsToUs(4))
    )

    expect(elements[0].durationUs).toBe(secondsToUs(6))
    expect((elements[0] as VideoElement).trimEndUs).toBe(secondsToUs(6))
    // And everything downstream slid left by exactly the amount removed.
    expect(elements[1].startUs).toBe(secondsToUs(6))
  })

  it("will not trim past the end of the footage", () => {
    // Without the source clamp, dragging an end past the footage produces a
    // clip that plays black.
    const base = scene()
    const trackId = findMainTrack(base)!.id
    const last = findMainTrack(base)!.elements[2]

    const elements = run(
      base,
      trimEdge(base, trackId, last.id, "end", secondsToUs(999))
    )

    const trimmed = elements[2] as VideoElement
    expect(trimmed.trimEndUs).toBeLessThanOrEqual(trimmed.sourceDurationUs)
  })

  it("will not collapse a clip to nothing", () => {
    const base = scene()
    const trackId = findMainTrack(base)!.id
    const first = findMainTrack(base)!.elements[0]

    const elements = run(
      base,
      trimEdge(base, trackId, first.id, "end", -secondsToUs(999))
    )

    expect(elements[0].durationUs).toBeGreaterThan(0)
  })

  it("moves the clip when the start edge moves", () => {
    const base = scene()
    const trackId = findMainTrack(base)!.id
    const second = findMainTrack(base)!.elements[1]

    const elements = run(
      base,
      trimEdge(base, trackId, second.id, "start", secondsToUs(3))
    )

    // Shorter by three, and the ripple pulls it back against its neighbour
    // rather than leaving the hole the trim opened.
    expect(elements[1].durationUs).toBe(secondsToUs(7))
    expect(elements[1].startUs).toBe(secondsToUs(10))
    expect((elements[1] as VideoElement).trimStartUs).toBe(secondsToUs(13))
  })

  it("does nothing when there is no room to move", () => {
    // The first clip starts at the beginning of its source, so there is nothing
    // to reveal by dragging its start left.
    const base = scene()
    const trackId = findMainTrack(base)!.id
    const first = findMainTrack(base)!.elements[0]

    expect(trimEdge(base, trackId, first.id, "start", -secondsToUs(5))).toEqual(
      []
    )
  })
})

describe("reframe", () => {
  const LANDSCAPE = { width: 1920, height: 1080 }
  const VERTICAL = { width: 1080, height: 1920 }

  /** Reframe touches the scene, not its elements, so `run` is no use here. */
  function applyToScene(base: Scene, ops: ReturnType<typeof reframe>): Scene {
    const document = {
      version: 1,
      metadata: {
        id: "vp-1",
        name: "t",
        durationUs: us(0),
        createdAt: "",
        updatedAt: "",
      },
      settings: {
        fps: 30,
        canvas: LANDSCAPE,
        background: { type: "color" as const, color: "#000" },
      },
      scenes: [base],
      currentSceneId: base.id,
    }

    return applyOps({ document, revision: 0, lock: UNLOCKED }, ops, {
      author: "user",
    }).snapshot.document.scenes[0]
  }

  it("puts the new frame on the scene", () => {
    const base = { ...scene(), canvas: VERTICAL }

    expect(applyToScene(base, reframe(base, LANDSCAPE)).canvas).toEqual(
      LANDSCAPE
    )
  })

  it("writes the scene's own canvas even when it had none", () => {
    const base = scene()
    expect(base.canvas).toBeUndefined()

    // A scene with no canvas falls back to the document's, so this could look
    // like a no-op. It is not: once framed, the scene answers for itself, and
    // the atomiser's next cut is free to disagree with the document.
    expect(applyToScene(base, reframe(base, LANDSCAPE)).canvas).toEqual(
      LANDSCAPE
    )
  })

  it("is a no-op when the scene is already in that frame", () => {
    const base = { ...scene(), canvas: VERTICAL }
    expect(reframe(base, { ...VERTICAL })).toEqual([])
  })

  it("moves no clips", () => {
    const base = { ...scene(), canvas: VERTICAL }
    const before = findMainTrack(base)!.elements

    const after = findMainTrack(
      applyToScene(base, reframe(base, LANDSCAPE))
    )!.elements

    expect(after).toEqual(before)
  })
})

describe("clampTrimDelta", () => {
  /** A clip with ten seconds of unused source at each end. */
  function clip(overrides: Partial<VideoElement> = {}): VideoElement {
    return {
      ...(findMainTrack(scene())!.elements[1] as VideoElement),
      ...overrides,
    }
  }

  it("stops the out point where the footage stops", () => {
    // trimEnd 20s of a 60s source: forty seconds of room and not a frame more.
    expect(clampTrimDelta(clip(), "end", secondsToUs(90))).toBe(secondsToUs(40))
  })

  it("stops the in point at the head of the source", () => {
    // trimStart 10s, so ten seconds of room going backwards.
    expect(clampTrimDelta(clip(), "start", -secondsToUs(30))).toBe(
      -secondsToUs(10)
    )
  })

  it("will not trim a clip out of existence from either edge", () => {
    const short = clip({ durationUs: us(MINIMUM_CLIP_US) })

    expect(clampTrimDelta(short, "end", -secondsToUs(5))).toBe(0)
    expect(clampTrimDelta(short, "start", secondsToUs(5))).toBe(0)
  })

  it("agrees with what trimEdge will actually do", () => {
    // The drag draws its preview from this and the edit applies trimEdge. If
    // the two clamps ever drift, the timeline snaps on release.
    const base = scene()
    const trackId = findMainTrack(base)!.id
    const target = findMainTrack(base)!.elements[1] as VideoElement

    const clamped = clampTrimDelta(target, "end", secondsToUs(90))
    const elements = run(
      base,
      trimEdge(base, trackId, target.id, "end", secondsToUs(90))
    )

    expect(elements[1].durationUs).toBe(target.durationUs + clamped)
  })
})

describe("trimPreviewDeltaUs", () => {
  const target = () => findMainTrack(scene())!.elements[1] as VideoElement

  it("lengthens on an out point dragged right", () => {
    expect(trimPreviewDeltaUs(target(), "end", secondsToUs(2))).toBe(
      secondsToUs(2)
    )
  })

  it("shortens on an in point dragged right", () => {
    // Both edges reduce to one number: how much longer the cut gets. Dragging
    // an in-point right takes two seconds out, so everything after it moves
    // two seconds left.
    expect(trimPreviewDeltaUs(target(), "start", secondsToUs(2))).toBe(
      -secondsToUs(2)
    )
  })

  it("returns what the clamp allows, never what the pointer asked for", () => {
    expect(trimPreviewDeltaUs(target(), "end", secondsToUs(90))).toBe(
      secondsToUs(40)
    )
  })
})

describe("captions follow the cut", () => {
  /**
   * A spine of three ten-second clips with one caption sitting in the third,
   * bound to the source instant its word was spoken at.
   */
  function sceneWithCaption(): Scene {
    const base = scene()
    const captions = base.tracks.find((track) => track.kind === "caption")!

    captions.elements = [
      newElement<CaptionElement>(
        {
          kind: "caption",
          name: "word",
          startUs: secondsToUs(25),
          durationUs: secondsToUs(1),
          tokens: [
            {
              id: "tok-1",
              text: "word",
              startUs: us(0),
              endUs: secondsToUs(1),
              sourceMediaId: "va-1",
              sourceElementId: "ve-x",
              sourceStartUs: secondsToUs(25),
              sourceEndUs: secondsToUs(26),
            },
          ],
          style: DEFAULT_CAPTION_STYLE,
          transform: {
            position: { x: 0, y: 0 },
            scaleX: 1,
            scaleY: 1,
            rotate: 0,
          },
        },
        "user"
      ),
    ]

    return base
  }

  function applyToScene(base: Scene, ops: ReturnType<typeof splitAt>): Scene {
    const document = {
      version: 1,
      metadata: {
        id: "vp-1",
        name: "t",
        durationUs: us(0),
        createdAt: "",
        updatedAt: "",
      },
      settings: {
        fps: 30,
        canvas: { width: 1920, height: 1080 },
        background: { type: "color" as const, color: "#000" },
      },
      scenes: [base],
      currentSceneId: base.id,
    }

    return applyOps({ document, revision: 0, lock: UNLOCKED }, ops, {
      author: "user",
    }).snapshot.document.scenes[0]
  }

  const captionAt = (result: Scene) =>
    result.tracks.find((track) => track.kind === "caption")!.elements[0]

  it("moves a caption left when a clip before it is deleted", () => {
    // The bug: removeSilences remapped captions and the hand edits did not, so
    // deleting a clip left every word after it sitting over the wrong footage.
    const base = sceneWithCaption()
    const trackId = findMainTrack(base)!.id
    const first = findMainTrack(base)!.elements[0]

    const after = applyToScene(base, deleteAndRipple(base, trackId, first.id))

    // The word was spoken 25s into the recording. Ten seconds of cut came out
    // in front of it, so it now plays at 15s.
    expect(captionAt(after).startUs).toBe(secondsToUs(15))
  })

  it("drops a caption whose word was in the clip that went", () => {
    const base = sceneWithCaption()
    const trackId = findMainTrack(base)!.id
    const third = findMainTrack(base)!.elements[2]

    const after = applyToScene(base, deleteAndRipple(base, trackId, third.id))

    // Its source instant no longer exists anywhere in the cut, so the caption
    // goes with it rather than lingering over whatever now follows.
    expect(
      after.tracks.find((track) => track.kind === "caption")!.elements
    ).toHaveLength(0)
  })

  it("moves a caption when a clip before it is trimmed shorter", () => {
    const base = sceneWithCaption()
    const trackId = findMainTrack(base)!.id
    const first = findMainTrack(base)!.elements[0]

    const after = applyToScene(
      base,
      trimEdge(base, trackId, first.id, "end", -secondsToUs(4))
    )

    // Four seconds came off the first clip, so everything downstream — the
    // word included — sits four seconds earlier.
    expect(captionAt(after).startUs).toBe(secondsToUs(21))
  })

  it("leaves captions alone on a split, which moves nothing", () => {
    const base = sceneWithCaption()
    const trackId = findMainTrack(base)!.id

    const after = applyToScene(base, splitAt(base, trackId, secondsToUs(13)))

    expect(captionAt(after).startUs).toBe(secondsToUs(25))
  })
})

describe("punchIn", () => {
  function applyToScene(base: Scene, ops: ReturnType<typeof punchIn>): Scene {
    const document = {
      version: 1,
      metadata: {
        id: "vp-1",
        name: "t",
        durationUs: us(0),
        createdAt: "",
        updatedAt: "",
      },
      settings: {
        fps: 30,
        canvas: { width: 1920, height: 1080 },
        background: { type: "color" as const, color: "#000" },
      },
      scenes: [base],
      currentSceneId: base.id,
    }

    return applyOps({ document, revision: 0, lock: UNLOCKED }, ops, {
      author: "agent",
    }).snapshot.document.scenes[0]
  }

  function clipAt(base: Scene, index: number): VideoElement {
    return findMainTrack(base)!.elements[index] as VideoElement
  }

  it("pushes in and back out across the clip", () => {
    const base = scene()
    const target = clipAt(base, 1)

    const after = applyToScene(base, punchIn(base, target.id, { scale: 1.4 }))
    const element = clipAt(after, 1)

    expect(element.effects).toHaveLength(1)
    expect(element.effects[0].type).toBe("zoom")
    expect(element.effects[0].params.scale).toBe(1.4)

    const channel =
      element.animations.channels[
        `effects.${element.effects[0].id}.params.scale`
      ]

    // Starts at rest, holds, and returns — a punch-in that ended scaled would
    // leave the next cut arriving at the wrong size.
    expect(channel.keys.map((key) => key.value)).toEqual([1, 1.4, 1.4, 1])
  })

  it("stores keyframes in the clip's own clock, not the scene's", () => {
    const base = scene()
    // The third clip starts twenty seconds in. A curve stored in scene time
    // would sit entirely past the end of the element that carries it.
    const target = clipAt(base, 2)

    const after = applyToScene(base, punchIn(base, target.id))
    const element = clipAt(after, 2)
    const channel = Object.values(element.animations.channels)[0]

    expect(channel.keys[0].timeUs).toBe(0)
    expect(channel.keys[channel.keys.length - 1].timeUs).toBe(secondsToUs(10))
  })

  it("takes a window inside the clip", () => {
    const base = scene()
    const target = clipAt(base, 0)

    const after = applyToScene(
      base,
      punchIn(base, target.id, {
        fromUs: secondsToUs(2),
        toUs: secondsToUs(6),
        rampUs: us(500_000),
      })
    )

    const channel = Object.values(clipAt(after, 0).animations.channels)[0]

    expect(channel.keys.map((key) => key.timeUs)).toEqual([
      secondsToUs(2),
      secondsToUs(2.5),
      secondsToUs(5.5),
      secondsToUs(6),
    ])
  })

  it("shrinks the ramps rather than letting them cross", () => {
    const base = scene()
    const target = clipAt(base, 0)

    const after = applyToScene(
      base,
      punchIn(base, target.id, {
        fromUs: secondsToUs(1),
        toUs: secondsToUs(2),
        rampUs: secondsToUs(5),
      })
    )

    const channel = Object.values(clipAt(after, 0).animations.channels)[0]
    const times = channel.keys.map((key) => key.timeUs)

    // Two five-second ramps inside a one-second window would overlap, and the
    // clip would scale past what was asked for in the middle.
    expect(times[1]).toBeLessThanOrEqual(times[2])
    expect(times[3]).toBe(secondsToUs(2))
  })

  it("holds when asked, with no release", () => {
    const base = scene()
    const target = clipAt(base, 0)

    const after = applyToScene(base, punchIn(base, target.id, { hold: true }))
    const channel = Object.values(clipAt(after, 0).animations.channels)[0]

    expect(channel.keys.map((key) => key.value)).toEqual([1, 1.3])
  })

  it("replaces an existing zoom instead of stacking one", () => {
    const base = scene()
    const target = clipAt(base, 0)

    const once = applyToScene(base, punchIn(base, target.id, { scale: 1.3 }))
    const twice = applyToScene(once, punchIn(once, target.id, { scale: 1.5 }))
    const element = clipAt(twice, 0)

    // Effects compose, so a second punch-in on the same clip would push to 1.95
    // and the agent would have no way to know it had.
    expect(element.effects).toHaveLength(1)
    expect(element.effects[0].params.scale).toBe(1.5)
    // The old effect's curve goes with it. Left behind it is dead data keyed to
    // an id nothing renders.
    expect(Object.keys(element.animations.channels)).toHaveLength(1)
    expect(Object.keys(element.animations.channels)[0]).toContain(
      element.effects[0].id
    )
  })

  it("stamps the agent on the fields it wrote", () => {
    const base = scene()
    const target = clipAt(base, 0)

    const element = clipAt(applyToScene(base, punchIn(base, target.id)), 0)

    expect(element.provenance.fields.effects).toBe("agent")
    // The clip itself is still the user's import. Undoing the run must not
    // throw away the footage it decorated.
    expect(element.provenance.createdBy).toBe("user")
  })

  it("has nothing to do for an element that is not there", () => {
    const base = scene()

    expect(punchIn(base, "ve-missing")).toEqual([])
  })

  it("refuses a window with no length", () => {
    const base = scene()
    const target = clipAt(base, 0)

    expect(
      punchIn(base, target.id, {
        fromUs: secondsToUs(4),
        toUs: secondsToUs(4),
      })
    ).toEqual([])
  })
})

describe("clearZoom", () => {
  function applyToScene(base: Scene, ops: ReturnType<typeof punchIn>): Scene {
    const document = {
      version: 1,
      metadata: {
        id: "vp-1",
        name: "t",
        durationUs: us(0),
        createdAt: "",
        updatedAt: "",
      },
      settings: {
        fps: 30,
        canvas: { width: 1920, height: 1080 },
        background: { type: "color" as const, color: "#000" },
      },
      scenes: [base],
      currentSceneId: base.id,
    }

    return applyOps({ document, revision: 0, lock: UNLOCKED }, ops, {
      author: "agent",
    }).snapshot.document.scenes[0]
  }

  it("takes the effect and its curve", () => {
    const base = scene()
    const target = findMainTrack(base)!.elements[0]

    const zoomed = applyToScene(base, punchIn(base, target.id))
    const cleared = applyToScene(zoomed, clearZoom(zoomed, target.id))
    const element = findMainTrack(cleared)!.elements[0] as VideoElement

    expect(element.effects).toEqual([])
    expect(element.animations.channels).toEqual({})
  })

  it("is not an edit when there is no zoom", () => {
    const base = scene()
    const target = findMainTrack(base)!.elements[0]

    expect(clearZoom(base, target.id)).toEqual([])
  })
})

describe("fade", () => {
  function applyToScene(base: Scene, ops: ReturnType<typeof fade>): Scene {
    const document = {
      version: 1,
      metadata: {
        id: "vp-1",
        name: "t",
        durationUs: us(0),
        createdAt: "",
        updatedAt: "",
      },
      settings: {
        fps: 30,
        canvas: { width: 1920, height: 1080 },
        background: { type: "color" as const, color: "#000" },
      },
      scenes: [base],
      currentSceneId: base.id,
    }

    return applyOps({ document, revision: 0, lock: UNLOCKED }, ops, {
      author: "agent",
    }).snapshot.document.scenes[0]
  }

  it("writes an opacity curve at both ends", () => {
    const base = scene()
    const target = findMainTrack(base)!.elements[0]

    const after = applyToScene(
      base,
      fade(base, target.id, { inUs: secondsToUs(1), outUs: secondsToUs(2) })
    )
    const element = findMainTrack(after)!.elements[0] as VideoElement
    const keys = element.animations.channels.opacity.keys

    expect(keys.map((key) => [key.timeUs, key.value])).toEqual([
      [0, 0],
      [secondsToUs(1), 1],
      [secondsToUs(8), 1],
      [secondsToUs(10), 0],
    ])
  })

  it("leaves the end alone when only asked for one", () => {
    const base = scene()
    const target = findMainTrack(base)!.elements[0]

    const after = applyToScene(
      base,
      fade(base, target.id, { inUs: secondsToUs(1) })
    )
    const element = findMainTrack(after)!.elements[0] as VideoElement

    expect(element.animations.channels.opacity.keys).toHaveLength(2)
  })

  it("keeps two fades from crossing inside a short clip", () => {
    const base = scene()
    const target = findMainTrack(base)!.elements[0]

    const after = applyToScene(
      base,
      fade(base, target.id, { inUs: secondsToUs(8), outUs: secondsToUs(8) })
    )
    const keys = (findMainTrack(after)!.elements[0] as VideoElement).animations
      .channels.opacity.keys

    // Sixteen seconds of fade in a ten second clip. Scaled down together, so
    // the middle still reaches full rather than the curve doubling back.
    expect(keys[1].timeUs).toBeLessThanOrEqual(keys[2].timeUs)
  })

  it("is not an edit when neither end fades", () => {
    const base = scene()
    const target = findMainTrack(base)!.elements[0]

    expect(fade(base, target.id)).toEqual([])
  })
})

describe("cropClip", () => {
  function applyToScene(base: Scene, ops: ReturnType<typeof cropClip>): Scene {
    const document = {
      version: 1,
      metadata: {
        id: "vp-1",
        name: "t",
        durationUs: us(0),
        createdAt: "",
        updatedAt: "",
      },
      settings: {
        fps: 30,
        canvas: { width: 1920, height: 1080 },
        background: { type: "color" as const, color: "#000" },
      },
      scenes: [base],
      currentSceneId: base.id,
    }

    return applyOps({ document, revision: 0, lock: UNLOCKED }, ops, {
      author: "agent",
    }).snapshot.document.scenes[0]
  }

  function clips(base: Scene): VideoElement[] {
    return findMainTrack(base)!.elements as VideoElement[]
  }

  it("names the part that survives", () => {
    const base = scene()
    const after = applyToScene(
      base,
      cropClip(base, clips(base)[0].id, { at: "left" })
    )

    // Not zero. Pinning a subject to the literal edge of the source is not what
    // "keep them on the left" means.
    expect(clips(after)[0].crop).toEqual({ x: 0.15, y: 0.5 })
  })

  it("takes an explicit point too", () => {
    const base = scene()
    const after = applyToScene(
      base,
      cropClip(base, clips(base)[0].id, { at: { x: 0.34, y: 0.2 } })
    )

    expect(clips(after)[0].crop).toEqual({ x: 0.34, y: 0.2 })
  })

  it("clamps a point outside the source", () => {
    const base = scene()
    const after = applyToScene(
      base,
      cropClip(base, clips(base)[0].id, { at: { x: 4, y: -1 } })
    )

    expect(clips(after)[0].crop).toEqual({ x: 1, y: 0 })
  })

  it("stops cropping when asked to show the whole picture", () => {
    const base = scene()
    const after = applyToScene(
      base,
      cropClip(base, clips(base)[0].id, { fit: "contain" })
    )

    expect(clips(after)[0].fit).toBe("contain")
    // Only what was asked for. Setting the crop point here would overwrite a
    // framing the user chose while the clip was still filling.
    expect(clips(after)[0].crop).toBeUndefined()
  })

  it("is not an edit when nothing was asked for", () => {
    const base = scene()

    expect(cropClip(base, clips(base)[0].id, {})).toEqual([])
    expect(cropClip(base, "ve-missing", { at: "left" })).toEqual([])
  })

  it("frames the whole spine at once", () => {
    const base = scene()
    const after = applyToScene(base, cropSpine(base, { at: "right" }))

    // Framing one clip of a cut differently from the rest is a jump, not a
    // decision, so the spine moves together.
    for (const clip of clips(after)) {
      expect(clip.crop).toEqual({ x: 0.85, y: 0.5 })
    }
  })
})

describe("effect editing", () => {
  function applyToScene(base: Scene, ops: ReturnType<typeof punchIn>): Scene {
    const document = {
      version: 1,
      metadata: {
        id: "vp-1",
        name: "t",
        durationUs: us(0),
        createdAt: "",
        updatedAt: "",
      },
      settings: {
        fps: 30,
        canvas: { width: 1920, height: 1080 },
        background: { type: "color" as const, color: "#000" },
      },
      scenes: [base],
      currentSceneId: base.id,
    }

    return applyOps({ document, revision: 0, lock: UNLOCKED }, ops, {
      author: "user",
    }).snapshot.document.scenes[0]
  }

  function firstClip(base: Scene): VideoElement {
    return findMainTrack(base)!.elements[0] as VideoElement
  }

  function zoomKeys(base: Scene): number[] {
    const clip = firstClip(base)
    return Object.values(clip.animations.channels)[0].keys.map(
      (key) => key.value
    )
  }

  function zoomTimes(base: Scene): number[] {
    const clip = firstClip(base)
    return Object.values(clip.animations.channels)[0].keys.map(
      (key) => key.timeUs
    )
  }

  it("moves the peak and leaves the shape alone", () => {
    const base = scene()
    const zoomed = applyToScene(
      base,
      punchIn(base, firstClip(base).id, { scale: 1.3 })
    )

    const after = applyToScene(
      zoomed,
      setEffectAmount(
        zoomed,
        firstClip(zoomed).id,
        firstClip(zoomed).effects[0].id,
        1.2
      )
    )

    // The ease, the hold and the release survive: only the two keys sitting at
    // the old peak move, so a curve someone retimed is not rebuilt underneath
    // them.
    expect(zoomKeys(after)).toEqual([1, 1.2, 1.2, 1])
    expect(zoomTimes(after)).toEqual(zoomTimes(zoomed))
    // The static param moves too, or removing the keys later would render a
    // number the UI never showed.
    expect(firstClip(after).effects[0].params.scale).toBe(1.2)
  })

  it("shifts the whole curve when the effect moves", () => {
    const base = scene()
    const zoomed = applyToScene(
      base,
      punchIn(base, firstClip(base).id, {
        fromUs: secondsToUs(1),
        toUs: secondsToUs(5),
      })
    )

    const before = zoomTimes(zoomed)
    const after = applyToScene(
      zoomed,
      moveEffect(
        zoomed,
        firstClip(zoomed).id,
        firstClip(zoomed).effects[0].id,
        secondsToUs(2)
      )
    )

    expect(zoomTimes(after)).toEqual(
      before.map((time) => time + secondsToUs(2))
    )
  })

  it("carries an effect across a cut onto the next clip", () => {
    // A split is a cut the user made for their own reasons, not a wall. This
    // used to clamp to the clip the effect was created on, which meant you
    // could not drag a zoom onto the next line of a sentence you had split in
    // the middle of.
    const base = scene()
    const clips = findMainTrack(base)!.elements
    const zoomed = applyToScene(
      base,
      punchIn(base, clips[0].id, {
        fromUs: secondsToUs(6),
        toUs: secondsToUs(10),
      })
    )

    const source = findMainTrack(zoomed)!.elements[0] as VideoElement
    const after = applyToScene(
      zoomed,
      moveEffect(zoomed, source.id, source.effects[0].id, secondsToUs(8))
    )

    const spine = findMainTrack(after)!.elements as VideoElement[]

    // Off the first clip entirely, and onto the second.
    expect(spine[0].effects).toEqual([])
    expect(Object.keys(spine[0].animations.channels)).toEqual([])
    expect(spine[1].effects).toHaveLength(1)

    // Rebased into the second clip's own clock: it starts 10s into the cut, so
    // a push landing at 14s is 4s local. Carrying the keys over unchanged would
    // have put it at 14s of a clip that is only 10s long.
    const keys = Object.values(spine[1].animations.channels)[0].keys
    expect(keys[0].timeUs).toBe(secondsToUs(4))
    expect(keys[keys.length - 1].timeUs).toBe(secondsToUs(8))
  })

  it("stops at the end of the track rather than falling off it", () => {
    const base = scene()
    const zoomed = applyToScene(
      base,
      punchIn(base, firstClip(base).id, {
        fromUs: secondsToUs(6),
        toUs: secondsToUs(10),
      })
    )

    const source = findMainTrack(zoomed)!.elements[0] as VideoElement
    const after = applyToScene(
      zoomed,
      moveEffect(zoomed, source.id, source.effects[0].id, secondsToUs(300))
    )

    // Three ten-second clips. The last one holds it, and it ends on the cut.
    const spine = findMainTrack(after)!.elements as VideoElement[]
    const keys = Object.values(spine[2].animations.channels)[0].keys

    expect(spine[2].effects).toHaveLength(1)
    expect(keys[keys.length - 1].timeUs).toBe(secondsToUs(10))
  })

  it("takes an effect and its curve together", () => {
    const base = scene()
    const zoomed = applyToScene(base, punchIn(base, firstClip(base).id))

    const after = applyToScene(
      zoomed,
      removeEffect(
        zoomed,
        firstClip(zoomed).id,
        firstClip(zoomed).effects[0].id
      )
    )

    expect(firstClip(after).effects).toEqual([])
    expect(firstClip(after).animations.channels).toEqual({})
  })

  it("leaves a fade alone when a zoom on the same clip goes", () => {
    const base = scene()
    const zoomed = applyToScene(base, punchIn(base, firstClip(base).id))
    const faded = applyToScene(
      zoomed,
      fade(zoomed, firstClip(zoomed).id, { inUs: secondsToUs(1) })
    )

    const after = applyToScene(
      faded,
      removeEffect(faded, firstClip(faded).id, firstClip(faded).effects[0].id)
    )

    // The fade is an opacity channel with no effect id in its path. Dropping
    // every channel on the element would take it with the zoom.
    expect(firstClip(after).animations.channels.opacity.keys).toHaveLength(2)
  })

  it("has nothing to do for an effect that is not there", () => {
    const base = scene()

    expect(setEffectAmount(base, firstClip(base).id, "vfx-missing", 2)).toEqual(
      []
    )
    expect(moveEffect(base, firstClip(base).id, "vfx-missing", 100)).toEqual([])
    expect(removeEffect(base, firstClip(base).id, "vfx-missing")).toEqual([])
  })
})

describe("deleteSpeech", () => {
  function spineOf(base: Scene, ops: ReturnType<typeof deleteSpeech>) {
    return run(base, ops)
  }

  it("cuts a phrase out of the middle of a clip", () => {
    const base = scene()

    const elements = spineOf(
      base,
      deleteSpeech(base, [
        {
          mediaId: "va-1",
          ranges: [{ startUs: secondsToUs(3), endUs: secondsToUs(5) }],
        },
      ])
    )

    // The first clip becomes two windows around the hole, and everything after
    // it slides up by the two seconds that left.
    expect(elements).toHaveLength(4)
    expect(elements[0].durationUs).toBe(secondsToUs(3))
    expect(elements[1].durationUs).toBe(secondsToUs(5))
    expect(elements[1].startUs).toBe(secondsToUs(3))
    expect(elements[3].startUs).toBe(secondsToUs(18))
  })

  it("cuts a phrase that runs across a cut", () => {
    // A selection does not know where the clip boundaries are, and the person
    // making it cannot see them in the transcript.
    const base = scene()

    const elements = spineOf(
      base,
      deleteSpeech(base, [
        {
          mediaId: "va-1",
          ranges: [{ startUs: secondsToUs(8), endUs: secondsToUs(12) }],
        },
      ])
    )

    expect(elements.map((element) => element.durationUs)).toEqual([
      secondsToUs(8),
      secondsToUs(8),
      secondsToUs(10),
    ])
    // Gapless, without anyone having asked for a ripple.
    expect(elements.map((element) => element.startUs)).toEqual([
      us(0),
      secondsToUs(8),
      secondsToUs(16),
    ])
  })

  it("leaves footage from another recording alone", () => {
    const base = scene()

    expect(
      deleteSpeech(base, [
        {
          mediaId: "va-other",
          ranges: [{ startUs: secondsToUs(3), endUs: secondsToUs(5) }],
        },
      ])
    ).toEqual([])
  })

  it("refuses to empty the spine", () => {
    // Select all, delete. A cut of nothing is worse than no cut at all.
    const base = scene()

    expect(
      deleteSpeech(base, [
        {
          mediaId: "va-1",
          ranges: [{ startUs: us(0), endUs: secondsToUs(30) }],
        },
      ])
    ).toEqual([])
  })

  it("is not an edit when the range misses the footage", () => {
    // Source instants past the trim windows currently in the cut. Emitting a
    // replace_elements here would cost an undo and change nothing.
    const base = scene()

    expect(
      deleteSpeech(base, [
        {
          mediaId: "va-1",
          ranges: [{ startUs: secondsToUs(40), endUs: secondsToUs(45) }],
        },
      ])
    ).toEqual([])
  })

  it("takes the captions with it", () => {
    const base = scene()
    const captions = base.tracks.find((track) => track.kind === "caption")!

    captions.elements = [4, 6, 25].map((at) =>
      newElement<CaptionElement>(
        {
          kind: "caption",
          name: `w${at}`,
          startUs: secondsToUs(at),
          durationUs: secondsToUs(0.5),
          tokens: [
            {
              id: `tok-${at}`,
              text: `w${at}`,
              startUs: us(0),
              endUs: secondsToUs(0.5),
              sourceMediaId: "va-1",
              sourceElementId: "ve-x",
              sourceStartUs: secondsToUs(at),
              sourceEndUs: secondsToUs(at + 0.5),
            },
          ],
          style: DEFAULT_CAPTION_STYLE,
          transform: {
            position: { x: 0, y: 0 },
            scaleX: 1,
            scaleY: 1,
            rotate: 0,
          },
        },
        "user"
      )
    )

    const document = {
      version: 1,
      metadata: {
        id: "vp-1",
        name: "t",
        durationUs: us(0),
        createdAt: "",
        updatedAt: "",
      },
      settings: {
        fps: 30,
        canvas: { width: 1920, height: 1080 },
        background: { type: "color" as const, color: "#000" },
      },
      scenes: [base],
      currentSceneId: base.id,
    }

    const after = applyOps(
      { document, revision: 0, lock: UNLOCKED },
      deleteSpeech(base, [
        {
          mediaId: "va-1",
          ranges: [{ startUs: secondsToUs(3), endUs: secondsToUs(5) }],
        },
      ]),
      { author: "user" }
    ).snapshot.document.scenes[0]

    const words = after.tracks
      .find((track) => track.kind === "caption")!
      .elements.map((element) => ({
        name: element.name,
        startUs: element.startUs,
      }))

    // The word inside the deleted range is gone with it, and the two that
    // survive are repositioned from their source binding rather than shifted —
    // w6 moves by the two seconds cut before it, w25 by the same two.
    expect(words).toEqual([
      { name: "w6", startUs: secondsToUs(4) },
      { name: "w25", startUs: secondsToUs(23) },
    ])
  })
})

describe("applyEffect", () => {
  function firstClip(base: Scene): VideoElement {
    return findMainTrack(base)!.elements[0] as VideoElement
  }

  function applyToScene(
    base: Scene,
    ops: ReturnType<typeof applyEffect>
  ): Scene {
    const document = {
      version: 1,
      metadata: {
        id: "vp-1",
        name: "t",
        durationUs: us(0),
        createdAt: "",
        updatedAt: "",
      },
      settings: {
        fps: 30,
        canvas: { width: 1920, height: 1080 },
        background: { type: "color" as const, color: "#000" },
      },
      scenes: [base],
      currentSceneId: base.id,
    }

    return applyOps({ document, revision: 0, lock: UNLOCKED }, ops, {
      author: "user",
    }).snapshot.document.scenes[0]
  }

  it("writes a look with no curve", () => {
    // A look is a decision about the whole shot. A clip that is black and white
    // for two seconds in the middle is a glitch, not a grade.
    const base = scene()
    const after = applyToScene(
      base,
      applyEffect(base, firstClip(base).id, "contrast")
    )

    const clip = firstClip(after)
    expect(clip.effects).toHaveLength(1)
    expect(clip.effects[0].type).toBe("contrast")
    expect(clip.effects[0].params.amount).toBe(1.2)
    expect(clip.animations.channels).toEqual({})
  })

  it("takes an amount when it is given one", () => {
    const base = scene()
    const after = applyToScene(
      base,
      applyEffect(base, firstClip(base).id, "blur", 12)
    )

    expect(firstClip(after).effects[0].params.intensity).toBe(12)
  })

  it("clamps an amount the effect cannot reach", () => {
    // A blur of -4 throws in CSS; 400% grayscale is not a stronger black.
    const base = scene()
    const after = applyToScene(
      base,
      applyEffect(base, firstClip(base).id, "grayscale", 4)
    )

    expect(firstClip(after).effects[0].params.amount).toBe(1)
  })

  it("replaces rather than stacking", () => {
    // Effects compose at render time, so a second brightness would land at 1.32
    // and nothing in the UI would say why. Asking twice looks like asking once.
    const base = scene()
    const once = applyToScene(
      base,
      applyEffect(base, firstClip(base).id, "brightness", 1.2)
    )
    const twice = applyToScene(
      once,
      applyEffect(once, firstClip(once).id, "brightness", 1.4)
    )

    expect(firstClip(twice).effects).toHaveLength(1)
    expect(firstClip(twice).effects[0].params.amount).toBe(1.4)
  })

  it("leaves other kinds of effect alone", () => {
    const base = scene()
    const zoomed = applyToScene(base, punchIn(base, firstClip(base).id))
    const graded = applyToScene(
      zoomed,
      applyEffect(zoomed, firstClip(zoomed).id, "sepia")
    )

    expect(
      firstClip(graded)
        .effects.map((e) => e.type)
        .sort()
    ).toEqual(["sepia", "zoom"])
    // The zoom's curve survives a grade landing on the same clip.
    expect(Object.keys(firstClip(graded).animations.channels)).toHaveLength(1)
  })

  it("takes the effect off when asked for its neutral value", () => {
    // Writing it would leave a chip that says "Contrast ×1.00" and changes not
    // one pixel — a control that appears to do something and does not.
    const base = scene()
    const graded = applyToScene(
      base,
      applyEffect(base, firstClip(base).id, "contrast", 1.5)
    )
    const back = applyToScene(
      graded,
      applyEffect(graded, firstClip(graded).id, "contrast", 1)
    )

    expect(firstClip(back).effects).toEqual([])
  })

  it("is not an edit for a clip that is not there", () => {
    const base = scene()

    expect(applyEffect(base, "ve-missing", "sepia")).toEqual([])
  })
})

describe("removeEffectsOfType", () => {
  function firstClip(base: Scene): VideoElement {
    return findMainTrack(base)!.elements[0] as VideoElement
  }

  it("has nothing to do when the clip carries none", () => {
    const base = scene()

    expect(removeEffectsOfType(base, firstClip(base).id, "blur")).toEqual([])
  })
})

describe("resizeEffect", () => {
  function firstClip(base: Scene): VideoElement {
    return findMainTrack(base)!.elements[0] as VideoElement
  }

  function applyToScene(base: Scene, ops: ReturnType<typeof punchIn>): Scene {
    const document = {
      version: 1,
      metadata: {
        id: "vp-1",
        name: "t",
        durationUs: us(0),
        createdAt: "",
        updatedAt: "",
      },
      settings: {
        fps: 30,
        canvas: { width: 1920, height: 1080 },
        background: { type: "color" as const, color: "#000" },
      },
      scenes: [base],
      currentSceneId: base.id,
    }

    return applyOps({ document, revision: 0, lock: UNLOCKED }, ops, {
      author: "user",
    }).snapshot.document.scenes[0]
  }

  function times(base: Scene): number[] {
    const clip = firstClip(base)
    return Object.values(clip.animations.channels)[0].keys.map((k) => k.timeUs)
  }

  /** A four-second push starting at one second: ramp, hold, ramp. */
  function pushed(): Scene {
    const base = scene()
    return applyToScene(
      base,
      punchIn(base, firstClip(base).id, {
        fromUs: secondsToUs(1),
        toUs: secondsToUs(5),
      })
    )
  }

  it("moves the end and leaves the start alone", () => {
    const before = pushed()
    const after = applyToScene(
      before,
      resizeEffect(
        before,
        firstClip(before).id,
        firstClip(before).effects[0].id,
        "end",
        secondsToUs(2)
      )
    )

    const [start, , , end] = times(after)
    expect(start).toBe(secondsToUs(1))
    expect(end).toBe(secondsToUs(7))
  })

  it("keeps the ramps and lets the hold absorb the change", () => {
    // The ramp is how the push feels. Stretching a two-second punch-in to four
    // should hold longer, not accelerate more slowly.
    const before = pushed()
    const rampBefore = times(before)[1] - times(before)[0]

    const after = applyToScene(
      before,
      resizeEffect(
        before,
        firstClip(before).id,
        firstClip(before).effects[0].id,
        "end",
        secondsToUs(3)
      )
    )

    const t = times(after)
    expect(t[1] - t[0]).toBe(rampBefore)
    expect(t[3] - t[2]).toBe(rampBefore)
  })

  it("moves the start and leaves the end alone", () => {
    const before = pushed()
    const after = applyToScene(
      before,
      resizeEffect(
        before,
        firstClip(before).id,
        firstClip(before).effects[0].id,
        "start",
        -secondsToUs(1)
      )
    )

    const t = times(after)
    expect(t[0]).toBe(0)
    expect(t[t.length - 1]).toBe(secondsToUs(5))
  })

  it("will not drag an edge off the clip", () => {
    const before = pushed()
    const after = applyToScene(
      before,
      resizeEffect(
        before,
        firstClip(before).id,
        firstClip(before).effects[0].id,
        "end",
        secondsToUs(60)
      )
    )

    // The clip is ten seconds. A curve running past it is a curve nothing
    // samples.
    expect(times(after)[3]).toBe(secondsToUs(10))
  })

  it("keeps the keys in order when squeezed shorter than its ramps", () => {
    // Two ramps that cross come out unordered, and sampleChannel walks rather
    // than sorts — so an unordered channel samples the wrong value silently.
    const before = pushed()
    const after = applyToScene(
      before,
      resizeEffect(
        before,
        firstClip(before).id,
        firstClip(before).effects[0].id,
        "end",
        -secondsToUs(3.8)
      )
    )

    const t = times(after)
    expect(t).toEqual([...t].sort((a, b) => a - b))
    expect(t[t.length - 1] - t[0]).toBeGreaterThanOrEqual(100_000)
  })

  it("refuses to collapse an effect to nothing", () => {
    const before = pushed()
    const after = applyToScene(
      before,
      resizeEffect(
        before,
        firstClip(before).id,
        firstClip(before).effects[0].id,
        "start",
        secondsToUs(10)
      )
    )

    const t = times(after)
    expect(t[t.length - 1] - t[0]).toBe(100_000)
  })

  it("is not an edit when the edge cannot move", () => {
    // Already at the clip's end: dragging further right is a revision that
    // changes nothing and still costs an undo.
    const base = scene()
    const full = applyToScene(base, punchIn(base, firstClip(base).id))

    expect(
      resizeEffect(
        full,
        firstClip(full).id,
        firstClip(full).effects[0].id,
        "end",
        secondsToUs(5)
      )
    ).toEqual([])
  })

  it("has nothing to resize on a fade", () => {
    // A fade has no effect id — it is a bare opacity channel — so there is
    // nothing here to look up.
    const base = scene()
    const faded = applyToScene(
      base,
      fade(base, firstClip(base).id, { inUs: secondsToUs(1) })
    )

    expect(
      resizeEffect(faded, firstClip(faded).id, "vfx-missing", "end", 1000)
    ).toEqual([])
  })
})

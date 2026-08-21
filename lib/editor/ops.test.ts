import { describe, expect, it } from "vitest"

import { createDocument, createSnapshot, createTrack } from "./document"
import {
  applyOps,
  DocumentLockedError,
  RevisionConflictError,
  type EditOp,
} from "./ops"
import { createProvenance, isAgentAuthored } from "./provenance"
import { secondsToUs, us, type Us } from "./time"
import type { ProjectSnapshot, VideoElement } from "./types"

const s = (seconds: number) => secondsToUs(seconds) as Us

function videoElement(overrides: Partial<VideoElement> = {}): VideoElement {
  return {
    kind: "video",
    id: "el-1",
    name: "clip",
    mediaId: "media-1",
    startUs: us(0),
    durationUs: s(10),
    trimStartUs: us(0),
    trimEndUs: s(10),
    sourceDurationUs: s(60),
    transform: { position: { x: 0, y: 0 }, scaleX: 1, scaleY: 1, rotate: 0 },
    opacity: 1,
    blendMode: "normal",
    volume: 1,
    muted: false,
    effects: [],
    animations: { channels: {} },
    provenance: createProvenance("user"),
    ...overrides,
  }
}

function project(): {
  snapshot: ProjectSnapshot
  sceneId: string
  trackId: string
} {
  const document = createDocument({ name: "Test" })
  const scene = document.scenes[0]
  const track = scene.tracks[0]
  return {
    snapshot: createSnapshot(document),
    sceneId: scene.id,
    trackId: track.id,
  }
}

function insert(
  sceneId: string,
  trackId: string,
  element: VideoElement
): EditOp {
  return { op: "insert_element", sceneId, trackId, element }
}

describe("applyOps revisions", () => {
  it("bumps the revision once for a batch, not once per op", () => {
    // Silence removal emits one cut per gap. A revision each would let the
    // client paint a half-cut timeline, clips sliding as more arrive.
    const { snapshot, sceneId, trackId } = project()

    const result = applyOps(
      snapshot,
      [
        insert(sceneId, trackId, videoElement({ id: "a" })),
        insert(sceneId, trackId, videoElement({ id: "b", startUs: s(10) })),
      ],
      { author: "agent" }
    )

    expect(result.snapshot.revision).toBe(1)
  })

  it("refuses a write based on a revision that has moved", () => {
    // The agent reads at the start of a run and writes at the end. Without
    // this, a slow run silently discards the drag you did while it thought.
    const { snapshot, sceneId, trackId } = project()
    const first = applyOps(
      snapshot,
      [insert(sceneId, trackId, videoElement())],
      {
        author: "user",
      }
    )

    expect(() =>
      applyOps(
        first.snapshot,
        [insert(sceneId, trackId, videoElement({ id: "b" }))],
        {
          author: "agent",
          expectedRevision: 0,
        }
      )
    ).toThrow(RevisionConflictError)
  })

  it("accepts a write that states the current revision", () => {
    const { snapshot, sceneId, trackId } = project()
    const result = applyOps(
      snapshot,
      [insert(sceneId, trackId, videoElement())],
      {
        author: "user",
        expectedRevision: 0,
      }
    )

    expect(result.snapshot.revision).toBe(1)
  })
})

describe("applyOps locking", () => {
  const locked = (snapshot: ProjectSnapshot): ProjectSnapshot => ({
    ...snapshot,
    lock: {
      status: "locked",
      runId: "run-1",
      lockedBy: "agent",
      startedAt: new Date().toISOString(),
    },
  })

  it("blocks an edit from outside the holding run", () => {
    const { snapshot, sceneId, trackId } = project()

    expect(() =>
      applyOps(locked(snapshot), [insert(sceneId, trackId, videoElement())], {
        author: "user",
      })
    ).toThrow(DocumentLockedError)
  })

  it("lets the holding run keep writing", () => {
    const { snapshot, sceneId, trackId } = project()

    const result = applyOps(
      locked(snapshot),
      [insert(sceneId, trackId, videoElement())],
      { author: "agent", runId: "run-1" }
    )

    expect(result.snapshot.revision).toBe(1)
  })
})

describe("provenance stamping", () => {
  it("marks only the field the op actually changed", () => {
    const { snapshot, sceneId, trackId } = project()
    const seeded = applyOps(
      snapshot,
      [insert(sceneId, trackId, videoElement())],
      {
        author: "user",
      }
    )

    const trimmed = applyOps(
      seeded.snapshot,
      [
        {
          op: "update_element",
          sceneId,
          trackId,
          elementId: "el-1",
          patch: { trimStartUs: s(2) },
        },
      ],
      { author: "agent" }
    )

    const element = trimmed.snapshot.document.scenes[0].tracks[0].elements[0]
    // The agent trimmed it; the user still owns where it sits. Undoing the
    // agent run must not move the clip the user placed.
    expect(element.provenance.fields).toEqual({ trimStartUs: "agent" })
    expect(element.provenance.createdBy).toBe("user")
  })

  it("does not stamp a write that changed nothing", () => {
    // Re-running the agent on an unchanged project would otherwise repaint the
    // whole timeline as its work.
    const { snapshot, sceneId, trackId } = project()
    const seeded = applyOps(
      snapshot,
      [insert(sceneId, trackId, videoElement())],
      {
        author: "user",
      }
    )

    const noop = applyOps(
      seeded.snapshot,
      [
        {
          op: "update_element",
          sceneId,
          trackId,
          elementId: "el-1",
          patch: { volume: 1 },
        },
      ],
      { author: "agent" }
    )

    const element = noop.snapshot.document.scenes[0].tracks[0].elements[0]
    expect(element.provenance.fields).toEqual({})
    expect(element.provenance.lastEditedBy).toBe("user")
    expect(isAgentAuthored(element.provenance)).toBe(false)
  })

  it("reaches one level into an object so a nudge is not a whole transform", () => {
    const { snapshot, sceneId, trackId } = project()
    const seeded = applyOps(
      snapshot,
      [insert(sceneId, trackId, videoElement())],
      {
        author: "user",
      }
    )

    const moved = applyOps(
      seeded.snapshot,
      [
        {
          op: "update_element",
          sceneId,
          trackId,
          elementId: "el-1",
          patch: {
            transform: {
              position: { x: 40, y: 0 },
              scaleX: 1,
              scaleY: 1,
              rotate: 0,
            },
          },
        },
      ],
      { author: "agent" }
    )

    const element = moved.snapshot.document.scenes[0].tracks[0].elements[0]
    expect(element.provenance.fields).toEqual({ "transform.position": "agent" })
  })
})

describe("element ordering", () => {
  it("keeps elements sorted by start however they arrive", () => {
    // Half the timeline's reads are a binary search over this array.
    const { snapshot, sceneId, trackId } = project()

    const result = applyOps(
      snapshot,
      [
        insert(sceneId, trackId, videoElement({ id: "late", startUs: s(10) })),
        insert(sceneId, trackId, videoElement({ id: "early", startUs: us(0) })),
      ],
      { author: "agent" }
    )

    expect(
      result.snapshot.document.scenes[0].tracks[0].elements.map((el) => el.id)
    ).toEqual(["early", "late"])
  })

  it("breaks a tie on id so saves do not reorder", () => {
    const { snapshot, sceneId, trackId } = project()

    const result = applyOps(
      snapshot,
      [
        insert(sceneId, trackId, videoElement({ id: "b", startUs: us(0) })),
        insert(sceneId, trackId, videoElement({ id: "a", startUs: us(0) })),
      ],
      { author: "agent" }
    )

    expect(
      result.snapshot.document.scenes[0].tracks[0].elements.map((el) => el.id)
    ).toEqual(["a", "b"])
  })
})

describe("document duration", () => {
  it("follows the longest track on the main scene", () => {
    const { snapshot, sceneId, trackId } = project()

    const result = applyOps(
      snapshot,
      [
        insert(
          sceneId,
          trackId,
          videoElement({ startUs: s(5), durationUs: s(10) })
        ),
      ],
      { author: "agent" }
    )

    expect(result.snapshot.document.metadata.durationUs).toBe(s(15))
  })

  it("shrinks when the elements go", () => {
    const { snapshot, sceneId, trackId } = project()
    const seeded = applyOps(
      snapshot,
      [insert(sceneId, trackId, videoElement())],
      {
        author: "agent",
      }
    )

    const emptied = applyOps(
      seeded.snapshot,
      [{ op: "remove_element", sceneId, trackId, elementId: "el-1" }],
      { author: "agent" }
    )

    expect(emptied.snapshot.document.metadata.durationUs).toBe(0)
  })
})

describe("replace_elements", () => {
  it("swaps a whole caption lane in one op", () => {
    // A few hundred word-by-word captions as a few hundred inserts would stream
    // a few hundred patches to redraw one lane.
    const { snapshot, sceneId } = project()
    const captionTrack = snapshot.document.scenes[0].tracks[1]

    const result = applyOps(
      snapshot,
      [
        {
          op: "replace_elements",
          sceneId,
          trackId: captionTrack.id,
          elements: [
            videoElement({ id: "one", startUs: us(0) }),
            videoElement({ id: "two", startUs: s(1) }),
          ],
        },
      ],
      { author: "agent" }
    )

    expect(result.snapshot.document.scenes[0].tracks[1].elements).toHaveLength(
      2
    )
    expect(result.touched.elementIds).toEqual(["one", "two"])
  })
})

describe("touched reporting", () => {
  it("names the tracks and elements the client must redraw", () => {
    const { snapshot, sceneId, trackId } = project()

    const result = applyOps(
      snapshot,
      [insert(sceneId, trackId, videoElement({ id: "a" }))],
      { author: "agent" }
    )

    expect(result.touched.trackIds).toEqual([trackId])
    expect(result.touched.elementIds).toEqual(["a"])
  })
})

describe("track ops", () => {
  it("adds a lane only when something needs one", () => {
    const { snapshot, sceneId } = project()

    const result = applyOps(
      snapshot,
      [{ op: "add_track", sceneId, track: createTrack("audio"), id: "music" }],
      { author: "agent" }
    )

    const kinds = result.snapshot.document.scenes[0].tracks.map((t) => t.kind)
    expect(kinds).toEqual(["video", "caption", "audio"])
  })

  it("mutes a lane without touching its elements", () => {
    const { snapshot, sceneId, trackId } = project()

    const result = applyOps(
      snapshot,
      [{ op: "update_track", sceneId, trackId, patch: { muted: true } }],
      { author: "user" }
    )

    expect(result.snapshot.document.scenes[0].tracks[0].muted).toBe(true)
  })
})

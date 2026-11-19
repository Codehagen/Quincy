import { describe, expect, it, vi } from "vitest"

import { ceilingCovers, dailyCeilingMicros } from "../chat-guards"
import { createRun, scopedTo } from "./agent"
import { createScene, LANDSCAPE_CANVAS, VERTICAL_CANVAS } from "./document"
import { applyOps, newEffect, newElement, type EditOp } from "./ops"
import { signOffer, verifyOffer } from "./self-check-server"
import { findMainTrack } from "./timeline"
import { secondsToUs, us } from "./time"
import {
  asksForThreeCuts,
  briefsFor,
  copyScene,
  pushInOnLine,
  recommend,
  threeCutsNeedMicros,
} from "./three-cuts"
import { UNLOCKED, type VideoDocument, type VideoElement } from "./types"

vi.mock("../db", () => ({ db: {} }))

function clip(): VideoElement {
  return newElement<VideoElement>(
    {
      kind: "video",
      name: "take.mp4",
      mediaId: "va-1",
      startUs: us(0),
      durationUs: secondsToUs(10),
      trimStartUs: us(0),
      trimEndUs: secondsToUs(10),
      sourceDurationUs: secondsToUs(10),
      transform: { position: { x: 0, y: 0 }, scaleX: 1, scaleY: 1, rotate: 0 },
      opacity: 1,
      blendMode: "normal",
      volume: 1,
      muted: false,
      effects: [],
      animations: { channels: {} },
    },
    "user"
  )
}

function document(): VideoDocument {
  const scene = createScene({ canvas: LANDSCAPE_CANVAS })
  findMainTrack(scene)!.elements = [clip()]
  return {
    version: 1,
    metadata: { id: "vp-1", name: "t", durationUs: us(0), createdAt: "", updatedAt: "" },
    settings: { fps: 30, canvas: LANDSCAPE_CANVAS, background: { type: "color", color: "#000" } },
    scenes: [scene],
    currentSceneId: scene.id,
  }
}

const apply = (doc: VideoDocument, ops: EditOp[]) =>
  applyOps({ document: doc, revision: 0, lock: UNLOCKED }, ops, { author: "agent" }).snapshot.document

describe("the scene ops", () => {
  it("adds a scene once, selects it, and removing it falls back to the main scene", () => {
    const doc = document()
    const copy = copyScene(doc.scenes[0], "vs-a", "Cut A")
    const added = apply(doc, [{ op: "add_scene", scene: copy }, { op: "add_scene", scene: copy }, { op: "select_scene", sceneId: "vs-a" }])
    expect(added.scenes.map((s) => s.id)).toEqual([doc.scenes[0].id, "vs-a"])
    expect(added.scenes[1].isMain).toBe(false)
    expect(added.currentSceneId).toBe("vs-a")

    const removed = apply(added, [{ op: "remove_scene", sceneId: "vs-a" }])
    expect(removed.scenes).toHaveLength(1)
    expect(removed.currentSceneId).toBe(doc.scenes[0].id)
    // The main scene never goes.
    expect(apply(removed, [{ op: "remove_scene", sceneId: doc.scenes[0].id }]).scenes).toHaveLength(1)
  })
})

describe("a sub-run's view of the shared run", () => {
  it("sees its own scene as current and tags every commit with it", () => {
    const doc = apply(document(), [{ op: "add_scene", scene: copyScene(document().scenes[0], "vs-b", "Cut B") }])
    const sent: (string | undefined)[] = []
    const run = createRun({
      initial: { document: doc, revision: 0, lock: UNLOCKED },
      runId: "run-1",
      onCommit: (_ops, meta) => sent.push(meta?.sceneId),
      loadWords: async () => null,
    })
    const scoped = scopedTo(run, "vs-b")
    expect(scoped.snapshot().document.currentSceneId).toBe("vs-b")
    expect(run.snapshot().document.currentSceneId).toBe(doc.currentSceneId)
    scoped.commit([{ op: "update_scene", sceneId: "vs-b", patch: { canvas: VERTICAL_CANVAS } }], { toolName: "reframe" })
    expect(sent).toEqual(["vs-b"])
    expect(run.snapshot().document.scenes[1].canvas).toEqual(VERTICAL_CANVAS)
  })
})

describe("money", () => {
  it("estimates three runs at the step cap plus three checks, and refuses what the day cannot cover", () => {
    const need = threeCutsNeedMicros({ runModel: "anthropic/claude-sonnet-5", checkModel: "openai/gpt-5.6-luna", maxSteps: 8 })
    expect(need).toBeGreaterThan(0)
    expect(ceilingCovers(0, need).ok).toBe(true)
    expect(ceilingCovers(dailyCeilingMicros() - need + 1, need).ok).toBe(false)
    expect(ceilingCovers(dailyCeilingMicros(), 1).ok).toBe(false)
  })
})

describe("the briefs and the recommendation", () => {
  it("knows a three-cuts request", () => {
    expect(asksForThreeCuts("Make three cuts")).toBe(true)
    expect(asksForThreeCuts("give me 3 versions")).toBe(true)
    expect(asksForThreeCuts("tighten the cuts")).toBe(false)
  })

  it("writes three briefs with a place, a hook and a length no longer than the take", () => {
    const briefs = briefsFor({ durationUs: secondsToUs(20), firstLine: "Hi there.", strongLine: "This changed it." })
    expect(briefs.map((b) => b.letter)).toEqual(["A", "B", "C"])
    expect(briefs[0].hook).toBe("This changed it.")
    expect(briefs.map((b) => b.lengthS)).toEqual([20, 20, 15])
  })

  it("recommends in words, naming the push-in on the strong line where the cut has one", () => {
    const scene = copyScene(document().scenes[0], "vs-a", "Cut A")
    scene.canvas = VERTICAL_CANVAS
    const spine = findMainTrack(scene)!
    spine.elements = [{ ...(spine.elements[0] as VideoElement), effects: [newEffect("zoom", { scale: 1.3 })] }]
    const words = [{ text: "This", startUs: secondsToUs(0.8), endUs: secondsToUs(1), confidence: 1 }]
    expect(pushInOnLine(scene, words, "This changed it.")).toBe(secondsToUs(0.8))

    const [a, b] = briefsFor({ durationUs: secondsToUs(10), firstLine: null, strongLine: "This changed it." })
    const pick = recommend([{ brief: a, scene, landed: true }, { brief: b, scene, landed: true }], words)
    expect(pick?.letter).toBe("A")
    expect(pick?.reason).toBe(
      "I would post A first: it runs 0:10.0, inside the 10 s Reels and TikTok wants, framed 9:16 and it pushes in on the strong line at 0:00.8."
    )
    expect(pick?.reason).not.toMatch(/\d+\s*\/\s*\d+|score/i)
    expect(recommend([{ brief: a, scene, landed: false }, { brief: b, scene, landed: true }], words)?.letter).toBe("B")
  })
})

describe("the check offer", () => {
  it("carries the cut it was made for, signed with the rest", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "test-secret")
    const offer = verifyOffer(signOffer("vp-1", "run-1-A", Date.now(), "vs-a"))
    expect(offer?.sceneId).toBe("vs-a")
    expect(verifyOffer(signOffer("vp-1", "run-1"))?.sceneId).toBeNull()
    const forged = signOffer("vp-1", "run-1-A", Date.now(), "vs-a").replace("vs-a", "vs-b")
    expect(verifyOffer(forged)).toBeNull()
  })
})

import { describe, expect, it } from "vitest"

import { createRun, describeScene, editorTools } from "./agent"
import { EDITOR_TOOL_SENTENCES } from "./turn-sentences"
import { planTurn } from "@/lib/studio-turn"
import { createScene, LANDSCAPE_CANVAS, VERTICAL_CANVAS } from "./document"
import { applyToScene, newElement, targetInScene, type EditOp } from "./ops"
import { findMainTrack } from "./timeline"
import { secondsToUs, us } from "./time"
import type { Word } from "./transcript"
import {
  UNLOCKED,
  type ProjectSnapshot,
  type Scene,
  type VideoDocument,
  type VideoElement,
} from "./types"

/**
 * The tools, exercised without a model.
 *
 * A tool is a pure function of (snapshot, arguments) to ops and a sentence, so
 * everything worth testing about the agent's hands is testable here: whether it
 * edits the document it was given, whether it tells the truth when it changed
 * nothing, and whether what it says back is something a model can act on. What
 * is left for a real run is the model's judgment, which no assertion covers.
 */

const WORDS: Word[] = [
  ["one", 5, 5.4],
  ["two", 5.4, 5.8],
  ["three", 11, 11.4],
  ["four", 11.4, 12],
].map(([text, start, end]) => ({
  text: text as string,
  startUs: secondsToUs(start as number),
  endUs: secondsToUs(end as number),
  confidence: 0.99,
}))

function scene(): Scene {
  const base = createScene({})
  const main = findMainTrack(base)!

  main.elements = [
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

function snapshot(base = scene()): ProjectSnapshot {
  const document: VideoDocument = {
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
      canvas: LANDSCAPE_CANVAS,
      background: { type: "color", color: "#000" },
    },
    scenes: [base],
    currentSceneId: base.id,
  }

  return { document, revision: 3, lock: UNLOCKED }
}

function harness(options: { words?: Word[] | null; base?: Scene } = {}) {
  const streamed: EditOp[][] = []

  const run = createRun({
    initial: snapshot(options.base),
    runId: "run-1",
    onCommit: (ops) => streamed.push(ops),
    loadWords: async () => options.words ?? null,
  })

  return { run, tools: editorTools(run), streamed }
}

/** Tools are typed as the SDK's Tool, whose execute is optional and generic. */
const call = async (tool: unknown, input: unknown): Promise<string> => {
  const execute = (
    tool as { execute: (input: unknown, options: unknown) => unknown }
  ).execute
  return String(await execute(input, {}))
}

const spineOf = (run: ReturnType<typeof harness>["run"]) =>
  findMainTrack(run.snapshot().document.scenes[0])!.elements

describe("editorTools", () => {
  it("edits the working snapshot rather than the one it started from", () => {
    const { run, tools } = harness()
    const before = run.snapshot()

    return call(tools.split_clip, { atSeconds: 20 }).then(() => {
      expect(spineOf(run)).toHaveLength(2)
      // The initial snapshot is untouched — the run holds its own copy, which
      // is what lets the save at the end state the revision it read.
      expect(findMainTrack(before.document.scenes[0])!.elements).toHaveLength(1)
    })
  })

  it("streams every op batch it applies", async () => {
    const { tools, streamed } = harness()

    await call(tools.split_clip, { atSeconds: 20 })
    await call(tools.reframe, { shape: "vertical" })

    expect(streamed).toHaveLength(2)
    expect(streamed[1][0].op).toBe("update_scene")
  })

  it("sees its own last edit", async () => {
    // A run is a sequence of steps that each need the previous one's result.
    // Reading the row back between steps would be a query per tool call; this
    // is the property that makes the working snapshot worth having.
    const { run, tools } = harness()

    await call(tools.split_clip, { atSeconds: 20 })
    await call(tools.split_clip, { atSeconds: 40 })

    expect(spineOf(run)).toHaveLength(3)
  })

  it("says it changed nothing when it changed nothing", async () => {
    const { tools, streamed } = harness()

    // A boundary, not inside a clip: splitAt refuses, because a zero-length
    // clip cannot be rendered or selected.
    const said = await call(tools.split_clip, { atSeconds: 0 })

    expect(said).toMatch(/nothing to split/i)
    expect(streamed).toHaveLength(0)
  })

  it("fills the new frame unless asked to show the whole picture", async () => {
    // A canvas change alone leaves the clips at `contain`: a wide take drawn
    // as a strip with bars inside 9:16, which reads as no reframe at all.
    const filled = harness()
    await call(filled.tools.reframe, { shape: "vertical" })
    expect(spineOf(filled.run).every((clip) => (clip as { fit?: string }).fit === "cover")).toBe(true)

    const whole = harness()
    await call(whole.tools.reframe, { shape: "vertical", show: "whole" })
    expect(spineOf(whole.run).some((clip) => (clip as { fit?: string }).fit === "cover")).toBe(false)
  })

  it("does not claim a reframe it did not perform", async () => {
    const { tools } = harness({
      base: { ...scene(), canvas: VERTICAL_CANVAS },
    })

    expect(await call(tools.reframe, { shape: "vertical" })).toMatch(
      /already vertical/i
    )
  })

  it("reports a missing transcript instead of failing", async () => {
    const { tools, streamed } = harness({ words: null })

    expect(await call(tools.remove_silences, {})).toMatch(
      /not been transcribed/i
    )
    expect(streamed).toHaveLength(0)
  })

  it("tightens and reports the new length", async () => {
    const { run, tools } = harness({ words: WORDS })

    const said = await call(tools.remove_silences, {})

    expect(said).toMatch(/^Tightened: removed /)
    expect(spineOf(run).length).toBeGreaterThan(1)
  })

  it("honours a silence threshold it is given", async () => {
    // Every gap in WORDS is either zero or five seconds, so a threshold above
    // five leaves the head and tail as the only cuts.
    const loose = harness({ words: WORDS })
    const tight = harness({ words: WORDS })

    await call(loose.tools.remove_silences, { minSilenceMs: 6000 })
    await call(tight.tools.remove_silences, { minSilenceMs: 350 })

    expect(spineOf(loose.run).length).toBeLessThan(spineOf(tight.run).length)
  })

  it("builds captions from the transcript", async () => {
    const { run, tools } = harness({ words: WORDS })

    const said = await call(tools.add_captions, {})
    const captions = run
      .snapshot()
      .document.scenes[0].tracks.find((track) => track.kind === "caption")

    expect(said).toMatch(/^Captions on\./)
    expect(captions?.elements).toHaveLength(WORDS.length)
  })

  it("credits its edits to the agent", async () => {
    // Provenance per field is what lets a run be undone without taking the
    // user's own work with it. A tool that stamped the user would make its own
    // cuts indistinguishable from theirs.
    const { run, tools } = harness()

    await call(tools.split_clip, { atSeconds: 20 })

    for (const element of spineOf(run)) {
      expect(element.provenance.createdBy).toBe("agent")
    }
  })

  it("deletes by the number describe_timeline gave it", async () => {
    const { run, tools } = harness()

    await call(tools.split_clip, { atSeconds: 20 })
    await call(tools.delete_clip, { clipNumber: 1 })

    const spine = spineOf(run)
    expect(spine).toHaveLength(1)
    // Ripple: what is left starts at zero rather than where it used to be.
    expect(spine[0].startUs).toBe(0)
  })

  it("refuses a clip number that is not there", async () => {
    const { tools, streamed } = harness()

    expect(await call(tools.delete_clip, { clipNumber: 9 })).toMatch(
      /no clip 9/i
    )
    expect(streamed).toHaveLength(0)
  })
})

describe("describeScene", () => {
  it("reads as something a model can act on", () => {
    const said = describeScene(scene())

    expect(said).toContain("1:00")
    expect(said).toContain("1 clip")
    expect(said).toMatch(/no captions/i)
  })

  it("names the frame once one has been chosen", () => {
    expect(describeScene({ ...scene(), canvas: VERTICAL_CANVAS })).toContain(
      "vertical (9:16)"
    )
  })

  it("lists clip boundaries while there are few enough to be useful", () => {
    expect(describeScene(scene())).toContain("Clips: 1) 0:00–1:00")
  })
})

describe("createRun", () => {
  it("loads the transcript once, however many tools ask", async () => {
    let loads = 0

    const run = createRun({
      initial: snapshot(),
      runId: "run-1",
      onCommit: () => {},
      loadWords: async () => {
        loads++
        return WORDS
      },
    })

    const tools = editorTools(run)
    await call(tools.add_captions, {})
    await call(tools.remove_silences, {})

    expect(loads).toBe(1)
  })

  it("knows whether anything actually happened", async () => {
    const { run, tools } = harness()

    expect(run.touched()).toBe(false)
    await call(tools.split_clip, { atSeconds: 0 })
    // Refused, so there is nothing to save and the run must not write.
    expect(run.touched()).toBe(false)

    await call(tools.split_clip, { atSeconds: 20 })
    expect(run.touched()).toBe(true)
  })
})

describe("remove_silences reporting", () => {
  it("states how much of the take it removed", async () => {
    // Arithmetic, not the model's judgment. A recording with two words of
    // speech in fifteen seconds tightens to two, which is the tool working
    // exactly as asked — and "Tightened." alone reads as a routine pass.
    const { tools } = harness({ words: WORDS })

    const said = await call(tools.remove_silences, {})

    expect(said).toMatch(/removed \d+\.\d+s of 60\.0s \(\d+%\)/)
  })

  it("flags a cut that takes most of the footage", async () => {
    const { tools } = harness({ words: WORDS })

    // WORDS holds seven seconds of speech inside a sixty second take, so this
    // removes well over half and the tool has to say so on its own.
    expect(await call(tools.remove_silences, {})).toMatch(
      /most of the recording/i
    )
  })
})

describe("the editor chat's words for each tool", () => {
  it("has a sentence for every tool the run registers", () => {
    const { tools } = harness()
    expect(Object.keys(EDITOR_TOOL_SENTENCES).sort()).toEqual(
      Object.keys(tools).sort()
    )
  })

  it("draws a finished cut as a done step in Quincy's words", () => {
    const [block] = planTurn(
      [
        {
          type: "tool-remove_silences",
          toolCallId: "t1",
          state: "output-available",
          input: {},
          output: "Tightened: removed 4s of 30s (13%).",
        },
      ] as unknown as Parameters<typeof planTurn>[0],
      { sentences: EDITOR_TOOL_SENTENCES }
    )
    expect(block).toMatchObject({
      kind: "work",
      steps: [{ kind: "step", state: "done", label: "Removed the silences" }],
    })
  })
})

describe("targets on the stream (plans/036)", () => {
  it("every batch a tool streams is aimed at something in the scene it lands on", async () => {
    const { run, tools, streamed } = harness({ words: WORDS })
    let current = run.snapshot().document.scenes[0]

    await call(tools.remove_silences, {})
    await call(tools.add_captions, {})
    await call(tools.split_clip, { atSeconds: 1 })
    await call(tools.punch_in, { clipNumber: 1 })
    await call(tools.apply_look, { look: "brightness" })
    await call(tools.fade_clip, { clipNumber: 1, inSeconds: 0.5 })
    await call(tools.reframe, { shape: "vertical" })
    await call(tools.delete_clip, { clipNumbers: [2] })

    expect(streamed.length).toBeGreaterThan(8)
    for (const batch of streamed) {
      for (const op of batch) {
        expect(op.target).toBeDefined()
        expect(targetInScene(current, op.target!)).toBe(true)
      }
      current = applyToScene(current, batch, "agent")
    }
  })

  it("tightens one pause per streamed batch", async () => {
    const { tools, streamed } = harness({ words: WORDS })
    await call(tools.remove_silences, {})
    // Head, the gap between "two" and "three", and the tail.
    expect(streamed).toHaveLength(3)
    expect(streamed.every((batch) => batch[0].target?.action === "cut")).toBe(true)
  })
})

describe("remove_silences input", () => {
  it("refuses a negative padding and a minimum under 250 ms", () => {
    const run = createRun({
      initial: {
        document: {
          version: 1,
          metadata: { id: "p", name: "", durationUs: us(0), createdAt: "", updatedAt: "" },
          settings: { fps: 30, canvas: { width: 1, height: 1 }, background: { type: "color", color: "#000" } },
          scenes: [createScene({})],
          currentSceneId: "",
        },
        revision: 0,
        lock: { status: "unlocked", runId: null, lockedBy: null, startedAt: null },
      },
      runId: "r",
      onCommit: () => {},
      loadWords: async () => null,
    })
    // The schema is the zod object the tool was built with.
    const schema = editorTools(run).remove_silences.inputSchema as unknown as {
      safeParse: (value: unknown) => { success: boolean }
    }
    expect(schema.safeParse({ paddingMs: -50 }).success).toBe(false)
    expect(schema.safeParse({ minSilenceMs: 100 }).success).toBe(false)
    expect(schema.safeParse({ minSilenceMs: 250, paddingMs: 0 }).success).toBe(true)
  })
})


describe("remove_fillers", () => {
  // "um" and "øh" go; "liksom" stays unless named. Gaps are short, so no
  // pause goes with a filler and every cut is the filler and its padding.
  const SPOKEN: Word[] = [
    ["So", 1, 1.3],
    ["um,", 1.4, 1.7],
    ["this", 1.8, 2.1],
    ["liksom", 2.2, 2.5],
    ["works.", 2.6, 3],
    ["Øh,", 3.1, 3.4],
    ["yes.", 3.5, 3.9],
  ].map(([text, start, end]) => ({
    text: text as string,
    startUs: secondsToUs(start as number),
    endUs: secondsToUs(end as number),
    confidence: 0.99,
  }))

  const captionTexts = (run: ReturnType<typeof harness>["run"]) =>
    run
      .snapshot()
      .document.scenes[0].tracks.find((track) => track.kind === "caption")!
      .elements.map((element) => element.name)

  it("cuts the sounds, keeps the words and the captions, and says which went", async () => {
    const { run, tools, streamed } = harness({ words: SPOKEN })
    await call(tools.add_captions, {})
    const before = streamed.length

    const said = await call(tools.remove_fillers, {})

    expect(said.split("\n")[0]).toBe("Removed 2 fillers: um, øh · 0.8 s")
    // One press per filler, each a cut on a range the cursor can drag across.
    const cuts = streamed.slice(before)
    expect(cuts).toHaveLength(2)
    expect(cuts.every((batch) => batch[0].target?.action === "cut" && batch[0].target.kind === "range")).toBe(true)
    // Captions moved with the cut: every word that stayed is still on the lane.
    expect(captionTexts(run)).toEqual(expect.arrayContaining(["So", "this", "liksom", "works.", "yes."]))
  })

  it("cuts liksom only when it is named", async () => {
    const { tools } = harness({ words: SPOKEN })
    const said = await call(tools.remove_fillers, { alsoCut: ["liksom"] })
    expect(said.split("\n")[0]).toBe("Removed 3 fillers: liksom, um, øh · 1.2 s")
  })

  it("refuses a word that is not on the filler lists", () => {
    const run = createRun({ initial: snapshot(), runId: "r", onCommit: () => {}, loadWords: async () => null })
    const schema = editorTools(run).remove_fillers.inputSchema as unknown as {
      safeParse: (value: unknown) => { success: boolean }
    }
    expect(schema.safeParse({ alsoCut: ["works"] }).success).toBe(false)
    expect(schema.safeParse({ alsoCut: ["altså"] }).success).toBe(true)
  })

  it("says so and changes nothing when there is no filler, or no transcript", async () => {
    const clean = harness({ words: WORDS })
    expect(await call(clean.tools.remove_fillers, {})).toMatch(/no filler sounds/i)
    expect(clean.streamed).toHaveLength(0)

    const none = harness({ words: null })
    expect(await call(none.tools.remove_fillers, {})).toMatch(/not been transcribed/i)
    expect(none.streamed).toHaveLength(0)
  })

  it("aims every batch at something in the scene it lands on", async () => {
    const { run, tools, streamed } = harness({ words: SPOKEN })
    let current = run.snapshot().document.scenes[0]
    await call(tools.remove_fillers, {})
    expect(streamed.length).toBeGreaterThan(0)
    for (const batch of streamed) {
      for (const op of batch) expect(targetInScene(current, op.target!)).toBe(true)
      current = applyToScene(current, batch, "agent")
    }
  })
})

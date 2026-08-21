import { describe, expect, it } from "vitest"

import { createRun, describeScene, editorTools } from "./agent"
import { createScene, LANDSCAPE_CANVAS, VERTICAL_CANVAS } from "./document"
import { newElement, type EditOp } from "./ops"
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

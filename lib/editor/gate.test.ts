import { describe, expect, it } from "vitest"

import { deleteClipSteps, dryRun, editorTools, createRun } from "./agent"
import { createScene } from "./document"
import { EXEMPT_TOOLS, GATED_TOOLS, gateReason, gateVerdict, spokenSentences } from "./gate"
import { newElement } from "./ops"
import { findMainTrack } from "./timeline"
import { secondsToUs, us } from "./time"
import { addCaptions, removeSilenceSteps } from "./tools"
import type { Word } from "./transcript"
import type { Scene, VideoElement } from "./types"

/**
 * The gate (plans/036, step 6), on fixtures: a twenty-second take cut into
 * four clips at its sentence boundaries, so a clip number is a sentence.
 *
 *   0–4 s   "Hi there."           clip 1
 *   4–9 s   "Um."                 clip 2 (a filler on its own)
 *   9–12 s  "This part matters."  clip 3
 *   12–20 s "And this is the end of it, with a long pause after."  clip 4
 */
const SPOKEN: [string, number, number][] = [
  ["Hi", 0.5, 0.9],
  ["there.", 0.9, 1.4],
  ["Um.", 5, 5.4],
  ["This", 9.2, 9.5],
  ["part", 9.5, 9.8],
  ["matters.", 9.8, 10.4],
  ["And", 12.2, 12.4],
  ["this", 12.4, 12.6],
  ["is", 12.6, 12.8],
  ["the", 12.8, 13],
  ["end", 13, 13.3],
  ["of", 13.3, 13.5],
  ["it,", 13.5, 13.8],
  ["with", 13.8, 14],
  ["a", 14, 14.1],
  ["long", 14.1, 14.4],
  ["pause", 14.4, 14.8],
  ["after.", 14.8, 15.3],
]

const WORDS: Word[] = SPOKEN.map(([text, start, end]) => ({
  text,
  startUs: secondsToUs(start),
  endUs: secondsToUs(end),
  confidence: 1,
}))

const BOUNDS = [0, 4, 9, 12, 20]

function take(): Scene {
  const base = createScene({})
  findMainTrack(base)!.elements = BOUNDS.slice(0, -1).map((from, index) =>
    newElement<VideoElement>(
      {
        kind: "video",
        name: "take.mp4",
        mediaId: "va-1",
        startUs: secondsToUs(from),
        durationUs: secondsToUs(BOUNDS[index + 1] - from),
        trimStartUs: secondsToUs(from),
        trimEndUs: secondsToUs(BOUNDS[index + 1]),
        sourceDurationUs: secondsToUs(20),
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
  )
  return base
}

/** One take, and the verdict on what `plan` would do to it. */
const verdict = (toolName: string, plan: (base: Scene) => ReturnType<typeof deleteClipSteps>) => {
  const before = take()
  return gateVerdict({ toolName, before, steps: plan(before), words: WORDS })
}

describe("the gate", () => {
  it("lets a pause-only tighten through, however much it removes", () => {
    const plan = (b: Scene) =>
      removeSilenceSteps(b, WORDS, { mediaId: "va-1", author: "agent", sourceDurationUs: secondsToUs(20) })
    expect(plan(take()).length).toBeGreaterThan(0)
    expect(verdict("remove_silences", plan)).toEqual({ ask: false })
  })

  it("lets captions through", () => {
    expect(verdict("add_captions", (b) => [addCaptions(b, WORDS, { mediaId: "va-1", author: "agent" })])).toEqual({
      ask: false,
    })
  })

  it("asks before a cut that removes more than 30 % of the take", () => {
    // Clip 4 is 8 of 20 seconds: 40 %, and it holds a whole sentence too.
    const result = verdict("delete_clip", (b) => deleteClipSteps(b, [4]))
    expect(result).toMatchObject({ ask: true, percent: 40, sentences: 1 })
    if (result.ask) {
      expect(result.reason).toBe("This removes 1 spoken sentence and 40 % of the take, so I ask first.")
    }
  })

  it("asks on the share alone when there is no transcript (41 %)", () => {
    const base = take()
    // Cut 0–8.2 s of 20: 41 %.
    const split = applySplit(base, 8.2)
    const steps = deleteClipSteps(split, [1, 2])
    const result = gateVerdict({ toolName: "delete_clip", before: split, steps, words: null })
    expect(result).toMatchObject({ ask: true, percent: 41, sentences: 0 })
    if (result.ask) expect(result.reason).toBe("This removes 41 % of the take, so I ask first.")
  })

  it("asks before removing one whole spoken sentence, however short", () => {
    // Clip 3 is 3 of 20 seconds (15 %) and is exactly "This part matters."
    const result = verdict("delete_clip", (b) => deleteClipSteps(b, [3]))
    expect(result).toMatchObject({ ask: true, sentences: 1, percent: 15 })
    if (result.ask) expect(result.reason).toBe("This removes 1 spoken sentence, so I ask first.")
  })

  it("does not count a filler as a sentence", () => {
    // Clip 2 is 5 of 20 seconds (25 %) and holds only "Um."
    expect(verdict("delete_clip", (b) => deleteClipSteps(b, [2]))).toEqual({ ask: false })
  })

  it("asks on the first run too when the edit is large", () => {
    expect(verdict("delete_clip", (b) => deleteClipSteps(b, [3, 4])).ask).toBe(true)
  })

  it("dry-runs the same builder the tool executes", async () => {
    const before = take()
    const planned = dryRun("delete_clip", { clipNumbers: [3, 4] }, before)!

    const streamed: unknown[] = []
    const run = createRun({
      initial: {
        document: {
          version: 1,
          metadata: { id: "p", name: "t", durationUs: us(0), createdAt: "", updatedAt: "" },
          settings: { fps: 30, canvas: { width: 1920, height: 1080 }, background: { type: "color", color: "#000" } },
          scenes: [before],
          currentSceneId: before.id,
        },
        revision: 0,
        lock: { status: "unlocked", runId: null, lockedBy: null, startedAt: null },
      },
      runId: "r",
      onCommit: (ops) => streamed.push(ops),
      loadWords: async () => WORDS,
    })
    const tools = editorTools(run)
    await (tools.delete_clip as unknown as { execute: (i: unknown, o: unknown) => Promise<string> }).execute(
      { clipNumbers: [3, 4] },
      { toolCallId: "c1" }
    )

    // Same number of presses, same targets, in the same order.
    expect(streamed).toHaveLength(planned.length)
    expect((streamed as typeof planned).map((ops) => ops[0].target)).toEqual(planned.map((ops) => ops[0].target))
  })

  it("places every tool: exempt by kind, or measured", () => {
    const run = createRun({
      initial: { document: { version: 1, metadata: { id: "p", name: "", durationUs: us(0), createdAt: "", updatedAt: "" }, settings: { fps: 30, canvas: { width: 1, height: 1 }, background: { type: "color", color: "#000" } }, scenes: [take()], currentSceneId: "" }, revision: 0, lock: { status: "unlocked", runId: null, lockedBy: null, startedAt: null } },
      runId: "r",
      onCommit: () => {},
      loadWords: async () => null,
    })
    for (const name of Object.keys(editorTools(run))) {
      expect(EXEMPT_TOOLS.has(name) !== GATED_TOOLS.has(name)).toBe(true)
    }
  })
})

describe("spokenSentences", () => {
  it("ends a sentence at its punctuation and drops fillers", () => {
    const sentences = spokenSentences(WORDS).map((s) => s.map((w) => w.text).join(" "))
    expect(sentences).toEqual([
      "Hi there.",
      "This part matters.",
      "And this is the end of it, with a long pause after.",
    ])
  })
})

describe("gateReason", () => {
  it("names both reasons when both apply", () => {
    expect(gateReason(3, 40)).toBe("This removes 3 spoken sentences and 40 % of the take, so I ask first.")
  })
})

/** Split the one clip holding `seconds` there, so a delete can cut at it. */
function applySplit(base: Scene, seconds: number): Scene {
  const spine = findMainTrack(base)!
  const index = BOUNDS.findIndex((bound, i) => seconds > bound && seconds < BOUNDS[i + 1])
  const clip = spine.elements[index] as VideoElement
  const at = secondsToUs(seconds)
  const left = { ...clip, durationUs: us(at - clip.startUs), trimEndUs: at }
  const right = { ...clip, id: `${clip.id}-b`, startUs: at, durationUs: us(clip.startUs + clip.durationUs - at), trimStartUs: at }
  spine.elements = [...spine.elements.slice(0, index), left, right, ...spine.elements.slice(index + 1)]
  return base
}

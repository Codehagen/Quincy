import type { LanguageModel } from "ai"

import { paceOf, wordDeltas, type ModelPace } from "./pace"
import type { CheckVerdict } from "./self-check"
import { findMainTrack, sceneDurationUs } from "./timeline"
import type { Scene } from "./types"

/**
 * A scripted stand-in for the cutting model, for development only.
 *
 * The agent route calls a real model, and a real model costs money on every
 * press. Watching Quincy's cursor work needs the run's stream, not the model's
 * judgment, so this plays the model's part from a short script: the request's
 * words pick the tool calls, the real tools build the real ops against the real
 * project, the real gate decides, and the stream reaching the browser is the
 * one a live run sends. Nothing here calls out, so nothing is metered.
 *
 * The route uses it only when `NODE_ENV !== "production"` and the request asks
 * for it (`?replay=1`). Production never constructs it.
 *
 * The script: "tighten" / "pauses" → remove_silences; "captions" →
 * add_captions; "under N s" → delete_clip on clips from the end until the cut
 * fits (the request the gate is built for); "vertical" → reframe; "push in" /
 * "zoom" → punch_in on clip 1; "square" → reframe square; "phrase" makes
 * captions three words a segment; "fade in" → fade_clip on clip 1. The three
 * cuts' briefs (three-cuts.ts) are written in these words, so a three-cuts
 * replay plays all three sub-runs. After the tools answer it writes one line.
 */

type V4 = Extract<LanguageModel, { specificationVersion: "v4" }>
type CallOptions = Parameters<V4["doStream"]>[0]
type StreamPart = Awaited<ReturnType<V4["doStream"]>>["stream"] extends ReadableStream<infer P>
  ? P
  : never

const usage = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
}

export function replayModel(
  scene: Scene | undefined,
  { pace = "realistic", seed = 1 }: { pace?: ModelPace; seed?: number } = {}
): V4 {
  let calls = 0
  const timing = paceOf(pace, seed)
  const sleep = (ms: number, signal?: AbortSignal) =>
    new Promise<void>((resolve) => {
      if (ms <= 0 || signal?.aborted) return resolve()
      const timer = setTimeout(resolve, ms)
      signal?.addEventListener("abort", () => {
        clearTimeout(timer)
        resolve()
      })
    })

  return {
    specificationVersion: "v4",
    provider: "quincy-replay",
    modelId: "replay",
    supportedUrls: {},
    doGenerate: async () => {
      throw new Error("The replay model only streams.")
    },
    doStream: async (options: CallOptions) => {
      calls++
      const first = calls === 1
      const parts = respond(options, scene, calls)
      return {
        stream: new ReadableStream<StreamPart>({
          async start(controller) {
            controller.enqueue({ type: "stream-start", warnings: [] })
            // The model reads before it answers: a think on the first
            // step, a shorter step after the tools have answered.
            await sleep(first ? timing.thinkMs : timing.betweenMs(), options.abortSignal)
            let tools = 0
            for (const part of parts) {
              if (part.type === "tool-call" && tools++ > 0) {
                await sleep(timing.betweenMs(), options.abortSignal)
              } else {
                await sleep(timing.partMs, options.abortSignal)
              }
              if (part.type === "text-delta") {
                for (const delta of wordDeltas(part.delta)) {
                  if (options.abortSignal?.aborted) break
                  controller.enqueue({ ...part, delta })
                  await sleep(timing.wordMs, options.abortSignal)
                }
                continue
              }
              controller.enqueue(part)
            }
            controller.close()
          },
        }),
      }
    },
  } as V4
}

function respond(
  options: CallOptions,
  scene: Scene | undefined,
  call: number
): StreamPart[] {
  const last = options.prompt.at(-1)

  // The tools have answered (or the person said no): one line, and stop.
  if (last?.role === "tool") {
    const denied = last.content.some(
      (part) =>
        part.type === "tool-result" &&
        typeof part.output === "object" &&
        part.output !== null &&
        "type" in part.output &&
        part.output.type === "execution-denied"
    )
    return text(
      denied
        ? "Left the cut as it was. Say which lines to keep and I will cut around them."
        : "Done. The pauses and anything you asked to go are out, and the rest plays as it did."
    )
  }

  const said =
    last?.role === "user"
      ? last.content
          .map((part) => (part.type === "text" ? part.text : ""))
          .join(" ")
          .toLowerCase()
      : ""

  const calls: { toolName: string; input: unknown }[] = []

  if (/tighten|pause|silence|dead air/.test(said)) {
    calls.push({ toolName: "remove_silences", input: {} })
  }
  if (/caption|subtitle/.test(said)) {
    calls.push({
      toolName: "add_captions",
      input: /phrase/.test(said) ? { wordsPerSegment: 3 } : {},
    })
  }
  const under = said.match(/under\s+(\d+)/)
  if (under && scene) {
    const numbers = clipsToFit(scene, Number(under[1]))
    if (numbers.length > 0) {
      calls.push({ toolName: "delete_clip", input: { clipNumbers: numbers } })
    }
  }
  if (/vertical/.test(said)) {
    calls.push({ toolName: "reframe", input: { shape: "vertical" } })
  }
  if (/square/.test(said)) {
    calls.push({ toolName: "reframe", input: { shape: "square" } })
  }
  if (/push in|zoom|punch/.test(said)) {
    calls.push({ toolName: "punch_in", input: { clipNumber: 1 } })
  }
  if (/fade in/.test(said)) {
    calls.push({ toolName: "fade_clip", input: { clipNumber: 1, inSeconds: 0.3 } })
  }

  if (calls.length === 0) {
    return text(
      "Replay knows: tighten, add captions, under N s, make it vertical, push in."
    )
  }

  return [
    ...calls.map(
      (entry, index): StreamPart => ({
        type: "tool-call",
        toolCallId: `replay-${call}-${index}`,
        toolName: entry.toolName,
        input: JSON.stringify(entry.input),
      })
    ),
    {
      type: "finish",
      usage,
      finishReason: { unified: "tool-calls", raw: "tool-calls" },
    },
  ]
}

/**
 * The self-check's scripted look (plans/036, phase C): what the vision model
 * would answer, with no model call and nothing metered. When the cut has
 * captions it reports the first frame's caption over the chin and lifts
 * them, so the whole path (frames, verdict, fix, cursor press) can be
 * watched; otherwise everything reads clear.
 */
export function replayCheck(scene: Scene, frames: number): CheckVerdict {
  const captions = scene.tracks.some((t) => t.kind === "caption" && t.elements.length > 0)
  const notes = [
    captions ? "caption covers the chin" : "speaker sits in frame",
    "framing keeps the eyes in frame",
    "last line reads in time",
  ]
  return {
    frames: notes.slice(0, frames).map((note, index) => ({ index, note })),
    captions: captions ? "up" : null,
    keep: null,
    say: captions
      ? `Looked at ${frames} ${frames === 1 ? "frame" : "frames"}: the caption covered the chin, so I lifted it.`
      : `Looked at ${frames} ${frames === 1 ? "frame" : "frames"}: the framing holds.`,
  }
}

/** Clips from the end, never the first, until the cut is under `seconds`. */
function clipsToFit(scene: Scene, seconds: number): number[] {
  const clips = findMainTrack(scene)?.elements ?? []
  let remaining: number = sceneDurationUs(scene)
  const numbers: number[] = []
  for (let index = clips.length - 1; index > 0; index--) {
    if (remaining <= seconds * 1_000_000) break
    remaining -= clips[index].durationUs
    numbers.push(index + 1)
  }
  return numbers
}

function text(words: string): StreamPart[] {
  return [
    { type: "text-start", id: "t" },
    { type: "text-delta", id: "t", delta: words },
    { type: "text-end", id: "t" },
    { type: "finish", usage, finishReason: { unified: "stop", raw: "stop" } },
  ]
}

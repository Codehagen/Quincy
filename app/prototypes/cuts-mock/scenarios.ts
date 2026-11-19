import { createChat } from "@shadcn/helpers/ai-sdk"
import type { ChatTransport, UIMessage } from "ai"

import { dryRun } from "@/lib/editor/agent"
import { isFiller } from "@/lib/editor/fillers"
import { gateVerdict } from "@/lib/editor/gate"
import { paceOf, seedOf, type ModelPace, type Pace } from "@/lib/editor/pace"
import { findMainTrack } from "@/lib/editor/timeline"
import type { Word } from "@/lib/editor/transcript"
import type { VideoDocument } from "@/lib/editor/types"

import { recorder, withCalls } from "./record"
import { writeEnd, writeLine, writeRun } from "./script"
import { clipsToFit, recordThreeCuts } from "./three-cuts"

/*
 * The scenarios: what the person asks, the cut it starts from, and the run
 * the route would stream back. Each run is recorded by executing the real
 * tools on that starting cut (record.ts) and then written with the scripted
 * chat helper, so the transport is local but every op is a real op.
 */

export type ScenarioId = "tighten" | "captions" | "push-in" | "under" | "stop" | "three-cuts" | "self-check"

/** What the scenarios need to know about the take on screen. */
export type TakeShape = { durationUs: number; width: number; height: number }

/**
 * The length "make it under N s" asks for: a little over half the take, so
 * the tightened cut is still too long and the cut that fits removes most of
 * what is said (the gate asks). 20 s on the 37 s take, 12 s on a 21 s one.
 */
export function underSeconds(take: TakeShape): number {
  return Math.max(3, Math.round((take.durationUs / 1e6) * 0.55))
}

/** The self-check reframes the take into a shape it is not already. */
function otherShape(take: TakeShape): "vertical" | "square" {
  return take.height > take.width ? "square" : "vertical"
}

export function scenarios(take: TakeShape): readonly { id: ScenarioId; label: string }[] {
  return [
    { id: "tighten", label: "Tighten the edit" },
    { id: "captions", label: "Add captions" },
    { id: "push-in", label: "Push in on the strong line" },
    { id: "under", label: `Make it under ${underSeconds(take)} s (asks first)` },
    { id: "stop", label: "Stop mid-run" },
    { id: "three-cuts", label: "Three cuts" },
    { id: "self-check", label: `Self-check (make it ${otherShape(take)})` },
  ]
}

export type Prepared = {
  /** The cut on screen when the scenario starts. */
  document: VideoDocument
  /** What is typed into the composer. */
  prompt: string
}

/** Stop's run streams slowly enough that Stop arrives with steps still to come. */
const STOP_GAP_MS = 420
const STOP_PROMPT = "Tighten every pause and add captions"

type Chat = ReturnType<typeof createChat<UIMessage>>
const options = { delayMs: 18 }

/** Where the strong line is said, in the take's own seconds. */
function lineSeconds(words: Word[], line: string): { from: number; to: number } | null {
  const want = line.toLowerCase().split(/\s+/)
  const norm = (w: string) => w.toLowerCase()
  for (let i = 0; i + want.length <= words.length; i++) {
    if (want.every((w, k) => norm(words[i + k].text) === w)) {
      return { from: words[i].startUs / 1e6, to: words[i + want.length - 1].endUs / 1e6 }
    }
  }
  return null
}

/**
 * Where a stretch of the take sits in the cut as it is now: the clip that
 * holds it and its time on the timeline. After a tighten the take's seconds
 * and the cut's seconds differ, and punch_in reads the cut's.
 */
function onTimeline(document: VideoDocument, at: { from: number; to: number }) {
  const scene = document.scenes.find((s) => s.id === document.currentSceneId) ?? document.scenes[0]
  const clips = findMainTrack(scene)?.elements ?? []
  const fromUs = at.from * 1e6
  for (let index = 0; index < clips.length; index++) {
    const clip = clips[index] as { startUs: number; durationUs: number; trimStartUs?: number }
    const sourceStart = clip.trimStartUs ?? 0
    if (fromUs >= sourceStart && fromUs < sourceStart + clip.durationUs) {
      const from = (clip.startUs + (fromUs - sourceStart)) / 1e6
      const end = (clip.startUs + clip.durationUs) / 1e6
      return { clipNumber: index + 1, from, to: Math.min(end, from + (at.to - at.from) + 0.6) }
    }
  }
  return null
}

/** The cut a scenario starts from, and what it types. The answer comes from the live transport. */
export async function prepare(
  id: ScenarioId,
  base: VideoDocument,
  words: Word[],
  strongLine: string | null,
  take: TakeShape
): Promise<Prepared> {
  switch (id) {
    case "tighten":
      return { document: base, prompt: "Tighten the edit" }
    case "captions":
      return { document: base, prompt: "Add captions" }
    case "push-in":
      return { document: base, prompt: strongLine ? `Push in on “${strongLine}”` : "Push in on the strong line" }
    case "self-check":
      // Captioned first, so the look finds a caption over the chin and lifts it.
      return {
        document: await withCalls(base, words, [{ toolName: "add_captions", input: {}, toolCallId: "setup" }]),
        prompt: `Make it ${otherShape(take)}`,
      }
    case "stop":
      return { document: base, prompt: STOP_PROMPT }
    case "under":
      return {
        document: await withCalls(base, words, [{ toolName: "remove_silences", input: {}, toolCallId: "setup" }]),
        prompt: `Make it under ${underSeconds(take)} s`,
      }
    case "three-cuts":
      return { document: base, prompt: "Make three cuts" }
  }
}

type Intent =
  | { kind: "stop" }
  | { kind: "three-cuts" }
  | { kind: "under"; seconds: number }
  | { kind: "tighten" }
  | { kind: "captions" }
  | { kind: "push-in" }
  | { kind: "shape"; shape: "vertical" | "square" | "wide" }

/** What a person asked, read the way the replay model reads it: by its words. */
function intentOf(text: string): Intent | null {
  const t = text.toLowerCase()
  if (text.trim() === STOP_PROMPT) return { kind: "stop" }
  if (/three cuts|3 cuts/.test(t)) return { kind: "three-cuts" }
  const under = t.match(/(?:under|to|below)\s*(\d+)\s*(?:s\b|sec)/)
  if (under) return { kind: "under", seconds: Number(under[1]) }
  if (/shorter|cut it down/.test(t)) return { kind: "under", seconds: 20 }
  if (/tighten|pause|silence|dead air/.test(t)) return { kind: "tighten" }
  if (/caption|subtitle/.test(t)) return { kind: "captions" }
  if (/push in|punch|zoom/.test(t)) return { kind: "push-in" }
  if (/vertical|9:16|tiktok|reels/.test(t)) return { kind: "shape", shape: "vertical" }
  if (/square|1:1/.test(t)) return { kind: "shape", shape: "square" }
  if (/wide|16:9|landscape/.test(t)) return { kind: "shape", shape: "wide" }
  return null
}

const FALLBACK =
  "In the mock I can tighten the edit, add captions, push in, make it vertical, square or wide, cut it under a length, or make three cuts. Try one of those."

let calls = 0
const nextId = (tag: string) => `mock-${tag}-${++calls}`

/** The assistant turns for one request, recorded against the cut as it is now. */
async function answer(
  chat: Chat,
  intent: Intent | null,
  document: VideoDocument,
  words: Word[],
  strongLine: string | null,
  pace: Pace
): Promise<Chat> {
  const one = async (toolCalls: { toolName: string; input: Record<string, unknown> }[], say: string, gapMs?: number) => {
    const recorded = await recorder(document, words).call(toolCalls.map((c) => ({ ...c, toolCallId: nextId(c.toolName) })))
    const landed = recorded.some((c) => c.commits.length > 0)
    return chat.assistant(({ writer }) =>
      writeRun(writer, recorded, landed ? say : "Nothing to change there: the cut already has it.", gapMs, pace)
    )
  }

  if (!intent) return chat.assistant(({ writer }) => writeLine(writer, FALLBACK, pace))

  switch (intent.kind) {
    case "tighten":
      return one(
        [{ toolName: "remove_silences", input: {} }],
        // Only a take with a filler in it has one to keep.
        words.some((w) => isFiller(w.text))
          ? "Took out the long pauses. The um stays: it sits inside a sentence."
          : "Took out the long pauses."
      )
    case "captions":
      return one([{ toolName: "add_captions", input: {} }], "Captions are on, word by word, timed to the voice.")
    case "push-in": {
      const at = strongLine ? lineSeconds(words, strongLine) : null
      const place = at ? onTimeline(document, at) : null
      return one(
        [{ toolName: "punch_in", input: { clipNumber: place?.clipNumber ?? 1, scale: 1.3, ...(place ? { fromSeconds: place.from, toSeconds: place.to } : {}) } }],
        "Pushed in on the strong line and let it back out after."
      )
    }
    case "shape":
      return one([{ toolName: "reframe", input: { shape: intent.shape } }], `Reframed to ${intent.shape}, cropped around the centre so the picture fills the frame.`)
    case "stop":
      return one(
        [
          { toolName: "remove_silences", input: { minSilenceMs: 200, paddingMs: 40 } },
          { toolName: "add_captions", input: {} },
        ],
        "Every pause is out and the captions are on.",
        STOP_GAP_MS
      )
    case "three-cuts": {
      const three = await recordThreeCuts(document, words, strongLine)
      return chat.assistant(({ writer }) => three.write(writer, pace))
    }
    case "under":
      return underLength(chat, document, words, intent.seconds, pace)
  }
}

/** The gate: a cut that removes most of the take, asked first. */
async function underLength(chat: Chat, document: VideoDocument, words: Word[], seconds: number, pace: Pace): Promise<Chat> {
  const scene = document.scenes.find((s) => s.id === document.currentSceneId) ?? document.scenes[0]
  const input = { clipNumbers: clipsToFit(document, seconds) }
  if (input.clipNumbers.length === 0) return chat.assistant(`It is already under ${seconds} s.`)
  const toolCallId = nextId("delete_clip")
  const verdict = gateVerdict({ toolName: "delete_clip", before: scene, steps: dryRun("delete_clip", input, scene) ?? [], words })
  const [call] = await recorder(document, words).call([{ toolName: "delete_clip", input, toolCallId }])

  return chat
    .assistant(({ writer }) => {
      if (!verdict.ask) return writeRun(writer, [call], "Cut to fit.", undefined, pace)
      writer.sleep(pace.thinkMs)
      writer.tool("delete_clip", { toolCallId, input, needsApproval: true, output: call.output })
      writer.data({
        type: "data-gate",
        id: toolCallId,
        data: { toolCallId, reason: verdict.reason, sentences: verdict.sentences, percent: verdict.percent },
      })
    })
    .assistant(({ writer, toolCall }) => {
      if (!verdict.ask) return
      if (!toolCall?.approved) {
        writeLine(writer, "Left the cut as it was. Say which lines to keep and I will cut around them.", pace)
        return
      }
      // The approval goes back to the model, which runs the tool: one step.
      writer.sleep(pace.betweenMs())
      for (const commit of call.commits)
        writer
          .sleep(pace.partMs)
          .data({ type: "data-ops", data: { ops: commit.ops, toolCallId, toolName: "delete_clip" }, transient: true })
      writeLine(writer, `Cut to under ${seconds} s: the end of the take is out.`, pace)
      writeEnd(writer, [call])
    })
}

const textOf = (message: UIMessage) =>
  message.parts.map((part) => (part.type === "text" ? part.text : "")).join(" ").trim()

/**
 * The page's agent: whatever the person types or presses, read for what it
 * asks and answered by running the real tools on the cut as it stands now
 * (the server's document), so requests chain the way they do on the real
 * route. A continuation (an approval answered) goes back to the chat that
 * asked it.
 */
export function liveTransport(
  current: () => VideoDocument,
  words: Word[],
  strongLine: string | null,
  pace: () => ModelPace = () => "none"
): ChatTransport<UIMessage> {
  let asking: ChatTransport<UIMessage> | null = null

  return {
    async sendMessages(request) {
      const last = request.messages.at(-1)
      if (last && last.role !== "user" && asking) return asking.sendMessages(request)

      const prior = request.messages.slice(0, -1)
      const text = last ? textOf(last) : ""
      const chat = await answer(
        createChat<UIMessage>({ messages: prior, messageIdPrefix: `mock-msg-${++calls}`, toolCallIdPrefix: "mock-call" }).user(text, {
          id: last?.id,
        }),
        intentOf(text),
        current(),
        words,
        strongLine,
        paceOf(pace(), seedOf(text))
      )
      asking = chat.transport(options)
      return asking.sendMessages(request)
    },
    reconnectToStream: async () => null,
  }
}

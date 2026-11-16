import type { FileUIPart, TextUIPart } from "ai"

import { isDraftArtifactOutput } from "./draft-artifact"
import { isSourceArtifactOutput } from "./source-artifact"
import type {
  DraftToolPart,
  StudioUIMessage,
  SourceToolPart,
  StudioPart,
  StudioToolName,
  StudioToolPart,
} from "./studio-message"

/**
 * One Studio turn, read into the blocks the transcript draws.
 *
 * The chatbot template's `groupParts` is the shape: a turn is a sequence of
 * parts, and consecutive working steps (reasoning, a tool call) share one
 * trace while text and objects break the run. Here the trace is Quincy's
 * work receipt (the landing's hero: "Read #212 → …"), and the objects are the
 * draft card and the source card.
 *
 * Pure, so every part state the SDK can hand over is testable without a
 * browser (lib/studio-turn.test.ts drives the scripted fixtures through it).
 */

export type StepState = "running" | "done" | "failed"

export type WorkStep =
  | {
      kind: "thinking"
      key: string
      text: string
      /**
       * Open and pulsing. True while the reasoning streams, and after it while
       * the turn is live with nothing visible below it yet: thinking holds
       * until the card or the words land, then folds.
       */
      live: boolean
    }
  | {
      kind: "step"
      key: string
      state: StepState
      /** First person, present while running, past once done. */
      label: string
      /** The tool's own words when it failed or refused. */
      reason?: string
    }

export type TurnBlock =
  | { kind: "work"; key: string; steps: WorkStep[] }
  | { kind: "text"; key: string; part: TextUIPart }
  | { kind: "draft"; key: string; part: DraftToolPart }
  | { kind: "source"; key: string; part: SourceToolPart }
  | { kind: "files"; key: string; files: FileUIPart[] }

/**
 * Parts that are never drawn, on purpose. `step-start` is a boundary marker;
 * sources and data parts are not something Studio's route sends; a file in
 * Quincy's own turn has nothing to show yet. Anything not here and not
 * planned is a gap the tests catch.
 */
export const SKIPPED_PART_TYPES = new Set([
  "step-start",
  "source-url",
  "source-document",
  "reasoning-file",
  "custom",
])

export type Sentence = { running: string; done: string; failed: string }

/**
 * Another surface's tools, said in its own words: the editor's cutting
 * tools (lib/editor/turn-sentences.ts). Looked up before Studio's own.
 */
export type ToolSentences = Readonly<Record<string, Sentence>>

/**
 * What each tool did, said as Quincy would. Product words only: the person
 * reads "ideas", never "riffs" (plans/029, Words).
 */
const SENTENCES: Record<StudioToolName, Sentence> = {
  read_riffs: { running: "Reading your ideas", done: "Read your ideas", failed: "Could not read your ideas." },
  read_drafts: { running: "Reading your drafts", done: "Read your drafts", failed: "Could not read your drafts." },
  read_lineup: { running: "Checking the week", done: "Checked the week", failed: "Could not read the week." },
  read_channels: { running: "Checking your channels", done: "Checked your channels", failed: "Could not read your channels." },
  read_sources: { running: "Checking your sources", done: "Checked your sources", failed: "Could not read your sources." },
  read_source: { running: "Reading the source", done: "Read the source", failed: "Could not read that source." },
  read_story: { running: "Reading your story", done: "Read your story", failed: "Could not read your story." },
  read_numbers: { running: "Reading your numbers", done: "Read your numbers", failed: "Could not read your numbers." },
  capture_riff: { running: "Finding the ideas in it", done: "Found the ideas in it", failed: "Could not find ideas in that." },
  draft_angle: { running: "Writing the draft", done: "Wrote the draft", failed: "Could not draft it." },
  revise_version: { running: "Revising the draft", done: "Revised the draft", failed: "Could not revise it." },
}

function isKnownTool(name: string): name is StudioToolName {
  return Object.hasOwn(SENTENCES, name)
}

/** `read_lineup` -> "Read lineup", for a tool this file has no sentence for. */
function plainName(name: string) {
  const spaced = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/** "Writing the draft" → "Stopped while writing the draft." */
export function stoppedSentence(sentence: Sentence): string {
  return `Stopped while ${sentence.running.charAt(0).toLowerCase()}${sentence.running.slice(1)}.`
}

export function toolSentence(name: string, extra?: ToolSentences): Sentence {
  if (extra && Object.hasOwn(extra, name)) return extra[name]
  if (isKnownTool(name)) return SENTENCES[name]
  const plain = plainName(name)
  return { running: plain, done: plain, failed: `${plain} did not work.` }
}

export function toolNameOf(part: StudioToolPart | { type: string; toolName?: string }): string {
  if (part.type === "dynamic-tool" && "toolName" in part && part.toolName) {
    return part.toolName
  }
  return part.type.replace(/^tool-/, "")
}

function isRunning(state: string) {
  return state === "input-streaming" || state === "input-available" || state === "approval-requested" || state === "approval-responded"
}

/** A refusal from a write path comes back as `{ ok: false, message }` or "Not …". */
function refusalOf(output: unknown): string | null {
  if (output && typeof output === "object" && "ok" in output && output.ok === false) {
    const message = (output as { message?: unknown }).message
    return typeof message === "string" ? message : ""
  }
  return null
}

function stepOf(part: StudioToolPart, key: string, live = true, extra?: ToolSentences): WorkStep {
  const sentence = toolSentence(toolNameOf(part), extra)
  if (isRunning(part.state) && !live) {
    // A finished turn with a call still open: the person pressed Stop.
    return { kind: "step", key, state: "failed", label: stoppedSentence(sentence) }
  }
  if (isRunning(part.state)) {
    return { kind: "step", key, state: "running", label: sentence.running }
  }
  if (part.state === "output-error" || part.state === "output-denied") {
    return {
      kind: "step",
      key,
      state: "failed",
      label: sentence.failed,
      reason: part.state === "output-error" ? part.errorText : undefined,
    }
  }
  const refused = refusalOf(part.output)
  if (refused != null) {
    return { kind: "step", key, state: "failed", label: sentence.failed, reason: refused || undefined }
  }
  return { kind: "step", key, state: "done", label: sentence.done }
}

function isDraftPart(part: StudioPart): part is DraftToolPart {
  return part.type === "tool-draft_angle" || part.type === "tool-revise_version"
}

/**
 * A draft part is a card from its first token of input until it fails: the
 * writing shell while running, the card once the versions exist. A refusal
 * (`{ ok: false }`) or an error is a step in the receipt, not an empty card.
 */
function draftIsCard(part: DraftToolPart, live: boolean) {
  if (isRunning(part.state)) return live
  if (part.state !== "output-available" || !isDraftArtifactOutput(part.output)) return false
  // Words still arriving in a turn that has ended: it was stopped mid-draft,
  // and no row exists to show.
  return live || !part.output.streaming
}

function sourceIsCard(part: SourceToolPart) {
  return part.state === "output-available" && isSourceArtifactOutput(part.output)
}

/**
 * The blocks of one message.
 *
 * `live`: this turn is the one still arriving (status submitted or
 * streaming, and it is the last message). `sentences`: another surface's
 * tools in its own words (the editor's); Studio's are built in.
 */
export function planTurn(
  parts: readonly StudioPart[],
  { live = false, sentences }: { live?: boolean; sentences?: ToolSentences } = {},
): TurnBlock[] {
  const blocks: TurnBlock[] = []
  let work: Extract<TurnBlock, { kind: "work" }> | null = null
  const files: FileUIPart[] = []

  const pushStep = (step: WorkStep, key: string) => {
    if (!work) {
      work = { kind: "work", key, steps: [] }
      blocks.push(work)
    }
    work.steps.push(step)
  }
  const pushObject = (block: TurnBlock) => {
    work = null
    blocks.push(block)
  }

  parts.forEach((part, index) => {
    const key = `p${index}`

    if (part.type === "text") {
      if (!part.text.trim()) return
      pushObject({ kind: "text", key, part })
      return
    }
    if (part.type === "reasoning") {
      if (!part.text.trim() && part.state !== "streaming") return
      pushStep({ kind: "thinking", key, text: part.text, live: part.state === "streaming" }, key)
      return
    }
    if (part.type === "file") {
      files.push(part)
      return
    }
    if (isDraftPart(part)) {
      if (draftIsCard(part, live)) pushObject({ kind: "draft", key, part })
      else if (part.state === "output-available" && !live && isDraftArtifactOutput(part.output)) {
        pushStep({ kind: "step", key, state: "failed", label: stoppedSentence(toolSentence(toolNameOf(part))) }, key)
      } else pushStep(stepOf(part, key, live, sentences), key)
      return
    }
    if (part.type === "tool-read_source") {
      if (sourceIsCard(part)) pushObject({ kind: "source", key, part })
      else pushStep(stepOf(part, key, live, sentences), key)
      return
    }
    if (part.type === "dynamic-tool" || part.type.startsWith("tool-")) {
      pushStep(stepOf(part as StudioToolPart, key, live, sentences), key)
      return
    }
  })

  if (files.length > 0) {
    // Files read first: what was handed over, then what was said about it.
    blocks.unshift({ kind: "files", key: "files", files })
  }

  // Thinking holds while nothing visible has landed after it in a live turn.
  if (live) {
    let visibleAfter = false
    for (let i = blocks.length - 1; i >= 0; i--) {
      const block = blocks[i]
      if (block.kind === "work") {
        if (!visibleAfter) {
          for (const step of block.steps) {
            if (step.kind === "thinking") step.live = true
          }
        }
      } else {
        visibleAfter = true
      }
    }
  }

  return blocks
}

/** True when a part's type is drawn by `planTurn` or skipped on purpose. */
export function isHandledPart(part: { type: string }) {
  if (SKIPPED_PART_TYPES.has(part.type)) return true
  if (part.type.startsWith("data-")) return true
  return (
    part.type === "text" ||
    part.type === "reasoning" ||
    part.type === "file" ||
    part.type === "dynamic-tool" ||
    part.type.startsWith("tool-")
  )
}

export type TurnMood = "idle" | "reading" | "writing" | "waiting" | "stuck"

/**
 * What the friend beside the newest reply shows (docs/design/mascot.md): a
 * draft streaming is `writing`, working through material is `reading`, a draft
 * held for Approve is `waiting`, a failure is `stuck`. Never decoration: each
 * matches a sentence already on screen.
 */
export function turnMood(
  blocks: readonly TurnBlock[],
  {
    live = false,
    failed = false,
    decided = () => false,
  }: {
    live?: boolean
    failed?: boolean
    /** Versions this session already approved, which the tool output still calls writing. */
    decided?: (versionId: string) => boolean
  } = {}
): TurnMood {
  if (failed) return "stuck"
  const drafts = blocks.filter((b): b is Extract<TurnBlock, { kind: "draft" }> => b.kind === "draft")
  if (live) {
    const writing = drafts.some((d) => isRunning(d.part.state) || (d.part.state === "output-available" && isDraftArtifactOutput(d.part.output) && d.part.output.streaming))
    return writing ? "writing" : "reading"
  }
  const lastWork = [...blocks].reverse().find((b) => b.kind === "work")
  if (lastWork?.kind === "work" && lastWork.steps.some((s) => s.kind === "step" && s.state === "failed") && blocks.at(-1) === lastWork) {
    return "stuck"
  }
  const held = drafts.some(
    (d) =>
      d.part.state === "output-available" &&
      isDraftArtifactOutput(d.part.output) &&
      d.part.output.versions.some((v) => v.state === "writing" && !decided(v.versionId))
  )
  return held ? "waiting" : "idle"
}

/**
 * versionId → the tool call whose card is the live one for it: a revision in
 * a later turn makes the earlier card a snapshot.
 */
export function currentToolCallIds(messages: readonly Pick<StudioUIMessage, "parts">[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type !== "tool-draft_angle" && part.type !== "tool-revise_version") continue
      if (part.state !== "output-available" || !part.output.ok || part.output.streaming) continue
      for (const version of part.output.versions) map.set(version.versionId, part.toolCallId)
    }
  }
  return map
}

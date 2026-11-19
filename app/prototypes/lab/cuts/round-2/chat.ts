/**
 * Round 2's conversations, scripted with @shadcn/helpers/ai-sdk the way
 * lib/chat-fixtures does it: `createChat()` turns, `chat.transport()` for
 * useChat. No model, no API route, no network.
 *
 * Every edit is a tool part with the editor's real tool name
 * (lib/editor/agent.ts) and an `input.target`, the `data-q` of the element
 * it lands on. The cursor reads these parts: `input-available` is the glide,
 * `output-available` is the press and the change. So a press can only land
 * where an op lands.
 *
 * Factories, not constants: a chat keeps id counters, and two pieces sharing
 * one would hand out each other's ids.
 */

import { createChat } from "@shadcn/helpers/ai-sdk"
import type { UIMessage } from "ai"

import { CUT_SECONDS, TAKE, fmt } from "../round-1/fixture"
import { TIGHTEN, type CutOp } from "./ops"

/* ------------------------------------------------------------------ types */

export type EditInput = { target: string }
export type Landed = { say: string; detail: string }

export type Frame = { at: string; target: string; note: string; fixed?: string }
export type Read = { label: string; found: string; done: boolean }
export type PlanLine = { id: string; say: string }
export type VariantStep = { target: string; say: string; done: boolean }
export type VariantOutput = {
  steps: VariantStep[]
  seconds: number
  hookAt: string
  done: boolean
}

export const EDIT_TOOLS = ["remove_silences", "delete_clip", "add_captions", "punch_in", "reframe", "move_captions"] as const
export type EditTool = (typeof EDIT_TOOLS)[number]

export type CutsTools = {
  [K in EditTool]: { input: EditInput; output: Landed }
} & {
  /** The self-check: renders a few frames of its own cut and looks at them. */
  check_frames: { input: EditInput; output: { frames: Frame[]; say: string } }
  /** Reading the take on upload, streamed as preliminary outputs. */
  read_take: { input: { file: string }; output: { reads: Read[]; noticed: string[] } }
  /** Ask first: the plan, paused behind an approval. */
  plan_cut: { input: { lines: PlanLine[] }; output: { kept: string[] } }
  /** One of three cuts, built by a subagent with its own steps. */
  cut_variant: { input: { name: string; brief: string; prefix: string }; output: VariantOutput }
}

export type CutsData = { checkpoint: { label: string; revision: number } }

export type CutsUIMessage = UIMessage<unknown, CutsData, CutsTools>
export type CutsPart = CutsUIMessage["parts"][number]

type AssistantFn = Extract<Parameters<ReturnType<typeof createCuts>["assistant"]>[0], (context: never) => void>
export type Writer = Parameters<AssistantFn>[0]["writer"]

export const createCuts = () =>
  createChat<CutsUIMessage>({ now: "2026-11-17T10:42:00.000Z", messageIdPrefix: "cuts-msg", toolCallIdPrefix: "cuts-call" })

/* ---------------------------------------------------------------- prompts */

export const PROMPTS = {
  tighten: "Tighten it, add captions, push in where it matters.",
  upload: `Uploaded ${TAKE.file}`,
  variants: "Three cuts: one for X, one for LinkedIn, one for my changelog.",
} as const

export const STARTERS = [
  { text: "Tighten the edit", read: "2 pauses and an “um”, 4.5 s" },
  { text: "Add captions", read: `${TAKE.words} words, most people watch muted` },
  { text: "Make a 9:16", read: "your face stays centred" },
] as const

/* --------------------------------------------------------------- writing */

export type Pace = { pace?: number; prefix?: string }

/** Writes ops as tool parts: input (the glide), a short sleep, output (the press). */
export function writeOps(writer: Writer, ops: readonly CutOp[], { pace = 1, prefix = "" }: Pace = {}) {
  for (const o of ops) {
    writer
      .tool(o.tool as EditTool, { title: o.doing, input: { target: prefix + o.target } })
      .sleep(210 * pace)
      .output({ say: o.say, detail: o.detail })
    writer.sleep(90 * pace)
  }
}

export function receipt(ops: readonly CutOp[]) {
  const cut = ops.filter((o) => o.removes).length
  const gone = ops.reduce((t, o) => t + (o.removes ? Number.parseFloat(o.detail) : 0), 0)
  const seconds = Math.round((TAKE.seconds - gone) * 10) / 10
  const rest = ops.filter((o) => !o.removes).map((o) => o.say.charAt(0).toLowerCase() + o.say.slice(1))
  return [
    cut ? `${cut} cuts: ${fmt(TAKE.seconds)} is now ${fmt(seconds)}.` : "Nothing cut from the length.",
    rest.length ? ` I also ${rest.join(" and ")}.` : "",
    "\n\nOne run, so one undo. Nothing is exported.",
  ].join("")
}

export function writeCheckpoint(writer: Writer, label = "Tightened, captions, push-in") {
  writer.data({ type: "data-checkpoint", id: "r14", data: { label, revision: 14 } })
}

/* ---------------------------------------------------------------- chats */

/** The tighten run: five edits, the receipt, a checkpoint. Optionally the self-check after. */
export function tightenChat({ pace = 1, check = false, reasoning = false }: { pace?: number; check?: boolean; reasoning?: boolean } = {}) {
  return createCuts()
    .user(PROMPTS.tighten)
    .assistant(({ writer }) => {
      if (reasoning) writer.reasoning("Two pauses over a second and one “um”. The strong line is at 0:21.").sleep(120 * pace)
      writeOps(writer, TIGHTEN, { pace })
      if (check) writeSelfCheck(writer, pace)
      writer.text(receipt(TIGHTEN))
      writeCheckpoint(writer)
    })
}

/** The self-check: look at three frames, find the caption on the chin, move it. */
export function writeSelfCheck(writer: Writer, pace = 1, prefix = "") {
  writer
    .tool("check_frames", { title: "Looking at 3 frames of the cut", input: { target: prefix + "preview" } })
    .sleep(380 * pace)
    .output({
      say: "Looked at 3 frames: the caption covers the chin at 0:04.",
      frames: [
        { at: "0:04", target: prefix + "frame-1", note: "caption covers the chin" },
        { at: "0:16", target: prefix + "frame-2", note: "push-in keeps the eyes in frame" },
        { at: "0:31", target: prefix + "frame-3", note: "last line reads in time" },
      ],
    })
  writer
    .tool("move_captions", { title: "Moving the captions up", input: { target: prefix + "caption" } })
    .sleep(200 * pace)
    .output({ say: "Moved the captions up", detail: "clear of the chin" })
}

/** Ask first: the plan waits for Go; the continuation runs only the ticked lines. */
export function askFirstChat({ pace = 1 }: { pace?: number } = {}) {
  return createCuts()
    .user(PROMPTS.tighten)
    .assistant(({ writer }) => {
      writer.tool("plan_cut", {
        title: "Here is what I would do",
        input: { lines: TIGHTEN.map((o) => ({ id: o.id, say: o.say })) },
        needsApproval: true,
        output: { kept: TIGHTEN.map((o) => o.id) },
      })
    })
    .assistant(({ writer, messages, toolCall }) => {
      if (!toolCall?.approved) {
        writer.text("Left the take as it is.")
        return
      }
      const skipped = skippedFrom(messages ?? [])
      const ops = TIGHTEN.filter((o) => !skipped.includes(o.id))
      writeOps(writer, ops, { pace })
      writer.text(receipt(ops))
      writeCheckpoint(writer)
    })
}

/** The unticked lines ride on the approval's reason, as a comma list of op ids. */
export function skippedFrom(messages: CutsUIMessage[]): string[] {
  for (const m of [...messages].reverse()) {
    for (const p of m.parts) {
      if (p.type === "tool-plan_cut" && "approval" in p && p.approval?.reason) {
        return p.approval.reason.split(",").filter(Boolean)
      }
    }
  }
  return []
}

/** First run: the upload is read in three passes, then the starters. */
export function firstRunChat({ pace = 1, plan = false }: { pace?: number; plan?: boolean } = {}) {
  const reads = (n: number): Read[] =>
    [
      { label: "Transcribing", found: `${TAKE.words} words, one speaker` },
      { label: "Reading the picture", found: "one shot, face centred, good light" },
      { label: "Reading the delivery", found: "2 long pauses, an “um”, a strong line at 0:21" },
    ].map((r, i) => ({ ...r, done: i < n }))
  return createCuts()
    .user(PROMPTS.upload)
    .assistant(({ writer }) => {
      const scan = writer.tool("read_take", { title: "Reading your take", input: { file: TAKE.file } })
      for (let i = 0; i <= 3; i++) {
        scan.sleep(260 * pace)
        if (i < 3) scan.output({ reads: reads(i), noticed: [] }, { preliminary: true })
      }
      scan.output({
        reads: reads(3),
        noticed: ["Two pauses over a second, 4.1 s in all", "One “um”, right at the start", "“They were in the way” is the line to push in on"],
      })
      if (!plan) {
        writer.text(`${fmt(TAKE.seconds)}, ${TAKE.words} words. Pick a start, or say your own.`)
        return
      }
      writer.tool("plan_cut", {
        title: "A first cut from what I read",
        input: { lines: TIGHTEN.map((o) => ({ id: o.id, say: o.say })) },
        needsApproval: true,
        output: { kept: TIGHTEN.map((o) => o.id) },
      })
    })
}

/** Three cuts at once, each a subagent streaming its own steps; then the recommendation. */
export function variantsChat({ pace = 1, check = true }: { pace?: number; check?: boolean } = {}) {
  const VARIANTS = [
    {
      name: "A · X, hook first",
      brief: "Open on the strong line, 0:21 or less, captions word by word",
      prefix: "a:",
      ops: [TIGHTEN[4], TIGHTEN[0], TIGHTEN[1], TIGHTEN[3]],
      seconds: 21.4,
      hookAt: "0:00.8",
    },
    {
      name: "B · LinkedIn, keep the numbers",
      brief: "Whole story in order, the numbers held on screen",
      prefix: "b:",
      ops: [TIGHTEN[0], TIGHTEN[1], TIGHTEN[2], TIGHTEN[3]],
      seconds: CUT_SECONDS,
      hookAt: "0:16.7",
    },
    {
      name: "C · Changelog, wide",
      brief: "The whole take tightened, no push-in",
      prefix: "c:",
      ops: [TIGHTEN[0], TIGHTEN[1], TIGHTEN[2]],
      seconds: CUT_SECONDS,
      hookAt: "0:16.7",
    },
  ] as const
  const out = (v: (typeof VARIANTS)[number], n: number): VariantOutput => ({
    steps: v.ops.map((o, i) => ({ target: v.prefix + o.target, say: i < n ? o.say : o.doing, done: i < n })),
    seconds: v.seconds,
    hookAt: v.hookAt,
    done: n >= v.ops.length,
  })
  return createCuts()
    .user(PROMPTS.variants)
    .assistant(({ writer }) => {
      const handles = VARIANTS.map((v) =>
        writer.tool("cut_variant", { title: v.name, input: { name: v.name, brief: v.brief, prefix: v.prefix } }),
      )
      for (let n = 0; n <= 4; n++) {
        VARIANTS.forEach((v, i) => {
          if (n <= v.ops.length) handles[i].output(out(v, n), { preliminary: true })
        })
        handles[0].sleep(300 * pace)
      }
      VARIANTS.forEach((v, i) => handles[i].output(out(v, v.ops.length)))
      if (check) writeSelfCheck(writer, pace, "a:")
      writer.text(
        "I would post **A**. The hook lands at 0.8 s; in B and C it waits until 0:16, and most people have scrolled by then. B is the one for LinkedIn if you want the numbers to carry it.",
      )
    })
}

/**
 * What any message past the script gets: the starters answer for real, so a
 * first-run piece can take any of the three. Everything else gets the
 * tighten run.
 */
export function cutsFallback({ writer, messages }: { writer: Writer; messages: CutsUIMessage[] }) {
  const last = messages.at(-1)
  const text = last?.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join(" ") ?? ""
  // What already landed is not done twice: "Finish the run" does the rest.
  const done = new Set(
    messages.flatMap((m) => m.parts.flatMap((p) => (isEdit(p) && p.state === "output-available" ? [p.input.target] : []))),
  )
  const want = /caption/i.test(text)
    ? TIGHTEN.filter((o) => o.id === "captions")
    : /9:16|vertical/i.test(text)
      ? [REFRAME]
      : TIGHTEN
  const ops = want.filter((o) => !done.has(o.target))
  if (ops.length === 0) {
    writer.text("That is already in the cut.")
    return
  }
  writeOps(writer, ops)
  writer.text(receipt(ops))
  writeCheckpoint(writer, ops.length === 1 ? ops[0].say : undefined)
}

export const REFRAME: CutOp = {
  id: "reframe",
  tool: "reframe",
  target: "shape",
  at: 0,
  doing: "Making it 9:16",
  say: "Made it vertical, 9:16",
  detail: "face kept in frame",
}

/** A conversation with nothing scripted: every message gets the fallback. */
export function openChat() {
  return createCuts()
}

/** First run, ask-first: the reading ends in a plan that waits for Go. */
export function firstRunPlanChat({ pace = 1 }: { pace?: number } = {}) {
  return firstRunChat({ pace, plan: true }).assistant(({ writer, messages, toolCall }) => {
    if (!toolCall?.approved) {
      writer.text("Left the take as it is. Say a change when you want one.")
      return
    }
    const skipped = skippedFrom(messages ?? [])
    const ops = TIGHTEN.filter((o) => !skipped.includes(o.id))
    writeOps(writer, ops, { pace })
    writer.text(receipt(ops))
    writeCheckpoint(writer, "First cut")
  })
}

/* --------------------------------------------------------------- reading */

export type EditPart = Extract<CutsPart, { type: `tool-${EditTool}` }>

export const isEdit = (p: CutsPart): p is EditPart =>
  (EDIT_TOOLS as readonly string[]).includes(p.type.replace(/^tool-/, ""))

/** Parts the cursor reads: every edit, and the self-check's look at the preview. */
export type ActPart = EditPart | Extract<CutsPart, { type: "tool-check_frames" }>

export const isAct = (p: CutsPart): p is ActPart => isEdit(p) || p.type === "tool-check_frames"

export const textOf = (m: CutsUIMessage) => m.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("")

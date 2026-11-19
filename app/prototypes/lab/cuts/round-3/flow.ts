/**
 * Round 3's one story, scripted on @shadcn/helpers/ai-sdk: open the sample
 * (free) → the reading → starters that say what Quincy read → the pick →
 * the cursor's run → the receipt → one checkpoint.
 *
 * The opening turn is scripted; everything after it is the transport's
 * fallback, which reads the transcript and answers the starter that was
 * pressed. Three gates decide whether a run asks first:
 *
 *   go    never asks; Stop is always there.
 *   ask   asks every time: the receipt in advance (a needsApproval tool).
 *   smart asks only for a very big change: a run that removes more than
 *         30% of the take, or whole spoken sentences (round 5, the owner).
 */

import { CUT_SECONDS, SEGMENTS, TAKE, fmt } from "../round-1/fixture"
import {
  type CutsUIMessage,
  REFRAME,
  STARTERS,
  type Read,
  type VariantOutput,
  type Writer,
  createCuts,
  isEdit,
  skippedFrom,
  textOf,
  writeOps,
} from "../round-2/chat"
import { TIGHTEN, type CutOp } from "../round-2/ops"

export const SAMPLE = "Open the sample"
export const SHORTEN_TEXT = "Make it under 20 s"
export const VARIANTS_TEXT = "Three cuts: X, LinkedIn, my changelog"

const seg = (id: string) => SEGMENTS.find((s) => s.id === id)!
const speechCut = (id: string): CutOp => {
  const s = seg(id)
  const words = s.text.split(" ").slice(0, 3).join(" ")
  return {
    id,
    tool: "delete_clip",
    target: id,
    at: 0,
    doing: `Cutting “${words}…”`,
    say: `Cut “${s.text}”`,
    detail: `${(s.end - s.at).toFixed(1)} s`,
    removes: id,
  }
}

/** Under 20 s: the pauses, the "um", and three spoken lines. */
export const SHORTEN: readonly CutOp[] = [TIGHTEN[0], TIGHTEN[1], TIGHTEN[2], speechCut("s4"), speechCut("s7"), speechCut("s8")]

const ALL: readonly CutOp[] = [...TIGHTEN, REFRAME, ...SHORTEN]
const byId = (id: string) => ALL.find((o) => o.id === id)

export const FLOW_STARTERS = STARTERS

export type Starter = { text: string; read?: string }

/**
 * The starters, replaced by next steps once a run has landed: a request
 * whose edits are all in the cut is never offered again, and what is left
 * of the work comes up instead (captions, the push-in, a 9:16, a second run
 * of three cuts).
 */
export function nextSteps(messages: CutsUIMessage[], base: readonly Starter[]): Starter[] {
  const done = new Set(
    messages.flatMap((m) => m.parts.flatMap((p) => (isEdit(p) && p.state === "output-available" ? [p.input.target] : []))),
  )
  const threeDone = messages.some((m) => m.parts.some((p) => p.type === "tool-cut_variant"))
  const left = (ids: string[]) => ids.some((id) => !done.has(id))
  const open: Record<string, boolean> = {
    "Tighten the edit": left(["p1", "p2", "um"]),
    "Add captions": left(["captions"]),
    "Make a 9:16": left(["shape"]),
    "Push in on the strong line": left(["hook"]),
    [SHORTEN_TEXT]: left(["s4", "s7", "s8"]),
    [VARIANTS_TEXT]: !threeDone,
  }
  const first = done.size === 0 && !threeDone
  if (first) return base.filter((s) => open[s.text] ?? true)
  const next: Starter[] = [
    { text: "Add captions", read: `${TAKE.words} words, most watch muted` },
    { text: "Push in on the strong line", read: "“They were in the way”, 0:21" },
    { text: "Make a 9:16", read: "your face stays centred" },
    ...base,
  ]
  return next.filter((s, i) => (open[s.text] ?? true) && next.findIndex((x) => x.text === s.text) === i).slice(0, 3)
}
export const SMART_STARTERS = [STARTERS[0], STARTERS[1], { text: SHORTEN_TEXT, read: "cuts 3 spoken sentences, 40% of the take" }] as const
export const VARIANT_STARTERS = [STARTERS[0], { text: VARIANTS_TEXT, read: "one take, a cut for each place it goes" }] as const

/* ---------------------------------------------------------------- reading */

function writeReading(writer: Writer, pace: number) {
  const reads = (n: number): Read[] =>
    [
      { label: "Transcribing", found: `${TAKE.words} words, one speaker` },
      { label: "Reading the picture", found: "one shot, face centred" },
      { label: "Reading the delivery", found: "2 long pauses, an “um”, a strong line at 0:21" },
    ].map((r, i) => ({ ...r, done: i < n }))
  const scan = writer.tool("read_take", { title: "Reading the sample", input: { file: TAKE.file } })
  for (let i = 0; i < 3; i++) scan.sleep(300 * pace).output({ reads: reads(i), noticed: [] }, { preliminary: true })
  scan.sleep(300 * pace).output({
    reads: reads(3),
    noticed: ["Two pauses over a second, 4.1 s in all", "One “um”, right at the start", "“They were in the way” is the line to push in on"],
  })
  writer.text("The sample costs nothing to open or cut. Pick a start, or say your own.")
}

/** The opening: the sample opens (free) and is read. */
export function sampleChat({ pace = 1 }: { pace?: number } = {}) {
  return createCuts()
    .user(SAMPLE)
    .assistant(({ writer }) => writeReading(writer, pace))
}

/* ------------------------------------------------------------------ gates */

export type Gate = "go" | "ask" | "smart"

const spokenIn = (ops: readonly CutOp[]) => ops.filter((o) => o.removes && seg(o.removes).kind === "speech")
const share = (ops: readonly CutOp[]) =>
  ops.reduce((t, o) => t + (o.removes ? seg(o.removes).end - seg(o.removes).at : 0), 0) / TAKE.seconds

/**
 * Why the smart gate asks, or null to go straight through.
 *
 * The owner, 2026-11-17: "jeg ønsker at vi skal edite uten at de aksepterer
 * hvis det ikke er veldig store ting" (edit without asking unless it is a
 * very big change). So it never asks on a first run, or for pauses, fillers,
 * captions, push-ins, looks, fades or reframes. It asks only when a run would
 * remove more than 30% of the take, or remove whole spoken sentences, and it
 * says which. Stop and Esc are always there, and a run is still one undo.
 */
export function askReason(ops: readonly CutOp[], _messages?: CutsUIMessage[]): string | null {
  const spoken = spokenIn(ops).length
  const part = share(ops)
  const big = part > 0.3
  if (spoken && big)
    return `This removes ${spoken} spoken sentences and ${Math.round(part * 100)}% of the take, so I ask first.`
  if (spoken) return `This removes ${spoken} spoken sentences, not just pauses, so I ask first.`
  if (big) return `This removes ${Math.round(part * 100)}% of the take, so I ask first.`
  return null
}

function writePlan(writer: Writer, ops: readonly CutOp[], why: string) {
  writer.tool("plan_cut", {
    title: why,
    input: { lines: ops.map((o) => ({ id: o.id, say: o.say })) },
    needsApproval: true,
    output: { kept: ops.map((o) => o.id) },
  })
}

const and = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`)

/**
 * The receipt in words only. The numbers (edits, length against the take)
 * live once, on the run's summary line, and the checkpoint row already says
 * it is one undo, so the prose says neither.
 */
export function receiptWords(ops: readonly CutOp[]) {
  const kinds = ops.flatMap((o) => (o.removes ? [seg(o.removes).kind] : []))
  const pauses = kinds.filter((k) => k === "pause").length
  const spoken = kinds.filter((k) => k === "speech").length
  const cut = [
    pauses ? (pauses === 1 ? "a pause" : `${pauses} pauses`) : "",
    kinds.includes("filler") ? "the “um”" : "",
    spoken ? `${spoken} spoken lines` : "",
  ].filter(Boolean)
  const rest = ops.filter((o) => !o.removes).map((o) => (o.say.charAt(0).toLowerCase() + o.say.slice(1)).replace(", a phrase", " a phrase"))
  const all = [cut.length ? `cut ${and(cut)}` : "", ...rest].filter(Boolean)
  const line = all.join(", ")
  return `${line.charAt(0).toUpperCase()}${line.slice(1)}.`
}

/** One run, one revision: each checkpoint numbers on from the ones before it. */
function checkpoint(writer: Writer, messages: CutsUIMessage[], label: string) {
  const before = messages.reduce((n, m) => n + m.parts.filter((p) => p.type === "data-checkpoint").length, 0)
  writer.data({ type: "data-checkpoint", id: `r${14 + before}`, data: { label, revision: 14 + before } })
}

function run(writer: Writer, messages: CutsUIMessage[], ops: readonly CutOp[], pace: number) {
  writeOps(writer, ops, { pace })
  writer.text(receiptWords(ops))
  checkpoint(writer, messages, ops.length === 1 ? ops[0].say : `${ops.length} edits`)
}

/* -------------------------------------------------------------- variants */

type Plan = { name: string; brief: string; prefix: string; ops: readonly CutOp[]; seconds: number; hookAt: string; check: string; fix?: string }

const VARIANTS: readonly Plan[] = [
  {
    name: "A · X, hook first",
    brief: "Opens on the strong line",
    prefix: "a:",
    ops: [TIGHTEN[4], TIGHTEN[0], TIGHTEN[1], TIGHTEN[3]],
    seconds: 21.4,
    hookAt: "0:00.8",
    check: "Looked at 3 frames: the caption covers the chin at 0:04",
    fix: "Moved the caption up",
  },
  {
    name: "B · LinkedIn, the numbers",
    brief: "The whole story, numbers held",
    prefix: "b:",
    ops: [TIGHTEN[0], TIGHTEN[1], TIGHTEN[2], TIGHTEN[3]],
    seconds: CUT_SECONDS,
    hookAt: "0:16.7",
    check: "Looked at 3 frames: all clear",
  },
  {
    name: "C · Changelog, wide",
    brief: "The take tightened, nothing else",
    prefix: "c:",
    ops: [TIGHTEN[0], TIGHTEN[1], TIGHTEN[2]],
    seconds: CUT_SECONDS,
    hookAt: "0:16.7",
    check: "Looked at 3 frames: all clear",
  },
]

/** A variant's steps: its edits, then its own self-check (and fix) inside the same run. */
function stepsOf(v: Plan) {
  return [
    ...v.ops.map((o) => ({ target: v.prefix + o.target, doing: o.doing, say: o.say })),
    { target: v.prefix + "preview", doing: "Looking at 3 frames", say: v.check },
    ...(v.fix ? [{ target: v.prefix + "caption", doing: "Moving the caption", say: v.fix }] : []),
  ]
}

function writeVariants(writer: Writer, messages: CutsUIMessage[], pace: number) {
  const all = VARIANTS.map(stepsOf)
  const out = (v: Plan, n: number): VariantOutput => ({
    steps: all[VARIANTS.indexOf(v)].map((s, i) => ({ target: s.target, say: i < n ? s.say : s.doing, done: i < n })),
    seconds: v.seconds,
    hookAt: v.hookAt,
    done: n >= all[VARIANTS.indexOf(v)].length,
  })
  const handles = VARIANTS.map((v) =>
    writer.tool("cut_variant", { title: v.name, input: { name: v.name, brief: v.brief, prefix: v.prefix } }),
  )
  const longest = Math.max(...all.map((s) => s.length))
  for (let n = 0; n <= longest; n++) {
    VARIANTS.forEach((v, i) => {
      if (n < all[i].length) handles[i].output(out(v, n), { preliminary: true })
    })
    handles[0].sleep(280 * pace)
  }
  VARIANTS.forEach((v, i) => handles[i].output(out(v, all[i].length)))
  writer.text(
    "I would post **A**. Its hook lands at 0.8 s; B and C wait until 0:16, and most people have scrolled by then. I looked at each cut before handing it over, and moved A's caption off the chin. B is the one for LinkedIn if the numbers should carry it.",
  )
  checkpoint(writer, messages, "Three cuts")
}

/* --------------------------------------------------------------- fallback */

/** Answers every message past the opening, through the piece's gate. */
export function flowFallback(gate: Gate, { pace = 1 }: { pace?: number } = {}) {
  return ({ writer, messages }: { writer: Writer; messages: CutsUIMessage[] }) => {
    const last = messages.at(-1)

    // The follow-up after the plan was answered.
    if (last?.role === "assistant") {
      const plan = [...last.parts].reverse().find((p) => p.type === "tool-plan_cut")
      const approved = plan && "approval" in plan && plan.approval?.approved
      if (!plan || !approved || !("input" in plan) || !plan.input) {
        writer.text("Left the take as it is.")
        return
      }
      const skipped = skippedFrom(messages)
      const ops = (plan.input.lines ?? []).flatMap((l) => {
        const op = l?.id && !skipped.includes(l.id) ? byId(l.id) : undefined
        return op ? [op] : []
      })
      run(writer, messages, ops, pace)
      return
    }

    const text = last ? textOf(last) : ""
    if (/three cuts/i.test(text)) {
      writeVariants(writer, messages, pace)
      return
    }
    const done = new Set(
      messages.flatMap((m) => m.parts.flatMap((p) => (isEdit(p) && p.state === "output-available" ? [p.input.target] : []))),
    )
    const want = /under 20/i.test(text)
      ? SHORTEN
      : /caption/i.test(text)
        ? TIGHTEN.filter((o) => o.id === "captions")
        : /push in/i.test(text)
          ? TIGHTEN.filter((o) => o.id === "zoom")
        : /9:16|vertical/i.test(text)
          ? [REFRAME]
          : // Under the smart gate a tighten is only a tighten, so captions
            // stay a request of their own (the one that goes straight through).
            gate === "smart"
            ? TIGHTEN.filter((o) => o.id !== "captions")
            : TIGHTEN
    const ops = want.filter((o) => !done.has(o.target))
    if (ops.length === 0) {
      writer.text("That is already in the cut.")
      return
    }
    if (gate === "ask") return writePlan(writer, ops, `Here is what I would do, ${fmt(TAKE.seconds)} to about ${fmt(TAKE.seconds - share(ops) * TAKE.seconds)}`)
    if (gate === "smart") {
      const why = askReason(ops, messages)
      if (why) return writePlan(writer, ops, why)
    }
    run(writer, messages, ops, pace)
  }
}

/**
 * The one recording every piece in round 1 cuts: a 37-second founder take
 * about shipping a shorter onboarding. Two long pauses, one filler "um", one
 * line worth a punch-in, and a 9:16 cut for X and LinkedIn as the target.
 *
 * Times are seconds in the source. The cut removes the two pauses (4.1 s)
 * and the "um" (0.4 s): 37.0 s in, 32.5 s out.
 */

export const TAKE = {
  file: "onboarding-take-3.mov",
  project: "Onboarding, 7 screens to 2",
  seconds: 37,
  size: "412 MB",
  words: 61,
} as const

export type SegKind = "speech" | "pause" | "filler"

export type Seg = {
  id: string
  at: number
  end: number
  kind: SegKind
  text: string
}

export const SEGMENTS: readonly Seg[] = [
  { id: "s1", at: 0, end: 0.9, kind: "speech", text: "So," },
  { id: "um", at: 0.9, end: 1.3, kind: "filler", text: "um," },
  { id: "s2", at: 1.3, end: 4, kind: "speech", text: "last week we shipped the new onboarding." },
  { id: "p1", at: 4, end: 6.3, kind: "pause", text: "2.3 s" },
  { id: "s3", at: 6.3, end: 9.6, kind: "speech", text: "We cut it from seven screens to two." },
  { id: "s4", at: 9.6, end: 13, kind: "speech", text: "Same questions, asked when they matter." },
  { id: "p2", at: 13, end: 14.8, kind: "pause", text: "1.8 s" },
  { id: "s5", at: 14.8, end: 18.4, kind: "speech", text: "Before, 48% of new people finished setup." },
  { id: "s6", at: 18.4, end: 21.2, kind: "speech", text: "This week it's 71%." },
  { id: "hook", at: 21.2, end: 25.6, kind: "speech", text: "The screens weren't the product. They were in the way." },
  { id: "s7", at: 25.6, end: 30.4, kind: "speech", text: "If you're building onboarding, count your screens." },
  { id: "s8", at: 30.4, end: 37, kind: "speech", text: "Then ask which ones you'd miss. Most of ours, nobody did." },
]

export const HOOK = SEGMENTS.find((s) => s.id === "hook")!

const removed = SEGMENTS.filter((s) => s.kind !== "speech")

/** A source time on the cut's clock, once the pauses and the "um" are gone. */
export function toCut(t: number): number {
  let gone = 0
  for (const r of removed) {
    if (r.end <= t) gone += r.end - r.at
    else if (r.at < t) gone += t - r.at
  }
  return t - gone
}

export const CUT_SECONDS = Math.round(toCut(TAKE.seconds) * 10) / 10 // 32.5

/** The spine after the cut: speech runs between the removed spots. */
export type Clip = { id: string; from: number; to: number; name: string }

export const RAW_CLIPS: readonly Clip[] = [{ id: "raw", from: 0, to: TAKE.seconds, name: "Take 3" }]

export const CUT_CLIPS: readonly Clip[] = (() => {
  const out: Clip[] = []
  let run: { from: number; to: number } | null = null
  for (const s of SEGMENTS) {
    if (s.kind === "speech") {
      run = run ? { from: run.from, to: s.end } : { from: s.at, to: s.end }
    } else if (run) {
      out.push({ id: `c${out.length + 1}`, ...run, name: `Take 3 · ${out.length + 1}` })
      run = null
    }
  }
  if (run) out.push({ id: `c${out.length + 1}`, ...run, name: `Take 3 · ${out.length + 1}` })
  return out
})()

/** Captions a phrase at a time, on the cut's clock. */
export const CAPTIONS = SEGMENTS.filter((s) => s.kind === "speech").map((s) => ({
  id: s.id,
  from: toCut(s.at),
  to: toCut(s.end),
  text: s.text,
}))

export const fmt = (s: number) => {
  const m = Math.floor(s / 60)
  const r = s - m * 60
  return `${m}:${r < 10 ? "0" : ""}${r.toFixed(1)}`
}

export const fmtWhole = (s: number) => {
  const m = Math.floor(s / 60)
  const r = Math.round(s - m * 60)
  return `${m}:${r < 10 ? "0" : ""}${r}`
}

/** One run's changes, each in the prose the tool reports. One run, one undo. */
export const RECEIPT = [
  { tool: "remove_silences", say: "Removed 2 pauses", detail: "4.1 s, at 0:04 and 0:13" },
  { tool: "delete_clip", say: "Cut the “um” after “So,”", detail: "0.4 s, at 0:01" },
  { tool: "punch_in", say: "Pushed in on the strong line", detail: "“They were in the way”, 0:16" },
  { tool: "add_captions", say: "Added captions, a phrase at a time", detail: `${TAKE.words} words, from the transcript` },
  { tool: "reframe", say: "Made it vertical, 9:16", detail: "your face kept in frame" },
] as const

/** The post the cut becomes, in three beats. */
export const POST = {
  did: "We cut onboarding from seven screens to two.",
  happenedLead: "First week, finished setup:",
  figure: "48% → 71%",
  happenedRest: "Same questions, asked when they matter.",
  meant: "The screens weren't the product. They were in the way.",
} as const

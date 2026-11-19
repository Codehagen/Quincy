import { us } from "./time"
import { DEFAULT_SILENCE, type SilenceOptions } from "./transcript"

/**
 * How hard "tighten" cuts, as three paces a person can name.
 *
 * The first tighten removed every pause over 350 ms down to 120 ms either
 * side. That is the edit that sounds like a list being read: every breath the
 * same length, and a full stop given no more room than a comma. Talk has a
 * rhythm, and the job of tightening is to take out the dead air without
 * taking out the rhythm with it.
 *
 * So a pace does three things the old rule did not:
 * - it *shortens* a pause to a kept beat rather than closing it to a sliver,
 * - it keeps a longer beat where a sentence ends than inside one,
 * - it lets the last word land, with room after it before the cut ends.
 *
 * `natural` is the default. `snappy` is the pace of a fast vlog or a short,
 * `relaxed` the pace of a story or an explainer where the pauses are part of
 * what is being said.
 */

export type Pace = "relaxed" | "natural" | "snappy"

export const PACES: readonly Pace[] = ["relaxed", "natural", "snappy"]

export const DEFAULT_PACE: Pace = "natural"

type PaceSpec = {
  label: string
  hint: string
  /** Pauses shorter than this are rhythm and stay untouched. */
  minPauseMs: number
  /** The beat a shortened pause inside a sentence keeps. */
  keepMs: number
  /** The beat a shortened pause after a full stop keeps. */
  sentenceKeepMs: number
  /** Room before the first word. */
  leadInMs: number
  /** Room after the last word. */
  endHoldMs: number
}

export const PACE_SPECS: Record<Pace, PaceSpec> = {
  relaxed: {
    label: "Relaxed",
    hint: "Only the long pauses go; the rest of the rhythm stays",
    minPauseMs: 900,
    keepMs: 400,
    sentenceKeepMs: 600,
    leadInMs: 200,
    endHoldMs: 600,
  },
  natural: {
    label: "Natural",
    hint: "Dead air out, a breath kept, a beat after every sentence",
    minPauseMs: 600,
    keepMs: 260,
    sentenceKeepMs: 420,
    leadInMs: 150,
    endHoldMs: 500,
  },
  snappy: {
    label: "Snappy",
    hint: "Fast vlog pace: short beats, still never word on word",
    minPauseMs: 400,
    keepMs: 160,
    sentenceKeepMs: 260,
    leadInMs: 100,
    endHoldMs: 350,
  },
}

/** The silence rule for a pace. */
export function silenceForPace(pace: Pace): SilenceOptions {
  const spec = PACE_SPECS[pace]
  return {
    ...DEFAULT_SILENCE,
    minSilenceUs: us(spec.minPauseMs * 1000),
    paddingUs: us(spec.leadInMs * 1000),
    keepUs: us(spec.keepMs * 1000),
    sentenceKeepUs: us(spec.sentenceKeepMs * 1000),
    endHoldUs: us(spec.endHoldMs * 1000),
  }
}

export function isPace(value: unknown): value is Pace {
  return (
    typeof value === "string" && (PACES as readonly string[]).includes(value)
  )
}

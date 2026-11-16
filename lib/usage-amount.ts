import { DEEPGRAM_USAGE_LABEL } from "./editor/ingest-limits"

/**
 * The amount column on /credits, in the unit the row was bought in.
 *
 * A model turn is tokens in and out. A `deepgram:transcribe` row holds seconds
 * of audio in `input_tokens` (lib/editor/ingest-meter.ts), and reading that as
 * "93 in · 0 out" would call ninety-three seconds ninety-three tokens. Other
 * label rows (`x:post`, `cuts:ingest`, …) bought no tokens and carry no count,
 * so they show no amount rather than "0 in · 0 out".
 *
 * The `model` value itself is still shown verbatim beside this; only the
 * amount is translated.
 */
export function usageAmount(row: {
  model: string
  inputTokens: number
  outputTokens: number
}): string | null {
  if (row.model === DEEPGRAM_USAGE_LABEL) {
    return `${formatSeconds(row.inputTokens)} of audio`
  }

  // A gateway slug has no colon; a label always has one.
  if (row.model.includes(":")) return null

  return `${row.inputTokens.toLocaleString("en-GB")} in · ${row.outputTokens.toLocaleString("en-GB")} out`
}

/** `42` → `"42s"`, `125` → `"2m 05s"`. */
export function formatSeconds(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds))
  if (whole < 60) return `${whole}s`

  const m = Math.floor(whole / 60)
  const s = whole % 60
  return `${m}m ${String(s).padStart(2, "0")}s`
}

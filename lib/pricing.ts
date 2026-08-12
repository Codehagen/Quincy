/**
 * What a turn costs, as an estimate.
 *
 * Two things stop this from being the truth, and both are deliberate:
 *
 * 1. These are Anthropic's published list rates. This app reaches the model
 *    through the Vercel AI Gateway, which bills on its own terms. The gateway
 *    dashboard is the invoice; this is a useful approximation of it.
 *
 * 2. Sonnet 5 is on introductory pricing until 2026-08-31 — $2/$10 per million
 *    rather than $3/$15. Everything recorded before that date is roughly half
 *    what the same usage will cost in September.
 *
 * Which is why `usage_event` stores token counts alongside the money: tokens
 * are the durable fact and survive a price change, cost is derived and does
 * not. When the rate moves, edit the table below and the *new* rows are right;
 * old rows keep the cost that was true when they were written.
 */

/** Micro-dollars: 1_000_000 = $1.00. Integers, so no float drift on a sum. */
export type Micros = number

type Rate = {
  /** Micro-dollars per input token. */
  input: number
  /** Micro-dollars per output token. */
  output: number
  /**
   * Micro-dollars per cached input token. Roughly a tenth of `input` — which
   * is why cached tokens are recorded separately: counting them at full price
   * would overstate a cached turn by about 10x.
   */
  cachedInput: number
}

/**
 * Introductory pricing, in effect until 2026-08-31. On 1 September this
 * becomes input 3, output 15, cachedInput 0.3 — change it then, and note the
 * date in the commit so the discontinuity in the data has an explanation.
 */
const SONNET_5: Rate = { input: 2, output: 10, cachedInput: 0.2 }

const RATES: Record<string, Rate> = {
  "anthropic/claude-sonnet-5": SONNET_5,
}

/** The rate we assume for a model we have no entry for. */
const FALLBACK = SONNET_5

export type TurnUsage = {
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
}

/**
 * Pure. No clock, no database, no network — which is what makes it the one
 * part of this feature worth unit-testing.
 */
export function estimateCostMicros(model: string, usage: TurnUsage): Micros {
  const rate = RATES[model] ?? FALLBACK

  return Math.round(
    usage.inputTokens * rate.input +
      usage.cachedInputTokens * rate.cachedInput +
      usage.outputTokens * rate.output
  )
}

/** For display. `1_234_567` → `"$1.23"`. */
export function formatMicros(micros: Micros): string {
  return `$${(micros / 1_000_000).toFixed(2)}`
}

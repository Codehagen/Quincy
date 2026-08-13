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

/**
 * DeepSeek V4 Flash, through the same gateway. $0.08 per million input and
 * $0.15 per million output, which is 0.08 and 0.15 micro-dollars per token.
 *
 * Cached input is listed at zero. It is recorded as a rate rather than dropped
 * so that `estimateCostMicros` needs no special case, and so the day this
 * provider starts charging for a cache read there is one number to change.
 *
 * **An entry here is not optional for a model that is actually used.** Without
 * one the fallback applies, and the fallback is Sonnet — 25x the input rate and
 * 67x the output rate. That does not just make /credits wrong: `ceilingVerdict`
 * is enforced against these numbers, so a $10 day would stop at about 30 cents
 * of real spend and the user would be locked out of their own product by an
 * arithmetic error.
 */
const DEEPSEEK_V4_FLASH: Rate = { input: 0.08, output: 0.15, cachedInput: 0 }

const RATES: Record<string, Rate> = {
  "anthropic/claude-sonnet-5": SONNET_5,
  "deepseek/deepseek-v4-flash-0731": DEEPSEEK_V4_FLASH,
  // The floating alias resolves to the same weights today. Priced together so
  // that pinning or unpinning the date is not also a pricing change.
  "deepseek/deepseek-v4-flash": DEEPSEEK_V4_FLASH,
}

/**
 * The rate we assume for a model we have no entry for.
 *
 * Deliberately the most expensive one in the table. A model nobody priced is a
 * model nobody thought about, and over-reporting its cost trips the ceiling
 * early and loudly; under-reporting it spends real money quietly. Of the two
 * ways to be wrong, only one is recoverable.
 */
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

/**
 * How hard the model is asked to think, in one place.
 *
 * Every model this product can be pointed at now takes a reasoning effort —
 * Sonnet 5, GPT-5.6 Luna and DeepSeek V4 all advertise it on the gateway — and
 * it is the setting with the largest effect on both the bill and the wait. It
 * belongs beside the model id rather than at twelve call sites, for the same
 * reason `CHAT_MODEL` does: a knob that has to be turned in twelve places is a
 * knob that ends up turned in nine.
 *
 * **`low` is the default, and it was measured rather than assumed.** The same
 * angle-generation task on the same material, through the gateway on
 * 2026-08-13:
 *
 * | model                | latency | out tokens | cost      |
 * | -------------------- | ------- | ---------- | --------- |
 * | gpt-5.6-luna, low    | 3.5s    | 255        | $0.000373 |
 * | deepseek-v4-flash    | 8.7s    | 720        | $0.000379 |
 * | claude-sonnet-5      | 11.2s   | 771        | $0.009260 |
 *
 * Luna at low effort was the fastest, the cheapest by a hair, and produced the
 * sharpest hooks of the three; Sonnet cost 25x for output that was not better.
 * Higher effort buys reasoning tokens, and reasoning tokens are billed as
 * output — so raising this raises the bill twice, once for the thinking and
 * again for the latency a user waits through.
 *
 * Override with `REASONING_EFFORT` when a path needs more. Anything the
 * provider does not recognise is ignored by the gateway rather than rejected,
 * which is why an unknown value degrades to the provider's own default instead
 * of failing the call.
 */
const EFFORT = process.env.REASONING_EFFORT ?? "low"

/**
 * Spread into `generateObject`/`streamText`. Keyed per provider because each
 * names the option itself; the gateway passes through whichever matches the
 * model in use and drops the rest, so one object serves every model.
 */
export const REASONING = {
  openai: { reasoningEffort: EFFORT },
  anthropic: { reasoningEffort: EFFORT },
  deepseek: { reasoningEffort: EFFORT },
} as const

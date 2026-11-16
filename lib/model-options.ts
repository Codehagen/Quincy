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
 *
 * **What the table above does not cover is the draft itself.** Every task it
 * measured — angles, selection, extraction — is a task whose output another
 * step reads and can reject. The drafting call is the one whose output a person
 * puts under their own name, and no number here was ever collected for it. See
 * `DRAFTING_EFFORT` below.
 */
const EFFORT = process.env.REASONING_EFFORT ?? "low"

/**
 * The ladder, in the order every provider on the gateway orders it.
 *
 * Written out rather than computed because "one step above" has to mean
 * something specific and the providers do not agree on a numeric scale — they
 * agree on these names. A value that is not on the ladder (a provider-specific
 * string, a typo, a future level) has no step above it that we can name, so it
 * is returned unchanged: passing the operator's own value through is the
 * honest answer, and the gateway already degrades an unknown one to the
 * provider's default rather than failing the call.
 */
const LADDER = ["minimal", "low", "medium", "high"] as const

function oneStepAbove(effort: string): string {
  const at = (LADDER as readonly string[]).indexOf(effort)
  if (at === -1 || at === LADDER.length - 1) return effort
  return LADDER[at + 1]
}

/**
 * How hard the model thinks for the one output a person publishes.
 *
 * The argument for `low` above is an argument about *selection* work: an angle
 * that comes back weak costs a click, and there are five of them on the card.
 * The draft is different in kind — it is the end of the pipeline, it is what
 * goes out under the user's name, and plan 027's A/B measured that the model
 * behind it decides whether a draft passes the three checks (the writer as the
 * subject of the first line, three beats present, the number on its own line)
 * far more than any other single variable. A knob with that much leverage
 * should not inherit its value from a knob tuned for hook generation.
 *
 * **One step above the global, and this default is not measured the way the
 * table above is.** That is the honest state of it: the table came from real
 * gateway runs on 2026-08-13, and this line came from an argument. It is set
 * one step rather than straight to `high` because reasoning tokens bill as
 * output and the draft prompt is the largest in the product — the brain, eight
 * verbatim example posts and the material — so effort here is the most
 * expensive effort we buy anywhere.
 *
 * **`scripts/ab-shipped-models.ts` is what would settle it.** It already runs
 * the shipped-work pipeline twice over the same merges and scores the results
 * against those three checks; today it varies `DRAFTING_MODEL`/`CHAT_MODEL` and
 * holds `REASONING_EFFORT` fixed (it prints the effort it ran at, which is how
 * we know). The same harness with the effort as its axis, model held, is the
 * measurement this comment is missing. It spends real model calls, so running
 * it is the owner's call.
 *
 * Override with `DRAFTING_REASONING_EFFORT`, which is independent of
 * `REASONING_EFFORT` in both directions — raising the global for a debugging
 * session does not silently raise the bill on every draft, and pinning this one
 * does not pin the other eleven call sites.
 */
const DRAFTING_EFFORT =
  process.env.DRAFTING_REASONING_EFFORT ?? oneStepAbove(EFFORT)

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

/**
 * `REASONING` for the drafting call, and only for it.
 *
 * Same shape as `REASONING` so a call site swaps one identifier and nothing
 * else. Deliberately not a function taking an effort — a per-call parameter is
 * how twelve call sites end up with twelve opinions, which is the thing this
 * file exists to prevent. There is one exception in the product and this is it.
 */
export const DRAFTING_REASONING = {
  openai: { reasoningEffort: DRAFTING_EFFORT },
  anthropic: { reasoningEffort: DRAFTING_EFFORT },
  deepseek: { reasoningEffort: DRAFTING_EFFORT },
} as const

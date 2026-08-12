/**
 * Undo the Gateway's occasional habit of stringifying a whole object.
 *
 * `generateObject` through the AI Gateway on `anthropic/claude-sonnet-5`
 * intermittently returns the entire result JSON-encoded as a *string* inside
 * the first property of the object, with every other property missing. A
 * response that should be
 *
 *     { angles: [...], groundedIn: "their pricing rewrite" }
 *
 * arrives as
 *
 *     { angles: '{"angles":[...],"groundedIn":"their pricing rewrite"}' }
 *
 * Measured 2026-08-08 on the said-angles prompt, and **not deterministic** —
 * the same prompt succeeds and fails across consecutive runs, so every rate
 * here is a small sample rather than a constant. Before any defence, 2 of 3
 * and 1 of 3 in two runs. With the unwrap alone, 1 of 10. With the unwrap and
 * one retry, 0 visible retries in 16. lib/adapt.ts already documents one
 * *trigger* for this
 * (`minItems`/`maxItems`, which made it happen every time and is banned for
 * that reason), but removing the trigger did not remove the fault. This is the
 * residue: rarer, silent, and it lands as `object.angles.filter is not a
 * function` several frames away from anything that names a model.
 *
 * **This is not a voice bug.** Every `generateObject` call in the product has
 * the same exposure, including the shipped adapt path — a run that hits it
 * surfaces to the user as "Quincy could not find an angle in that", which
 * reads as the model declining rather than as a parse failure. That is the
 * expensive part: the failure is indistinguishable from a legitimate empty
 * answer, so it would never be reported as a bug.
 *
 * A retry would also work and is worse: the call has already been paid for,
 * and the payload is right there, intact, correctly formed, one `JSON.parse`
 * away. Spending a second call to get a second copy of an answer we already
 * hold is money for nothing.
 */

/**
 * There is more than one mangling, which is why this file also exports a retry.
 *
 * A second failure mode, captured the same day and *not* recoverable by the
 * unwrap below: the array collapses into scalar properties at the root and the
 * model's own tool-call syntax leaks into the values.
 *
 *     keys: ['angles', 'shape', 'why', 'groundedIn']
 *     angles: '\n<parameter name="hook">Tenker på prising igjen…'
 *     shape:  'Short post'
 *     why:    'Uferdig tanke, postet før den er løst…'
 *
 * That is one angle, flattened, with `<parameter name="hook">` markup where a
 * value should be. It is not a stringified object and no parse recovers it —
 * the structure the model meant to emit was never encoded at all.
 *
 * Two distinct manglings from one call site is the signal that enumerating
 * them is the wrong strategy: the third will be found by a user rather than by
 * this file. So the unwrap handles the case that is *free* to recover — the
 * data is already there, correct, one `JSON.parse` away — and `retryMalformed`
 * handles everything else by asking again, which is what a well-formed answer
 * on the second attempt is worth paying for.
 */

/**
 * Run `call` until its result is usable, at most `attempts` times.
 *
 * **Bounded at two by default, and the bound is the point.** AGENTS.md asks
 * every spending path for a ceiling; a retry loop is a spending path that
 * looks like error handling, which is exactly how one ends up unbounded. Two
 * attempts turns a measured ~10-15% malformed rate into ~1-2% while costing
 * the extra call only on the runs that actually needed it.
 *
 * `usable` decides for the answers that come back. It is given the value and
 * must say whether it is the shape the caller needs — a predicate rather than a
 * try/catch, because the mangling this was built for does not throw. It returns
 * a plausible object with a string where an array belongs, and the throw
 * happens later, somewhere that cannot retry.
 *
 * **A `GenerationFailed` is retried too, and it is the case that needed it
 * most.** On 2026-08-08 at 22:05:20 UTC a drafting call came back as
 * `AI_NoObjectGeneratedError` — the model did not return a response — and this
 * loop gave it one attempt where the paragraph above promises two, because an
 * unguarded `await` exits a loop on a throw. The user pressed "Draft this" and
 * got their own hook back as the post body. Nothing came back, so there is
 * nothing to salvage and no reason to believe the second attempt inherits the
 * first one's problem: it is the most retry-worthy failure there is, and it was
 * the only one not covered.
 *
 * **Only that one.** `GenerationFailed` is thrown by exactly one thing — a
 * `catch` wrapped around a model call — so anything else reaching here is ours:
 * a bug in an unwrap, a database error, a mistake in a callback. Retrying those
 * buys a second copy of the same bug at model prices, so they propagate on the
 * first attempt, untouched. The `instanceof` is the whole safety argument.
 *
 * The ceiling does not move. Two attempts is still the worst case and still the
 * most this can ever cost; what changes is which failures are allowed to use
 * the second one.
 */
export async function retryMalformed<T>(
  call: (attempt: number) => Promise<T>,
  usable: (value: T) => boolean,
  {
    attempts = 2,
    label = "structured output",
  }: {
    attempts?: number
    label?: string
  } = {}
): Promise<T> {
  let last: T | undefined

  /**
   * The most recent model failure, or nothing if the last attempt returned.
   *
   * Cleared on every attempt that comes back at all, so a throw followed by a
   * malformed answer falls through to the return below — which is the caller's
   * "the model found nothing" path and already handled. Kept when the last
   * attempt threw, because a caller that catches a failed generation to build a
   * fallback needs the error, not an `undefined` it never expected.
   */
  let thrown: GenerationFailed | undefined

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      last = await call(attempt)
      thrown = undefined
    } catch (cause) {
      // Ours propagates; the model's is retried. See the doc comment above.
      if (!(cause instanceof GenerationFailed)) throw cause

      thrown = cause
      console.error(
        `[${label}] no response on attempt ${attempt + 1} of ${attempts}`
      )
      continue
    }

    if (usable(last)) return last

    console.error(
      `[${label}] malformed result on attempt ${attempt + 1} of ${attempts}`
    )
  }

  /**
   * Attempts ran out with the last one throwing. The bill it carries is the
   * accumulated one — every attempt's spend, not just the final call's — so
   * rethrowing this exact instance rather than the first is what keeps the
   * caller's meter honest.
   */
  if (thrown) throw thrown

  /**
   * The last one is returned rather than thrown on.
   *
   * The caller already knows how to handle an empty result — `createRiffFromPost`
   * and `completeSpokenRiff` both turn "no angles" into a message a person can
   * read. Throwing here would replace that with a stack trace and lose the
   * distinction between "the model found nothing" and "the model answered
   * badly twice", which the log above records and the user does not need.
   */
  return last as T
}

/**
 * What every model call site in this product records to `recordUsage`.
 *
 * Declared here rather than in any one caller because `usageAccumulator` below
 * has to name it, and the three callers that meter (`generateDraft`, the adapt
 * generators, `compileVoice`) each had a structurally identical copy.
 */
export type StructuredUsage = {
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
}

/**
 * Sums usage across every attempt, so a retry is not billed as one call.
 *
 * `retryMalformed` returns only the last result, which is correct for the
 * *answer* and wrong for the *bill*: a malformed first attempt was still
 * generated, still charged by the gateway, and its tokens are sitting in the
 * result that gets thrown away. Metering the survivor alone under-reports a
 * retried call by about half.
 *
 * How often that happens is genuinely uncertain and the honest numbers are
 * small: the residual malformed rate after the unwrap measured 1 in 10 in one
 * sample and 0 in 16 in another, both on the said prompt. So this is not a big
 * number — it is an undercount in the one direction nobody ever notices, of
 * exactly the same shape as the transcription meter this feature already
 * shipped once. Nothing errors; the figure is just quietly too small.
 *
 * Lives here rather than in lib/adapt.ts, where it was written, because it is
 * the other half of `retryMalformed` — a retry that is not accumulated is a
 * retry that is under-metered, and keeping the two in one file is what makes
 * that pairing obvious at the next call site.
 */
export function usageAccumulator() {
  const total: StructuredUsage = {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
  }

  return {
    total,
    /**
     * Takes the SDK's shape or our own, because both arrive here.
     *
     * A successful call hands over `result.usage`, where the cache read is
     * nested under `inputTokenDetails`. `usageFromError` has already flattened
     * it to `cachedInputTokens`, and so has any `StructuredUsage` being folded
     * in from elsewhere. Reading both is one `??` and removes the only way to
     * pass this function a real number it silently drops.
     */
    add(usage: {
      inputTokens?: number
      outputTokens?: number
      cachedInputTokens?: number
      inputTokenDetails?: { cacheReadTokens?: number }
    }) {
      total.inputTokens += usage.inputTokens ?? 0
      total.cachedInputTokens +=
        usage.cachedInputTokens ?? usage.inputTokenDetails?.cacheReadTokens ?? 0
      total.outputTokens += usage.outputTokens ?? 0
    },
  }
}

/**
 * The tokens a *failed* generation still cost.
 *
 * `generateObject` does not only fail by returning the wrong shape. It also
 * throws — `AI_NoObjectGeneratedError: the model did not return a response`,
 * measured in production on 2026-08-08 — and a throw skips every `spent.add`
 * downstream of the `await`, so the run meters as free. That one cost 3,156
 * input tokens and wrote no `usage_event` row at all: money spent, /credits
 * blind to it, which is the exact shape of undercount AGENTS.md's Money
 * section exists to stop.
 *
 * The AI SDK already hangs the usage off those errors, so nothing has to be
 * estimated — it just has to be read. Typed structurally rather than against
 * `NoObjectGeneratedError`, because `AI_APICallError` and friends carry the
 * same field and none of them share a base class that promises it.
 */
export function usageFromError(cause: unknown): StructuredUsage | undefined {
  if (!cause || typeof cause !== "object" || !("usage" in cause)) return
  const usage = (cause as { usage?: unknown }).usage
  if (!usage || typeof usage !== "object") return

  const { inputTokens, outputTokens, inputTokenDetails } = usage as {
    inputTokens?: number
    outputTokens?: number
    inputTokenDetails?: { cacheReadTokens?: number }
  }

  // A response that carried no usage at all is not a zero — it is nothing to
  // report, and reporting it as a zero would be indistinguishable from a call
  // that genuinely cost nothing.
  if (typeof inputTokens !== "number" && typeof outputTokens !== "number") {
    return
  }

  return {
    inputTokens: inputTokens ?? 0,
    cachedInputTokens: inputTokenDetails?.cacheReadTokens ?? 0,
    outputTokens: outputTokens ?? 0,
  }
}

/**
 * Whether this usage is worth a `usage_event` row.
 *
 * Two different nothings arrive at a call site wearing the same face. The
 * accumulator starts at zero because nothing has been spent yet, and
 * `usageFromError` returns `undefined` when an error carried no usage at all —
 * a connection reset, an abort, a model id that does not exist. Fold the second
 * into the first and you get `{0, 0, 0}`, which is indistinguishable from a
 * call that genuinely reached the model and cost nothing.
 *
 * Recording that is not merely useless. `summariseUsage` counts rows, so a zero
 * row is a phantom turn on /credits, and `recentUsage` lists it as an entry
 * that happened. The page whose entire job is to be an accurate number would be
 * wrong in the direction nobody checks — upward, quietly, on failures.
 *
 * The rule is `usageFromError`'s own, one layer up: a call that never reached
 * the model owes nothing. It lives here rather than inside `recordUsage`
 * because a caller that genuinely wants to record a zero-cost event must still
 * be able to, and burying the judgment in the writer hides it from the call
 * sites that actually make it.
 */
export function hasSpend(usage: StructuredUsage): boolean {
  return (
    usage.inputTokens > 0 ||
    usage.cachedInputTokens > 0 ||
    usage.outputTokens > 0
  )
}

/**
 * A generation that threw, carrying the bill with it.
 *
 * The metering split in this product is deliberate: the model call knows what
 * it spent and the call site knows who to bill, so usage travels from one to
 * the other as a return value. A throw is the one path where that return value
 * never happens — which is why the failure that spends and meters zero has
 * shown up twice now, once in heartbeat and once in drafting.
 *
 * This is the return value for the throwing path. The generator catches, adds
 * whatever `usageFromError` can recover to what earlier attempts already cost,
 * and rethrows this; the call site keeps its existing `catch` and gains a bill
 * to record. `cause` is preserved so the log line is still the SDK's own error
 * with its stack, not a paraphrase of it.
 */
export class GenerationFailed extends Error {
  constructor(
    override readonly cause: unknown,
    readonly usage: StructuredUsage
  ) {
    super(cause instanceof Error ? cause.message : String(cause))
    this.name = "GenerationFailed"
  }
}

/**
 * Return `object` with the Gateway's stringification undone, if it happened.
 *
 * `required` is the set of keys the schema demands. The unwrap only fires when
 * a *string* is sitting where a value should be and parsing it yields an
 * object carrying those same keys — which is specific enough that a schema
 * whose property is legitimately a string can never trip it. Anything else is
 * returned untouched, so this is safe to wrap around any `generateObject`
 * call whether or not it has ever misbehaved.
 *
 * `arrays` names the keys the caller expects to hold an array, and handles the
 * *third* mangling — the one measured on 2026-08-09, and the reason this
 * paragraph exists.
 *
 *     { versions: '[{"channel":"x","body":"…"},{"channel":"linkedin",…}]' }
 *
 * The array, correctly formed, JSON-encoded into the property that should
 * hold it. Not the whole object stuffed into the first key (the case above),
 * so `required.every(k => k in candidate)` never matched it and the cheap
 * `startsWith("{")` reject threw it out one line earlier. There was even a
 * test asserting this shape passed through untouched, written when the only
 * observed fault put an object there.
 *
 * It is not rare. Probed against the drafting call the same day: 17 of 20
 * attempts across five prompt variants, including prompts that had not been
 * touched in weeks. Every one of those became `versions: []` at the call site
 * and reached /drafts as the hook echoed back — which is what the
 * hook-and-nothing-else rows in `draft_version` are.
 *
 * Recovering it is the same bargain as the object case: the answer is already
 * paid for and one `JSON.parse` away. The gate is `arrays` rather than a bare
 * "does it start with `[`", because only the caller knows whether a string
 * there is a mangled array or a hook that happens to open with a bracket.
 */
/**
 * Parse a JSON array off the front of `text`, or return null.
 *
 * Written for one measured shape and deliberately not more general. What the
 * Gateway actually hands back is not a stringified array — it is *the rest of
 * the object*, from just after `{"versions":` to the end:
 *
 *     '[{"channel":"x","body":"…"},{"channel":"linkedin","body":"…"}]}\n'
 *                                                                  ↑ orphan
 *
 * A complete, correct array, then the closing brace of the object it was
 * lifted out of. `JSON.parse` rejects the whole thing over that one character,
 * which is why the first version of this recovery — a plain parse — still left
 * 4 of 4 attempts malformed in the probe on 2026-08-09.
 *
 * So the array is scanned to its matching bracket and parsed alone. What is
 * left over has to be nothing but whitespace and closing braces: that is the
 * signature of this fault and nothing else. A string carrying real content
 * after the array is some other problem, and guessing at it here would be the
 * "enumerate the manglings" strategy this file already argues against.
 *
 * Truncation is handled by falling out. A response cut off against the output
 * ceiling never closes its bracket, `depth` never returns to zero, and the
 * caller gets null and retries — which is the right answer, because half an
 * array is not a draft.
 */
function parseLeadingArray(text: string): unknown[] | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith("[")) return null

  let depth = 0
  let inString = false
  let escaped = false
  let end = -1

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i]

    if (escaped) {
      escaped = false
      continue
    }
    if (char === "\\") {
      // Only meaningful inside a string, but harmless outside one: JSON has
      // no bare backslash, so a document containing one is already lost.
      escaped = true
      continue
    }
    if (char === '"') {
      inString = !inString
      continue
    }
    if (inString) continue

    if (char === "[") depth += 1
    else if (char === "]") {
      depth -= 1
      if (depth === 0) {
        end = i + 1
        break
      }
    }
  }

  if (end === -1) return null

  // Only the orphaned tail of the object the array was lifted out of.
  const rest = trimmed.slice(end).trim()
  if (rest && !/^\}+$/.test(rest)) return null

  try {
    const parsed = JSON.parse(trimmed.slice(0, end))
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function unwrapStringifiedObject<T extends object>(
  object: T,
  required: readonly (keyof T & string)[],
  arrays: readonly (keyof T & string)[] = []
): T {
  if (!object || typeof object !== "object") return object

  /**
   * The array case runs first, and only on keys the caller declared.
   *
   * Before the object case rather than after because they cannot both be
   * true of the same property, and this one is now by far the more common —
   * checking it second would mean walking every key twice on most calls.
   *
   * The result is a copy with that one property replaced. The root object is
   * never reinterpreted, which is the distinction the old
   * "ignores a stringified array" test was protecting and this keeps: a
   * mangled array goes back into the key it belongs to, and everything else
   * on the object stays exactly where the model put it.
   */
  for (const key of arrays) {
    const value = object[key]
    if (typeof value !== "string") continue

    const parsed = parseLeadingArray(value)
    if (!parsed) continue

    return { ...object, [key]: parsed }
  }

  for (const key of Object.keys(object) as (keyof T & string)[]) {
    const value = object[key]
    if (typeof value !== "string") continue

    // Cheap reject before the parse. The overwhelming majority of string
    // properties are prose, and prose does not start with a brace.
    const trimmed = value.trim()
    if (!trimmed.startsWith("{")) continue

    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      // A string that merely looks like JSON. Leave it alone — it is somebody's
      // hook, and rewriting it would be worse than the bug.
      continue
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue

    /**
     * Only when the parsed object accounts for the whole schema.
     *
     * Requiring *every* declared key is what makes this safe rather than
     * clever. A model that legitimately returns a JSON string in one field
     * produces an object missing the rest, so it fails this check and passes
     * through untouched. The bug produces a complete object, because it is the
     * complete object.
     */
    const candidate = parsed as Record<string, unknown>
    const complete = required.every((k) => k in candidate)
    if (!complete) continue

    return candidate as T
  }

  return object
}

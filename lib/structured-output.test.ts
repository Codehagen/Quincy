import { describe, expect, it, vi } from "vitest"

import {
  GenerationFailed,
  retryMalformed,
  unwrapStringifiedObject,
  usageAccumulator,
  usageFromError,
} from "./structured-output"

/**
 * The payload below is real, captured from the Gateway on 2026-08-08 while
 * verifying the voice path — one call in five on the angles schema, and not
 * deterministic. Pinning the actual shape matters more than a synthetic one:
 * the giveaway is that `groundedIn` is *absent* rather than empty, and a
 * hand-written fixture would probably have included it.
 */
const REAL_FAILURE = {
  angles: JSON.stringify({
    angles: [
      {
        hook: "Per-seat pricing punishes exactly the customer you want.",
        shape: "Short post",
        why: "The core paradox, stated directly.",
      },
    ],
    groundedIn: "their own pricing rewrite",
  }),
} as unknown as { angles: { hook: string }[]; groundedIn: string }

describe("unwrapStringifiedObject", () => {
  it("recovers the object the Gateway stringified", () => {
    const out = unwrapStringifiedObject(REAL_FAILURE, ["angles", "groundedIn"])

    expect(Array.isArray(out.angles)).toBe(true)
    expect(out.angles).toHaveLength(1)
    expect(out.groundedIn).toBe("their own pricing rewrite")
  })

  /**
   * The /riffs 500 of 2026-08-08, pinned at the layer that can be tested.
   *
   * `generateDraft`'s schema has ONE required key, so the completeness check
   * that makes this function safe — "the parsed object accounts for the whole
   * schema" — reduces to a single `"versions" in candidate`. Worth a test of
   * its own rather than assuming the angles case covers it: a one-key schema
   * is the weakest form of that guard, and this asserts it still recovers the
   * payload rather than passing the string through to `.slice`.
   *
   * The pass-through case below is the other half. `versions` is array-typed
   * in the schema, so a string there is already the fault — there is no
   * healthy response the unwrap could damage.
   */
  it("recovers a one-key schema, where the completeness check is weakest", () => {
    const mangled = {
      versions: JSON.stringify({
        versions: [{ channel: "x", body: "the post" }],
      }),
    } as unknown as { versions: { channel: string; body: string }[] }

    const out = unwrapStringifiedObject(mangled, ["versions"])

    // Before the fix this stayed a string, `.slice` silently returned a
    // shorter string, and `versions.map` threw a 500 two statements later.
    expect(Array.isArray(out.versions)).toBe(true)
    expect(out.versions).toEqual([{ channel: "x", body: "the post" }])
  })

  it("leaves a healthy one-key object exactly as it was", () => {
    const healthy = { versions: [{ channel: "x", body: "the post" }] }

    expect(unwrapStringifiedObject(healthy, ["versions"])).toBe(healthy)
  })

  it("leaves a healthy object exactly as it was", () => {
    const healthy = {
      angles: [{ hook: "a real hook" }],
      groundedIn: "something",
    }

    // Identity, not just equality: a correct response must not be rebuilt.
    expect(unwrapStringifiedObject(healthy, ["angles", "groundedIn"])).toBe(
      healthy
    )
  })

  /**
   * The safety property the whole helper rests on.
   *
   * A hook is prose written by a model, and a model can write a hook that
   * happens to start with a brace and parse as JSON. Rewriting the object in
   * that case would be a worse bug than the one being fixed, so the unwrap
   * only fires when the parsed result accounts for every schema key.
   */
  it("ignores a string field that merely parses as JSON", () => {
    const awkward = {
      groundedIn: '{"not":"the whole object"}',
      angles: [{ hook: "a real hook" }],
    }

    expect(unwrapStringifiedObject(awkward, ["angles", "groundedIn"])).toBe(
      awkward
    )
  })

  it("ignores prose that opens with a brace but is not JSON", () => {
    const prose = {
      groundedIn: "{ this is not json, it is a hook about braces",
      angles: [{ hook: "x" }],
    }

    expect(unwrapStringifiedObject(prose, ["angles", "groundedIn"])).toBe(prose)
  })

  it("leaves a stringified array alone when the caller did not declare the key", () => {
    // The old assertion, kept: the *root* is never reinterpreted from an
    // array, and a caller that says nothing about its arrays gets the
    // conservative answer.
    const arrayish = { angles: "[1,2,3]", groundedIn: "x" }

    expect(unwrapStringifiedObject(arrayish, ["angles", "groundedIn"])).toBe(
      arrayish
    )
  })

  /**
   * The third mangling, measured on the drafting call on 2026-08-09: 17 of 20
   * attempts came back with the versions array JSON-encoded into its own
   * property. Every one of them reached /drafts as the hook echoed back.
   */
  it("parses an array that arrived JSON-encoded in its own property", () => {
    const mangled = {
      versions: JSON.stringify([
        { channel: "x", body: "one" },
        { channel: "linkedin", body: "two" },
      ]),
    } as unknown as { versions: { channel: string; body: string }[] }

    const out = unwrapStringifiedObject(mangled, ["versions"], ["versions"])

    expect(Array.isArray(out.versions)).toBe(true)
    expect(out.versions).toHaveLength(2)
    expect(out.versions[1].body).toBe("two")
  })

  it("keeps the other properties when it recovers an array", () => {
    const mangled = {
      groundedIn: "their pricing rewrite",
      angles: JSON.stringify([{ hook: "one" }]),
    } as unknown as { groundedIn: string; angles: { hook: string }[] }

    const out = unwrapStringifiedObject(
      mangled,
      ["angles", "groundedIn"],
      ["angles"]
    )

    expect(out.angles).toHaveLength(1)
    expect(out.groundedIn).toBe("their pricing rewrite")
  })

  it("does not touch a declared key holding prose that opens with a bracket", () => {
    const prose = {
      versions: "[this is a hook about brackets, not JSON",
    } as unknown as { versions: unknown }

    expect(unwrapStringifiedObject(prose, ["versions"], ["versions"])).toBe(
      prose
    )
  })

  /**
   * The shape actually measured, which a plain `JSON.parse` rejects: the array
   * followed by the closing brace of the object it was lifted out of.
   */
  it("recovers an array trailed by the orphaned closing brace", () => {
    const mangled = {
      versions: '[{"channel":"x","body":"one"}]}\n',
    } as unknown as { versions: { channel: string; body: string }[] }

    const out = unwrapStringifiedObject(mangled, ["versions"], ["versions"])

    expect(out.versions).toHaveLength(1)
    expect(out.versions[0].body).toBe("one")
  })

  it("is not fooled by a bracket inside a string value", () => {
    const mangled = {
      versions: '[{"channel":"x","body":"a ] and a } walk in"}]}',
    } as unknown as { versions: { channel: string; body: string }[] }

    const out = unwrapStringifiedObject(mangled, ["versions"], ["versions"])

    expect(out.versions).toHaveLength(1)
    expect(out.versions[0].body).toBe("a ] and a } walk in")
  })

  it("refuses an array truncated before its closing bracket", () => {
    // Cut off against the output ceiling. Half an array is not an answer, and
    // returning one would be worse than retrying.
    const cut = { versions: '[{"channel":"x","body":"one"' } as unknown as {
      versions: unknown
    }

    expect(unwrapStringifiedObject(cut, ["versions"], ["versions"])).toBe(cut)
  })

  it("refuses an array with real content after it", () => {
    // Only whitespace and closing braces are the known fault. Anything else
    // is a different problem and must not be silently truncated away.
    const extra = {
      versions: '[{"channel":"x","body":"one"}] and then some prose',
    } as unknown as { versions: unknown }

    expect(unwrapStringifiedObject(extra, ["versions"], ["versions"])).toBe(
      extra
    )
  })

  it("does not turn a declared key into a non-array", () => {
    // Parses fine, is not an array. Must pass through rather than become one.
    const scalar = { versions: '"just a string"' } as unknown as {
      versions: unknown
    }

    expect(unwrapStringifiedObject(scalar, ["versions"], ["versions"])).toBe(
      scalar
    )
  })

  it("works for a schema with different keys", () => {
    // The adapt path's schema, so the helper is not quietly angles-shaped.
    const failed = {
      idea: JSON.stringify({
        idea: "why per-seat punishes your best customer",
        groundedIn: "their pricing rewrite",
        versions: [{ channel: "x", body: "..." }],
      }),
    } as unknown as { idea: string; groundedIn: string; versions: unknown[] }

    const out = unwrapStringifiedObject(failed, [
      "idea",
      "groundedIn",
      "versions",
    ])

    expect(out.idea).toBe("why per-seat punishes your best customer")
    expect(out.versions).toHaveLength(1)
  })

  it("survives null and non-objects without throwing", () => {
    expect(
      unwrapStringifiedObject(null as unknown as object, ["a"] as never)
    ).toBeNull()
  })
})

describe("retryMalformed", () => {
  it("does not spend a second call when the first is fine", async () => {
    const call = vi
      .fn<() => Promise<{ angles: unknown }>>()
      .mockResolvedValue({ angles: [1] })

    const out = await retryMalformed(call, (v) => Array.isArray(v.angles))

    expect(out).toEqual({ angles: [1] })
    // The whole reason the bound exists. A retry loop that always retries is a
    // spending path wearing error handling as a disguise.
    expect(call).toHaveBeenCalledTimes(1)
  })

  it("asks again when the first result is malformed", async () => {
    const call = vi
      .fn<() => Promise<{ angles: unknown }>>()
      .mockResolvedValueOnce({ angles: '{"angles":[]}' })
      .mockResolvedValueOnce({ angles: [1, 2] })

    const out = await retryMalformed(call, (v) => Array.isArray(v.angles))

    expect(out).toEqual({ angles: [1, 2] })
    expect(call).toHaveBeenCalledTimes(2)
  })

  it("stops at the bound and returns the last attempt rather than throwing", async () => {
    const malformed = { angles: "still a string" }
    const call = vi
      .fn<() => Promise<{ angles: unknown }>>()
      .mockResolvedValue(malformed)

    const out = await retryMalformed(call, (v) => Array.isArray(v.angles))

    // Returned, not thrown: the callers already turn an empty result into a
    // sentence a person can read, and a stack trace would replace that.
    expect(out).toBe(malformed)
    expect(call).toHaveBeenCalledTimes(2)
  })

  it("honours a custom attempt count", async () => {
    const call = vi
      .fn<() => Promise<{ angles: unknown }>>()
      .mockResolvedValue({ angles: "bad" })

    await retryMalformed(call, (v) => Array.isArray(v.angles), { attempts: 3 })

    expect(call).toHaveBeenCalledTimes(3)
  })

  /**
   * Regression: found by /review on 2026-08-08.
   *
   * `retryMalformed` returns only the surviving attempt, which is right for
   * the answer and wrong for the bill — the malformed first attempt was still
   * generated and still charged. Metering the survivor alone under-reported a
   * retried call by about half. The residual malformed rate after the unwrap
   * measured 1 in 10 in one sample and 0 in 16 in another, so the undercount
   * is rare rather than large — and invisible, which is the problem.
   *
   * The fix lives in the callers (`usageAccumulator`, in this module), which
   * count inside the retried closure rather than reading the return value.
   * This test pins the property that makes that necessary: the discarded
   * attempt really is invisible in what comes back.
   */
  it("returns only the survivor, so callers must meter inside the closure", async () => {
    const seen: number[] = []
    const call = vi.fn(async (attempt: number) => {
      seen.push(attempt)
      return { angles: attempt === 1 ? [1] : "bad", tokens: 100 }
    })

    const out = await retryMalformed(call, (v) => Array.isArray(v.angles))

    // Two calls happened and each cost 100 tokens...
    expect(seen).toEqual([0, 1])
    // ...but only one result survives, carrying 100 rather than 200. A caller
    // that meters `out.tokens` bills half of what it spent.
    expect(out.tokens).toBe(100)
  })

  it("passes the attempt number through, so a caller can vary the ask", async () => {
    const seen: number[] = []
    const call = vi.fn(async (attempt: number) => {
      seen.push(attempt)
      return { angles: attempt === 1 ? [1] : "bad" }
    })

    await retryMalformed(call, (v) => Array.isArray(v.angles))

    expect(seen).toEqual([0, 1])
  })
})

describe("usageAccumulator", () => {
  it("sums every attempt, so a retried call is not billed as one", () => {
    const spent = usageAccumulator()

    spent.add({
      inputTokens: 100,
      outputTokens: 20,
      inputTokenDetails: { cacheReadTokens: 80 },
    })
    spent.add({
      inputTokens: 100,
      outputTokens: 25,
      inputTokenDetails: { cacheReadTokens: 80 },
    })

    expect(spent.total).toEqual({
      inputTokens: 200,
      cachedInputTokens: 160,
      outputTokens: 45,
    })
  })

  it("treats a missing count as zero rather than NaN", () => {
    const spent = usageAccumulator()

    // The AI SDK leaves these undefined on some providers, and one `undefined`
    // turns the running total into NaN for the rest of the call — a usage row
    // that fails to insert, or inserts as garbage, long after the model
    // returned fine.
    spent.add({})
    spent.add({ inputTokens: 10 })

    expect(spent.total).toEqual({
      inputTokens: 10,
      cachedInputTokens: 0,
      outputTokens: 0,
    })
  })

  it("starts at zero, so a call that never ran meters nothing", () => {
    expect(usageAccumulator().total).toEqual({
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
    })
  })

  it("reads a cache count from either shape", () => {
    // The SDK nests it; usageFromError and any folded-in StructuredUsage have
    // already flattened it. Dropping the flat one would under-report a retry
    // that followed a throw, which is the exact combination this pairing is for.
    const spent = usageAccumulator()
    spent.add({ inputTokens: 10, inputTokenDetails: { cacheReadTokens: 4 } })
    spent.add({ inputTokens: 10, cachedInputTokens: 6, outputTokens: 1 })

    expect(spent.total).toEqual({
      inputTokens: 20,
      cachedInputTokens: 10,
      outputTokens: 1,
    })
  })
})

/**
 * The bill on the throwing path.
 *
 * Captured from production on 2026-08-08: `AI_NoObjectGeneratedError` reached
 * `draftAngle`'s catch and the 3,156 input tokens behind it were never
 * recorded, so /credits showed a generation that had cost nothing. Everything
 * needed was already hanging off the error.
 */
describe("usageFromError", () => {
  it("reads the usage the AI SDK hangs off a failed generation", () => {
    const error = Object.assign(
      new Error("No object generated: the model did not return a response."),
      {
        usage: {
          inputTokens: 3156,
          inputTokenDetails: {
            noCacheTokens: 3156,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          },
          outputTokens: 43,
        },
      }
    )

    expect(usageFromError(error)).toEqual({
      inputTokens: 3156,
      cachedInputTokens: 0,
      outputTokens: 43,
    })
  })

  it("returns nothing for an error that never reached the model", () => {
    // A DB blip or a bug in our own code owes nothing, and inventing a zero
    // charge for it is indistinguishable from a call that genuinely cost
    // nothing — which is the number /credits would then be reporting.
    expect(usageFromError(new Error("connection reset"))).toBeUndefined()
    expect(usageFromError({ usage: {} })).toBeUndefined()
    expect(usageFromError(null)).toBeUndefined()
    expect(usageFromError("nope")).toBeUndefined()
  })

  it("fills in the half a provider left out", () => {
    expect(usageFromError({ usage: { outputTokens: 12 } })).toEqual({
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 12,
    })
  })
})

describe("GenerationFailed", () => {
  it("carries the bill and keeps the original error underneath", () => {
    const cause = new Error("the model did not return a response")
    const failure = new GenerationFailed(cause, {
      inputTokens: 3156,
      cachedInputTokens: 0,
      outputTokens: 43,
    })

    // `instanceof` is what the call site branches on to decide whether to
    // meter, so it has to survive being thrown and caught.
    expect(failure).toBeInstanceOf(GenerationFailed)
    expect(failure).toBeInstanceOf(Error)
    expect(failure.usage.inputTokens).toBe(3156)
    // The log line stays the SDK's own error, not a paraphrase of it.
    expect(failure.cause).toBe(cause)
    expect(failure.message).toBe("the model did not return a response")
  })
})

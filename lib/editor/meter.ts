import type { LanguageModelUsage } from "ai"

/**
 * What a model loop has spent so far, step by step.
 *
 * `await result.usage` answers only when the whole loop ends cleanly. Stop
 * aborts it and a thrown step rejects it, and in both cases the steps that
 * already ran were paid for. So the editor's loops add each step's usage
 * here as the step ends (`onStepEnd`), and meter the running total in their
 * cleanup, whatever ended the loop. A step cut off midway reports nothing
 * and cannot be counted; every finished step is.
 */
export type Tokens = {
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
}

export function tokenMeter() {
  const total: Tokens = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 }
  return {
    add(usage: LanguageModelUsage | undefined) {
      if (!usage) return
      total.inputTokens += usage.inputTokens ?? 0
      total.cachedInputTokens += usage.inputTokenDetails?.cacheReadTokens ?? 0
      total.outputTokens += usage.outputTokens ?? 0
    },
    total: (): Tokens => ({ ...total }),
  }
}

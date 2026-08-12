import type { UIMessage } from "ai"

/**
 * Ceilings on the streaming model routes, per AGENTS.md "Money": every
 * spending path gets a ceiling. These bound the request and the day; the
 * entitlement gate (who may spend at all) lives in lib/entitlement.ts.
 *
 * Two routes use them — `/api/chat` and the editor agent at
 * `/api/editor/projects/[id]/agent`. The editor was the owed follow-up to the
 * plan that added this file, and it is the hungrier of the two: it is a
 * tool-calling loop, so one request can be eight model calls rather than one.
 * The day ceiling is deliberately shared rather than per-route, because it
 * bounds a person's spending and a wallet does not care which page emptied it.
 *
 * The `CHAT_` prefix on the variables is kept for the same reason it is worth
 * a comment: renaming an environment variable that is already set in
 * production trades a tidier name for a silently unbounded day.
 *
 * Defaults are deliberately generous — tripwires, not walls. All three move
 * via env without a deploy.
 */

// A plausible conversation runs to a few dozen turns. 200 is well past any
// real usage, so it catches a runaway client or script without touching a
// real user.
const DEFAULT_MAX_MESSAGES = 200

// ~100k tokens, half the context window. A real conversation never
// approaches this; a request that does is not one the model should read in
// full.
const DEFAULT_MAX_INPUT_CHARS = 400_000

// $10/day. A measured trivial turn is 2,930 micros, so this is thousands of
// turns away from ordinary use — a tripwire for a scripted account, not a
// product limit.
const DEFAULT_DAILY_CEILING_MICROS = 10_000_000

// A file part (image, PDF, etc.) carries no text to count. This stands in
// for it so a request cannot dodge the character meter by shifting content
// into non-text parts.
const NON_TEXT_PART_ALLOWANCE_CHARS = 1_000

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) {
    return fallback
  }
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function maxMessages(): number {
  return envInt("CHAT_MAX_MESSAGES", DEFAULT_MAX_MESSAGES)
}

export function maxInputChars(): number {
  return envInt("CHAT_MAX_INPUT_CHARS", DEFAULT_MAX_INPUT_CHARS)
}

export function dailyCeilingMicros(): number {
  return envInt("CHAT_DAILY_CEILING_MICROS", DEFAULT_DAILY_CEILING_MICROS)
}

/** Total characters of text parts across the conversation. */
export function measureInput(messages: UIMessage[]): {
  count: number
  chars: number
} {
  let chars = 0

  for (const message of messages) {
    for (const part of message.parts ?? []) {
      if (part.type === "text") {
        chars += part.text.length
      } else {
        chars += NON_TEXT_PART_ALLOWANCE_CHARS
      }
    }
  }

  return { count: messages.length, chars }
}

export type InputVerdict = { ok: true } | { ok: false; error: string }

/** Rejects a request that is not a plausible conversation. */
export function inputVerdict(messages: unknown): InputVerdict {
  if (!Array.isArray(messages) || messages.length === 0) {
    return {
      ok: false,
      error: "That request did not carry a conversation.",
    }
  }

  const { count, chars } = measureInput(messages as UIMessage[])

  if (count > maxMessages() || chars > maxInputChars()) {
    return {
      ok: false,
      error:
        "This conversation is too long to send in one piece. Start a new one — the brain carries what matters across.",
    }
  }

  return { ok: true }
}

export type CeilingVerdict = { ok: true } | { ok: false; error: string }

export function ceilingVerdict(spentMicros: number): CeilingVerdict {
  if (spentMicros >= dailyCeilingMicros()) {
    return {
      ok: false,
      error: "Quincy has done a full day's work already. It picks up again tomorrow.",
    }
  }

  return { ok: true }
}

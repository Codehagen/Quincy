import {
  createDeepgramSpeechToText,
  isDeepgramConfigured,
  readDeepgramOptions,
} from "./deepgram"
import { createGatewaySpeechToText } from "./gateway"
import { createSelfHostedSpeechToText } from "./self-hosted"
import type { SpeechToText } from "./speech-to-text"

/**
 * Which speech-to-text each feature uses, from the environment.
 *
 * One setting per feature, because the two need different things: the editor
 * needs word timings and voice notes need only text, and a provider good at
 * one is not automatically the right bill for the other.
 *
 * - `EDITOR_TRANSCRIBER`: `deepgram` (the default) or `self-hosted`.
 * - `VOICE_NOTE_TRANSCRIBER`: `gateway` (the default), `deepgram` or
 *   `self-hosted`.
 *
 * Unset is today's behaviour exactly. `self-hosted` reads its server from
 * `SELF_HOSTED_STT_URL`, `SELF_HOSTED_STT_MODEL`, and optionally
 * `SELF_HOSTED_STT_KEY` and `SELF_HOSTED_STT_LANGUAGE`; it is there to try
 * an open model on our own machine, and is off until someone sets it.
 */

export type SpeechProvider = "deepgram" | "gateway" | "self-hosted"

export type SpeechUse = "editor" | "voice-note"

const DEFAULTS: Record<SpeechUse, SpeechProvider> = {
  editor: "deepgram",
  "voice-note": "gateway",
}

const SETTING: Record<SpeechUse, string> = {
  editor: "EDITOR_TRANSCRIBER",
  "voice-note": "VOICE_NOTE_TRANSCRIBER",
}

/** Providers that can serve each use. The editor cannot use one without word timings. */
const ALLOWED: Record<SpeechUse, SpeechProvider[]> = {
  editor: ["deepgram", "self-hosted"],
  "voice-note": ["gateway", "deepgram", "self-hosted"],
}

export class SpeechConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SpeechConfigError"
  }
}

type Env = Record<string, string | undefined>

/** The provider a use is set to, checked against what that use can take. */
export function speechProviderFor(
  use: SpeechUse,
  env: Env = process.env
): SpeechProvider {
  const raw = env[SETTING[use]]?.trim().toLowerCase()
  if (!raw) return DEFAULTS[use]

  const allowed = ALLOWED[use]
  if (!allowed.includes(raw as SpeechProvider)) {
    throw new SpeechConfigError(
      `${SETTING[use]}="${raw}" is not one of ${allowed.join(", ")}.` +
        (use === "editor" && raw === "gateway"
          ? " The Gateway's models give no word timings, and the editor cuts on them."
          : "")
    )
  }
  return raw as SpeechProvider
}

/** Whether a use has what its provider needs, without building it. */
export function isSpeechConfigured(use: SpeechUse, env: Env = process.env) {
  switch (speechProviderFor(use, env)) {
    case "deepgram":
      return isDeepgramConfigured(env)
    case "gateway":
      return true
    case "self-hosted":
      return Boolean(env.SELF_HOSTED_STT_URL && env.SELF_HOSTED_STT_MODEL)
  }
}

export type SpeechOptions = {
  /**
   * Called with the seconds of audio about to be sent, before every request.
   * Awaited, and a throw stops the request: the editor's meter.
   */
  onRequest?: (audioSeconds: number) => Promise<void>
}

/**
 * The speech-to-text a use is set to.
 *
 * Throws `SpeechConfigError`, or Deepgram's missing-key error, when the chosen
 * provider is not set up. Callers that may run without one check
 * `isSpeechConfigured` first.
 */
export function speechToTextFor(
  use: SpeechUse,
  options: SpeechOptions = {},
  env: Env = process.env
): SpeechToText {
  const provider = speechProviderFor(use, env)

  switch (provider) {
    case "deepgram": {
      const deepgram = readDeepgramOptions(env)
      // A voice note has no waveform to judge a wrong-language pass by, so
      // the retry would never fire; leaving the candidates off keeps
      // `maxPasses` honest.
      return createDeepgramSpeechToText({
        ...deepgram,
        ...(use === "voice-note" ? { languages: [] } : {}),
        onRequest: options.onRequest,
      })
    }
    case "gateway":
      return createGatewaySpeechToText({
        model: env.VOICE_NOTE_MODEL || undefined,
        language: env.DEEPGRAM_LANGUAGE || undefined,
      })
    case "self-hosted": {
      if (!env.SELF_HOSTED_STT_URL || !env.SELF_HOSTED_STT_MODEL) {
        throw new SpeechConfigError(
          `${SETTING[use]}=self-hosted needs SELF_HOSTED_STT_URL and SELF_HOSTED_STT_MODEL.`
        )
      }
      return createSelfHostedSpeechToText({
        baseUrl: env.SELF_HOSTED_STT_URL,
        model: env.SELF_HOSTED_STT_MODEL,
        apiKey: env.SELF_HOSTED_STT_KEY || undefined,
        language:
          env.SELF_HOSTED_STT_LANGUAGE || env.DEEPGRAM_LANGUAGE || undefined,
        onRequest: options.onRequest,
      })
    }
  }
}

export * from "./speech-to-text"

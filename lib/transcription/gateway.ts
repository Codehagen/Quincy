import { gateway } from "@ai-sdk/gateway"
import { experimental_transcribe as transcribe } from "ai"

import { audioFile, storedTranscript, type SpeechToText } from "./speech-to-text"

/**
 * Speech to text through the AI Gateway. The voice notes' default
 * (lib/transcription/index.ts).
 *
 * **Through the Gateway, not a provider SDK.** Every other model call in the
 * product goes out through `AI_GATEWAY_API_KEY`, and transcription needs no
 * exception: the Gateway lists transcription models natively, so the model
 * is a string to change rather than a key somebody has to add.
 *
 * **Text, not words.** The models here return the transcript and at most
 * segment timings, which is all a voice note needs and not enough for the
 * editor, whose cuts are word boundaries. `givesWords` says so, and the
 * editor refuses this adapter rather than storing a transcript it cannot cut.
 */

/**
 * `gpt-4o-transcribe` rather than `whisper-1` (older, worse on accented
 * Norwegian) or `gpt-realtime-whisper` (built for streaming sessions; its
 * advantage is latency, which is worth nothing to a job nobody is watching).
 */
export const DEFAULT_GATEWAY_TRANSCRIBE_MODEL = "openai/gpt-4o-transcribe"

/** The call, as a port, so the adapter can be tested without a network. */
export type GatewayTranscribeCall = (input: {
  model: string
  audio: Uint8Array
  language?: string
}) => Promise<{
  text: string
  durationInSeconds?: number
  language?: string
}>

const callGateway: GatewayTranscribeCall = async ({ model, audio, language }) =>
  transcribe({
    model: gateway.transcription(model),
    audio,
    providerOptions: language ? { openai: { language } } : undefined,
    /**
     * One retry, not the default two.
     *
     * Every retry re-uploads the whole blob and pays for the whole
     * transcription again. The default is tuned for a text call costing a
     * fraction of a cent; here a stuck retry loop on a ten-minute note is real
     * money for a job nobody is watching. Workflow retries the step around
     * this anyway, so a genuine transient failure still gets more than one
     * chance — it just gets it with a fresh step rather than inside one.
     */
    maxRetries: 1,
  })

export type GatewayOptions = {
  model?: string
  /** What is being spoken, or unset to let the model detect it. */
  language?: string
  call?: GatewayTranscribeCall
}

export function createGatewaySpeechToText(
  options: GatewayOptions = {}
): SpeechToText {
  const model = options.model || DEFAULT_GATEWAY_TRANSCRIBE_MODEL
  const call = options.call ?? callGateway

  return {
    name: "gateway",
    givesWords: false,
    maxPasses: 1,
    async transcribe(audio, request) {
      const language = request?.language ?? options.language
      const result = await call({
        model,
        audio: audioFile(audio).bytes,
        language,
      })

      const transcription = {
        provider: "gateway",
        model,
        text: result.text,
        words: null,
        durationSeconds: result.durationInSeconds,
        language: result.language ?? language,
      }
      return { ...transcription, stored: storedTranscript(transcription) }
    },
  }
}

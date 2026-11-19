import {
  audioFile,
  audioSeconds,
  storedTranscript,
  type SpeechToText,
} from "./speech-to-text"

/**
 * Speech to text on a server we run. Prepared, and off.
 *
 * The question this exists to answer: does an open speech model fine-tuned on
 * Norwegian hear our recordings better than the hosted providers do? Answering
 * it needs the model running somewhere and the editor able to call it, and
 * the second half is this file. Nothing selects it unless the environment
 * says so (lib/transcription/index.ts), and nothing should until the model
 * has been measured against the current one on real takes.
 *
 * **The request is the common one.** Most servers that host an open speech
 * model speak the same HTTP shape: a multipart POST to
 * `<base>/audio/transcriptions` with the file and a model name, answering
 * JSON. `response_format=verbose_json` with `timestamp_granularities[]=word`
 * asks for the per-word timings the editor cuts on. A server that ignores
 * the word granularity answers without `words`, which `givesWords` cannot
 * know in advance; the editor's side of the port (`pcmTranscriber`) refuses
 * text with no word timings rather than storing a transcript nothing can cut.
 *
 * **Metered like the others.** It is our compute rather than a bill, but the
 * editor's ceilings count seconds of audio sent, and a server that is free per
 * request still has a queue a runaway loop can fill. `onRequest` runs first.
 */

export type SelfHostedOptions = {
  /** The server's base URL, e.g. `http://stt.internal:8000/v1`. */
  baseUrl: string
  /** The model name the server expects. */
  model: string
  /** Sent as a bearer token when the server wants one. */
  apiKey?: string
  /** What is being spoken, e.g. `no`. Unset lets the server detect it. */
  language?: string
  onRequest?: (audioSeconds: number) => Promise<void>
  /** Milliseconds. Our own server on a GPU is faster than this; a CPU one is not. */
  timeoutMs?: number
}

const DEFAULT_TIMEOUT = 4 * 60_000

type VerboseResponse = {
  text?: string
  language?: string
  duration?: number
  words?: {
    word?: string
    start?: number
    end?: number
    probability?: number
  }[]
}

export function createSelfHostedSpeechToText(
  options: SelfHostedOptions
): SpeechToText {
  const endpoint = `${options.baseUrl.replace(/\/+$/, "")}/audio/transcriptions`

  return {
    name: "self-hosted",
    givesWords: true,
    maxPasses: 1,
    async transcribe(audio, request) {
      const seconds = audioSeconds(audio)
      if (seconds !== null) await options.onRequest?.(seconds)

      const file = audioFile(audio)
      const form = new FormData()
      form.set(
        "file",
        new Blob([file.bytes as unknown as BlobPart], { type: file.mediaType }),
        file.mediaType === "audio/wav" ? "audio.wav" : "audio"
      )
      form.set("model", options.model)
      form.set("response_format", "verbose_json")
      form.append("timestamp_granularities[]", "word")
      const language = request?.language ?? options.language
      if (language) form.set("language", language)

      const response = await fetch(endpoint, {
        method: "POST",
        headers: options.apiKey
          ? { Authorization: `Bearer ${options.apiKey}` }
          : undefined,
        body: form,
        signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT),
      })

      if (!response.ok) {
        const body = await response.text().catch(() => "")
        throw new Error(
          `self-hosted ${response.status}: ${body.slice(0, 200) || response.statusText}`
        )
      }

      const body = (await response.json()) as VerboseResponse
      const text = (body.text ?? "").trim()
      const words = (body.words ?? [])
        .filter(
          (word) =>
            typeof word.word === "string" &&
            typeof word.start === "number" &&
            typeof word.end === "number"
        )
        .map((word) => ({
          word: word.word!.trim(),
          punctuated_word: word.word!.trim(),
          start: word.start!,
          end: word.end!,
          ...(typeof word.probability === "number"
            ? { confidence: word.probability }
            : {}),
        }))

      const transcription = {
        provider: "self-hosted",
        model: options.model,
        text,
        words,
        durationSeconds: body.duration,
        language: body.language ?? language,
      }
      return { ...transcription, stored: storedTranscript(transcription) }
    },
  }
}

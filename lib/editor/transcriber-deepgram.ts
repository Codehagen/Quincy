import type { Transcriber } from "./ingest"
import { looksMistranscribed, wordDensity } from "./transcript-quality"
import { wordsFromDeepgram } from "./transcript"

/**
 * Deepgram, over raw PCM.
 *
 * The whole first cut is built out of this one call. Silence removal is the
 * gaps between words, captions are the words themselves, and ducking is knowing
 * where speech is — none of it needs a second model. That is why ingest spends
 * the time up front: by the time someone has read the chips and typed a prompt,
 * the word timestamps are already sitting in the row.
 *
 * **Raw samples, not the video.** `audioExtractArgs` already produced mono
 * 16kHz PCM, which is what the model downsamples to anyway. Sending the proxy
 * instead would upload a video file to transcribe its audio — roughly two
 * orders of magnitude more bytes for an identical transcript.
 *
 * **No SDK.** One POST with a content type and four query parameters, against
 * an endpoint whose response we store verbatim. A client would add a dependency
 * that mostly re-types a shape `wordsFromDeepgram` already reads.
 */

const ENDPOINT = "https://api.deepgram.com/v1/listen"

/** The current general model. Pinned so a provider default cannot move under us. */
const DEFAULT_MODEL = "nova-3"

/**
 * The model to use when the language is not one nova-3 speaks.
 *
 * nova-3 covers English and a `multi` code-switching mode, and nothing else.
 * Ask it for Norwegian and it does not refuse — it transcribes the audio as
 * English and returns something short and confident. Fifteen seconds of a
 * Norwegian test recording came back as "Okay. Okay." at 0.975 confidence,
 * which is the worst kind of wrong: it looks like a quiet recording rather
 * than a failed one, and every tool downstream believed it. nova-2 has the
 * broad language coverage; the same audio came back complete at 0.897.
 */
const MULTILINGUAL_MODEL = "nova-2"

/** The languages nova-3 handles. Anything else has to fall back. */
const NOVA_3_LANGUAGES = new Set([
  "en",
  "en-US",
  "en-GB",
  "en-AU",
  "en-NZ",
  "en-IN",
  "multi",
])

/**
 * Milliseconds. Deepgram is roughly realtime-over-30 on prerecorded audio, so
 * a 90 minute talk is a couple of minutes. Well clear of that, and well under
 * the function ceiling so this fails with a sentence rather than a platform
 * kill.
 */
const TIMEOUT = 4 * 60_000

export class MissingDeepgramKeyError extends Error {
  constructor() {
    super(
      "DEEPGRAM_API_KEY is not set. See .env.example — the key comes from " +
        "console.deepgram.com → API Keys."
    )
    this.name = "MissingDeepgramKeyError"
  }
}

export type DeepgramOptions = {
  apiKey: string
  model?: string
  /**
   * What is being spoken, as a Deepgram language code.
   *
   * Explicit, and not `detect_language`. Detection was the obvious answer and
   * it is not reliable enough to be the default: on a Norwegian recording that
   * opens with "Ok", Deepgram detects English and returns one word. A wrong
   * transcript is worse than a missing one, because silence removal will
   * happily cut a talk down to the two words it thinks were spoken.
   *
   * Unset means English, which is Deepgram's own default.
   */
  language?: string
  /**
   * Languages to try when the first pass does not describe the audio.
   *
   * Trial rather than classification, because the classifier is wrong: on the
   * recording that prompted all of this, Deepgram detected English from
   * Norwegian at 0.96 language-confidence and a restricted candidate list did
   * not move it. Transcribing and measuring the result is slower and it is
   * right — the wrong language produces a fraction of the words, and that gap
   * is not subtle.
   *
   * Only reached when the first result looks mistranscribed, so the normal
   * case is still one request.
   */
  languages?: string[]
  /**
   * Speaker labels. On by default: a two-person interview where every word is
   * attributed to the same speaker cannot be cut into a conversation, and
   * turning it on later means re-transcribing the library.
   */
  diarize?: boolean
}

export function isDeepgramConfigured(
  env: Record<string, string | undefined> = process.env
): boolean {
  return Boolean(env.DEEPGRAM_API_KEY)
}

export function readDeepgramOptions(
  env: Record<string, string | undefined> = process.env
): DeepgramOptions {
  if (!env.DEEPGRAM_API_KEY) throw new MissingDeepgramKeyError()

  return {
    apiKey: env.DEEPGRAM_API_KEY,
    model: env.DEEPGRAM_MODEL || undefined,
    language: env.DEEPGRAM_LANGUAGE || undefined,
    languages: readLanguages(env),
  }
}

/**
 * The candidate list, which always contains the primary language and English.
 *
 * English because it is the default a misconfigured install falls back to and
 * the one most likely to be spoken alongside anything else; the primary because
 * the first pass may have used a different one. Deduped and ordered, so the
 * retry tries the most likely first.
 */
function readLanguages(env: Record<string, string | undefined>): string[] {
  const configured = (env.DEEPGRAM_LANGUAGES ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)

  const candidates = [
    ...configured,
    ...(env.DEEPGRAM_LANGUAGE ? [env.DEEPGRAM_LANGUAGE] : []),
    "en",
  ]

  return [...new Set(candidates)]
}

/**
 * The model that can actually speak this language.
 *
 * An explicitly configured model always wins — if someone has pinned one, that
 * is a decision and not a default to be second-guessed. Otherwise nova-3 for
 * the languages it knows and nova-2 for everything else, because the failure
 * mode of getting this wrong is silent.
 */
export function modelFor(options: DeepgramOptions): string {
  if (options.model) return options.model

  const language = options.language
  if (!language || NOVA_3_LANGUAGES.has(language)) return DEFAULT_MODEL

  return MULTILINGUAL_MODEL
}

/**
 * The query string, as its own function so the parameters are readable and
 * testable without a network call. Every one of them changes what comes back:
 *
 * - `encoding`, `sample_rate`, `channels` because raw PCM carries no header,
 *   so the container's job of describing the audio falls to these three. Get
 *   the rate wrong and the transcript is right but every timestamp is scaled.
 * - `punctuate` and `smart_format` for `punctuated_word`, which is what a
 *   caption renders. Without them captions arrive as lowercase word soup.
 * - `utterances` for the sentence groupings the caption builder chunks on.
 * - `diarize` for speaker turns.
 * - `language`, when set, because the default is English and a model asked for
 *   English will transcribe any language as English rather than failing.
 */
export function listenUrl(
  sampleRate: number,
  options: DeepgramOptions
): string {
  const query = new URLSearchParams({
    model: modelFor(options),
    encoding: "linear16",
    sample_rate: String(sampleRate),
    channels: "1",
    punctuate: "true",
    smart_format: "true",
    utterances: "true",
    diarize: String(options.diarize ?? true),
  })

  if (options.language) query.set("language", options.language)

  return `${ENDPOINT}?${query}`
}

export function createDeepgramTranscriber(
  options: DeepgramOptions
): Transcriber {
  const once = async (
    pcm: Int16Array,
    sampleRate: number,
    language: string | undefined
  ): Promise<unknown> => {
    const response = await fetch(
      listenUrl(sampleRate, { ...options, language }),
      {
        method: "POST",
        headers: {
          Authorization: `Token ${options.apiKey}`,
          "Content-Type": "audio/raw",
        },
        // The samples as they sit in memory. `pcm.buffer` alone would send the
        // whole backing ArrayBuffer, which for a subarray is the entire file.
        //
        // The cast is a lib mismatch, not a real one: a view over a
        // SharedArrayBuffer is not a valid body and TypeScript cannot rule that
        // out from `ArrayBufferLike`. Copying to satisfy it would double the
        // peak memory of the largest allocation in the pipeline.
        body: new Uint8Array(
          pcm.buffer,
          pcm.byteOffset,
          pcm.byteLength
        ) as unknown as BodyInit,
        signal: AbortSignal.timeout(TIMEOUT),
      }
    )

    if (!response.ok) {
      throw new Error(await describeFailure(response))
    }

    // Stored verbatim on video_asset.transcript. The shape is the provider's
    // and `wordsFromDeepgram` is the only thing that reads it.
    return (await response.json()) as unknown
  }

  return {
    name: "deepgram",

    /**
     * One request, and a second round only when the first one does not
     * describe the audio.
     *
     * `voicedSeconds` is measured by ingest from the same PCM this is reading,
     * so the check costs nothing and the retry only fires on evidence. Without
     * it there is no check at all: a wrong-language transcript comes back short
     * and confident, and every tool downstream treats it as the truth.
     */
    async transcribe(pcm, sampleRate, hints) {
      const first = await once(pcm, sampleRate, options.language)

      const voiced = hints?.voicedSeconds ?? 0
      const candidates = (options.languages ?? []).filter(
        (language) => language !== options.language
      )

      if (
        candidates.length === 0 ||
        !looksMistranscribed({ words: wordsFromDeepgram(first), voiced })
      ) {
        return first
      }

      let best = first
      let bestDensity = wordDensity(wordsFromDeepgram(first), voiced)

      for (const language of candidates) {
        // A candidate that errors is not a reason to lose the result we have.
        const attempt = await once(pcm, sampleRate, language).catch(() => null)
        if (!attempt) continue

        const density = wordDensity(wordsFromDeepgram(attempt), voiced)
        if (density > bestDensity) {
          best = attempt
          bestDensity = density
        }
      }

      return best
    },
  }
}

/**
 * Deepgram's own words, not a status code.
 *
 * A 400 here is nearly always a parameter mismatch — the wrong sample rate, an
 * encoding the account cannot use — and the body says which. Reducing that to
 * "transcript: 400" would land in `warnings` as something nobody can act on.
 */
async function describeFailure(response: Response): Promise<string> {
  const body = await response.text().catch(() => "")

  try {
    const parsed = JSON.parse(body) as { err_msg?: string; message?: string }
    const detail = parsed.err_msg ?? parsed.message
    if (detail) return `deepgram ${response.status}: ${detail}`
  } catch {
    // Not JSON. Fall through to the raw body, trimmed.
  }

  return `deepgram ${response.status}: ${body.slice(0, 200) || response.statusText}`
}

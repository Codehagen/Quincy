/**
 * Speech to text, behind one shape.
 *
 * Two features turn audio into words. The video editor needs every word with
 * its timing, because silence removal, captions and ducking are all made of
 * them. Voice notes need the text and nothing else. They used to reach two
 * providers by two different roads, and trying a third (an open model on our
 * own server, say, to see whether it hears Norwegian better) would have meant
 * writing it twice.
 *
 * Now each provider is one adapter with this shape, and each feature picks
 * one by configuration (`lib/transcription/index.ts`). The rules each feature
 * applies around the call — the editor's ceilings and meter, a voice note's
 * size and length limits — stay where they were; this is only the call.
 */

/**
 * The audio, as the caller has it.
 *
 * The editor has raw samples: ingest already extracted mono 16 kHz PCM for the
 * waveform, and sending that is two orders of magnitude smaller than the
 * video. A voice note has the browser's recording, an encoded file. An
 * adapter takes either, so neither caller converts for a provider's sake.
 */
export type SpeechAudio =
  | { kind: "pcm"; samples: Int16Array; sampleRate: number }
  | { kind: "file"; bytes: Uint8Array; mediaType: string }

/** One word, in seconds from the start of the audio. */
export type SpokenWord = {
  word: string
  /** The word as it should be shown, with punctuation and casing. */
  punctuated_word?: string
  start: number
  end: number
  confidence?: number
  speaker?: number
}

export type Transcription = {
  /** Which adapter heard it ("deepgram", "gateway", "self-hosted"). */
  provider: string
  /** The model it asked, as the provider names it. */
  model: string
  text: string
  /** Every word with its timing. Null when the provider gives none. */
  words: SpokenWord[] | null
  /** Seconds of audio, when the provider measured it. */
  durationSeconds?: number
  language?: string
  /**
   * What to keep, verbatim. A provider whose own response is worth keeping
   * (Deepgram's carries utterances and speaker turns) stores that; the rest
   * store the shape from `storedTranscript`. `lib/editor/transcript.ts`
   * `wordsFromTranscript` reads both.
   */
  stored: unknown
}

export type TranscribeOptions = {
  /** What is being spoken, when it is known. Unset lets the adapter decide. */
  language?: string
  /**
   * Seconds of the audio that are voice, measured from the waveform. Lets an
   * adapter tell a short recording from a failed transcription.
   */
  voicedSeconds?: number
}

export type SpeechToText = {
  /** The adapter's name, stored as the transcript's provider. */
  name: string
  /** Whether `words` comes back filled. The editor cannot use one that does not. */
  givesWords: boolean
  /**
   * The most requests one `transcribe` call can make, each paying for the
   * whole audio. A ceiling on seconds bought multiplies by this.
   */
  maxPasses: number
  transcribe(
    audio: SpeechAudio,
    options?: TranscribeOptions
  ): Promise<Transcription>
}

/** The provider-neutral transcript an adapter stores when it keeps no raw response. */
export const STORED_TRANSCRIPT_FORMAT = "quincy.words/1"

export type StoredTranscript = {
  format: typeof STORED_TRANSCRIPT_FORMAT
  provider: string
  model: string
  language?: string
  text: string
  words: SpokenWord[]
}

export function storedTranscript(
  transcription: Omit<Transcription, "stored">
): StoredTranscript {
  return {
    format: STORED_TRANSCRIPT_FORMAT,
    provider: transcription.provider,
    model: transcription.model,
    ...(transcription.language ? { language: transcription.language } : {}),
    text: transcription.text,
    words: transcription.words ?? [],
  }
}

export function isStoredTranscript(value: unknown): value is StoredTranscript {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { format?: unknown }).format === STORED_TRANSCRIPT_FORMAT &&
    Array.isArray((value as { words?: unknown }).words)
  )
}

/** Seconds of audio in a request, for a meter that runs before it is sent. */
export function audioSeconds(audio: SpeechAudio): number | null {
  if (audio.kind !== "pcm" || audio.sampleRate <= 0) return null
  return audio.samples.length / audio.sampleRate
}

/**
 * The samples as they sit in memory. `samples.buffer` alone would send the
 * whole backing ArrayBuffer, which for a subarray is the entire file.
 */
export function pcmBytes(samples: Int16Array): Uint8Array {
  return new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength)
}

/**
 * Raw PCM as a WAV file, for a provider that only takes files.
 *
 * A 44-byte header in front of the samples, nothing re-encoded: mono, 16-bit,
 * little-endian, at the rate the samples were taken.
 */
export function wavFromPcm(samples: Int16Array, sampleRate: number): Uint8Array {
  const data = pcmBytes(samples)
  const bytes = new Uint8Array(44 + data.byteLength)
  const view = new DataView(bytes.buffer)
  const tag = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i)
  }

  tag(0, "RIFF")
  view.setUint32(4, 36 + data.byteLength, true)
  tag(8, "WAVE")
  tag(12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // byte rate
  view.setUint16(32, 2, true) // block align
  view.setUint16(34, 16, true) // bits per sample
  tag(36, "data")
  view.setUint32(40, data.byteLength, true)
  bytes.set(data, 44)

  return bytes
}

/** The audio as a file, converting raw samples when that is what was given. */
export function audioFile(audio: SpeechAudio): {
  bytes: Uint8Array
  mediaType: string
} {
  if (audio.kind === "file") return { bytes: audio.bytes, mediaType: audio.mediaType }
  return {
    bytes: wavFromPcm(audio.samples, audio.sampleRate),
    mediaType: "audio/wav",
  }
}

/**
 * The editor's side of the port: PCM in, the transcript to store out, and a
 * refusal when the words have no timings.
 *
 * Shaped like `Transcriber` in lib/editor/ingest.ts without importing it, so
 * this folder depends on nothing in the editor.
 */
export function pcmTranscriber(speech: SpeechToText): {
  name: string
  maxPasses: number
  transcribe(
    pcm: Int16Array,
    sampleRate: number,
    hints?: { voicedSeconds: number }
  ): Promise<unknown>
} {
  return {
    name: speech.name,
    maxPasses: speech.maxPasses,
    async transcribe(pcm, sampleRate, hints) {
      const result = await speech.transcribe(
        { kind: "pcm", samples: pcm, sampleRate },
        { voicedSeconds: hints?.voicedSeconds }
      )
      // The editor cuts on word boundaries. Text with no timings under it
      // would store as a transcript with no words, which reads downstream as
      // a silent take and lets silence removal cut the whole thing.
      if (result.words === null || (result.text.trim() && !result.words.length)) {
        throw new Error(
          `${speech.name}: the transcript came back without word timings, which the editor needs`
        )
      }
      return result.stored
    },
  }
}

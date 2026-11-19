/**
 * The words for the mock's local take (plans/036, the owner's local take).
 *
 *   npx tsx --env-file=.env.local scripts/transcribe-cuts-mock-local.ts
 *
 * Run after scripts/make-cuts-mock-local.sh. Reads the 16 kHz audio it left
 * in public/prototypes/cuts-mock/local/ and makes ONE Deepgram request
 * through the editor's own transcriber, with the language and model it would
 * pick for ingest (DEEPGRAM_LANGUAGE; a language nova-3 does not speak goes
 * to nova-2). The language retry is switched off, so this spends exactly one
 * call; if it fails it says so and stops.
 *
 * Writes, all gitignored: transcript.json (the provider's answer, as ingest
 * stores it), words.json (the shape of the tracked take-words.json) and
 * manifest.json (take.json plus the words file and a strong line). The strong
 * line is the take's longest spoken sentence, not the model's pick, so this
 * makes no model call.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { spokenSentences } from "../lib/editor/gate"
import { createDeepgramTranscriber, modelFor, readDeepgramOptions } from "../lib/editor/transcriber-deepgram"
import { wordsFromDeepgram } from "../lib/editor/transcript"

const DIR = join(process.cwd(), "public/prototypes/cuts-mock/local")
const RATE = 16_000

async function main() {
  const pcmPath = join(DIR, "voice.pcm")
  const takePath = join(DIR, "take.json")
  if (!existsSync(pcmPath) || !existsSync(takePath)) {
    throw new Error("Run scripts/make-cuts-mock-local.sh <video> first.")
  }

  const raw = readFileSync(pcmPath)
  const pcm = new Int16Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 2))

  // The ingest options, minus the retry: one request, whatever it returns.
  const options = { ...readDeepgramOptions(), languages: [] }
  let requests = 0
  const transcriber = createDeepgramTranscriber({
    ...options,
    onRequest: async (seconds) => {
      requests += 1
      if (requests > 1) throw new Error("Refusing a second Deepgram request.")
      console.log(`Deepgram: ${seconds.toFixed(1)} s of audio, model ${modelFor(options)}, language ${options.language ?? "en"}`)
    },
  })

  const transcript = await transcriber.transcribe(pcm, RATE)
  writeFileSync(join(DIR, "transcript.json"), JSON.stringify(transcript))

  const words = wordsFromDeepgram(transcript)
  if (words.length === 0) throw new Error("Deepgram returned no words.")
  writeFileSync(
    join(DIR, "words.json"),
    JSON.stringify(words.map((w) => ({ text: w.text, start: w.startUs / 1e6, end: w.endUs / 1e6 })))
  )

  const sentences = spokenSentences(words)
  const longest = sentences.reduce((best, s) => (s.length > best.length ? s : best), sentences[0] ?? [])
  const strongLine = longest.map((w) => w.text.trim()).join(" ") || null

  const take = JSON.parse(readFileSync(takePath, "utf8")) as Record<string, unknown>
  writeFileSync(join(DIR, "manifest.json"), JSON.stringify({ ...take, words: "words.json", strongLine }, null, 2))

  console.log(`${words.length} words, ${sentences.length} sentences; strong line: ${longest.length} words.`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

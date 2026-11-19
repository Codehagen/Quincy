import type { MediaEntry } from "@/components/editor/studio"
import { documentForAsset } from "@/lib/editor/document"
import { readTake } from "@/lib/editor/reading"
import { us } from "@/lib/editor/time"
import type { Word } from "@/lib/editor/transcript"
import type { VideoDocument } from "@/lib/editor/types"

import takeWords from "./take-words.json"

/*
 * The take the mock cuts. Two of them:
 *
 * - The tracked one: the founder take the lab cuts
 *   (app/prototypes/lab/cuts/round-1/fixture.ts), 37 s, two pauses over a
 *   second (at 4 s and 13 s), one "um". Its media under
 *   public/prototypes/cuts-mock/ is drawn from the word list by
 *   scripts/make-cuts-mock-take.sh, so the silences in the audio are the
 *   pauses in the words.
 * - A local one, when public/prototypes/cuts-mock/local/manifest.json exists:
 *   a real recording made by scripts/make-cuts-mock-local.sh and
 *   scripts/transcribe-cuts-mock-local.ts. That folder is gitignored, so it
 *   is fetched at runtime, never imported: the build must not depend on it.
 */

export const MOCK_PROJECT_ID = "cuts-mock"
export const MOCK_REVISION = 1
export const MOCK_MEDIA_ID = "cuts-mock-take"

type RawWord = { text: string; start: number; end: number }

export type MockTake = {
  /** Where it came from, for the chrome. */
  source: "tracked" | "local"
  words: Word[]
  /** The line a strong-line call would choose, so the page never asks for one. */
  strongLine: string | null
  durationUs: number
  asset: {
    id: string
    filename: string
    durationUs: ReturnType<typeof us>
    width: number
    height: number
    fps: number
    rotation: number
  }
  media: Record<string, MediaEntry>
}

const toWords = (raw: RawWord[]): Word[] =>
  raw.map((w) => ({
    text: w.text,
    startUs: us(Math.round(w.start * 1_000_000)),
    endUs: us(Math.round(w.end * 1_000_000)),
    confidence: 0.98,
  }))

function take(
  source: MockTake["source"],
  base: string,
  words: Word[],
  strongLine: string | null,
  shape: { durationUs: number; width: number; height: number; fps: number; filename: string },
  filmstrip: { tiles: number; intervalUs: number; tileWidth: number; tileHeight: number }
): MockTake {
  const asset = {
    id: MOCK_MEDIA_ID,
    filename: shape.filename,
    durationUs: us(shape.durationUs),
    width: shape.width,
    height: shape.height,
    fps: shape.fps,
    rotation: 0,
  }
  return {
    source,
    words,
    strongLine,
    durationUs: shape.durationUs,
    asset,
    media: {
      [MOCK_MEDIA_ID]: {
        ...asset,
        hasAudio: true,
        proxyUrl: `${base}/take.mp4`,
        seekIndexUrl: `${base}/seek-index.json`,
        filmstrip: { url: `${base}/filmstrip.jpg`, ...filmstrip },
        reading: readTake(words, shape.durationUs, strongLine),
      },
    },
  }
}

/** The tracked take: always there, so the mock works for anyone. */
export const TRACKED_TAKE: MockTake = take(
  "tracked",
  "/prototypes/cuts-mock",
  toWords(takeWords),
  "The screens weren't the product.",
  { durationUs: 37_000_000, width: 768, height: 432, fps: 24, filename: "onboarding-take-3.mp4" },
  // planFilmstrip(37 s): 78 tiles, one every 474359 us.
  { tiles: 78, intervalUs: 474_359, tileWidth: 156, tileHeight: 88 }
)

const LOCAL = "/prototypes/cuts-mock/local"

type Manifest = {
  durationUs: number
  width: number
  height: number
  fps: number
  words: string
  strongLine: string | null
  filmstrip: { tiles: number; intervalUs: number; tileWidth: number; tileHeight: number }
}

/** The local take, or null when there is none (a 404) or it does not read. */
export async function loadLocalTake(signal?: AbortSignal): Promise<MockTake | null> {
  try {
    const manifest = await fetch(`${LOCAL}/manifest.json`, { signal, cache: "no-store" })
    if (!manifest.ok) return null
    const m = (await manifest.json()) as Manifest
    const words = await fetch(`${LOCAL}/${m.words}`, { signal, cache: "no-store" })
    if (!words.ok) return null
    return take(
      "local",
      LOCAL,
      toWords((await words.json()) as RawWord[]),
      m.strongLine,
      { durationUs: m.durationUs, width: m.width, height: m.height, fps: m.fps, filename: "my-take.mp4" },
      m.filmstrip
    )
  } catch {
    return null
  }
}

/**
 * Built in the browser on every Replay: documentForAsset draws random ids
 * and reads the clock, which the server prerender refuses.
 */
export function mockDocument(t: MockTake): VideoDocument {
  return documentForAsset(t.asset)
}

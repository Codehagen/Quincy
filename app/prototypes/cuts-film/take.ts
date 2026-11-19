// The owner's own take, the one the cuts-mock page cuts. It lives in public/prototypes/cuts-mock/local/, which is
// gitignored: it is fetched at runtime, never imported, so the build never depends on it.
import type { Filmstrip as FilmstripSheet } from "@/components/editor/studio"

export const LOCAL = "/prototypes/cuts-mock/local"
export const TAKE_URL = `${LOCAL}/take.mp4`
export const TAKE_S = 21.268
export const TAKE_US = 21_268_005
/** Portrait: 432 × 768. */
export const TAKE_ASPECT = 432 / 768

export const STRIP: FilmstripSheet = { url: `${LOCAL}/filmstrip.jpg`, tiles: 78, intervalUs: 272_667, tileWidth: 156, tileHeight: 88 }

/** The take's three long pauses, in source seconds, from its word timings (first word 5.28 s, last ends 19.84 s). */
export const PAUSES: [number, number][] = [
  [0, 5.15],
  [10.25, 11.95],
  [19.95, TAKE_S],
]
/** What stays after the pauses go: 5.1 s + 8.0 s. */
export const KEPT: [number, number][] = [
  [5.15, 10.25],
  [11.95, 19.95],
]
export const CUT_S = KEPT.reduce((n, [a, b]) => n + b - a, 0)

/** The caption groups the film shows, in source seconds (from words.json). */
export const CAPTIONS: { text: string; from: number; to: number }[] = [
  { text: "Ok, så dette er jo da", from: 5.28, to: 6.4 },
  { text: "en test med å se", from: 6.4, to: 8.0 },
  { text: "at denne videoen faktisk funker.", from: 8.0, to: 10.2 },
  { text: "Jeg tenkte det skal være slik", from: 11.98, to: 13.18 },
  { text: "at du kan hoppe frem og tilbake", from: 13.18, to: 15.74 },
  { text: "og kutte seilelse og den biten.", from: 15.74, to: 18.06 },
  { text: "Men det blir jo interessant å se!", from: 18.06, to: 19.84 },
]

export type Wave = { values: number[]; intervalUs: number }

let wave: Wave | null = null
let pending: Promise<Wave | null> | null = null

/** The take's peaks, fetched once. */
export function loadWave(): Promise<Wave | null> {
  pending ??= fetch(`${LOCAL}/seek-index.json`)
    .then((r) => (r.ok ? (r.json() as Promise<Wave>) : null))
    .then((w) => (wave = w))
    .catch(() => null)
  return pending
}

export function waveNow() {
  return wave
}

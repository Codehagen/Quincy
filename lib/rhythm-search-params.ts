import {
  createLoader,
  createSerializer,
  debounce,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs/server"

/**
 * One definition of what /rhythm's URL means, imported by both sides.
 *
 * Everything comes from `nuqs/server` on purpose — it has no React dependency,
 * so a Server Component can load these and a Client Component can bind to them
 * without two drifting copies of the contract. The serializer is what keeps a
 * server-rendered <Link> and a client-side setState producing the same URL: if
 * a parser changes here, both move together or neither does.
 */

export const RHYTHM_STATUS = ["all", "live", "paused"] as const
export type RhythmStatus = (typeof RHYTHM_STATUS)[number]

export const rhythmSearchParams = {
  q: parseAsString.withDefault("").withOptions({
    // Typing is the one interaction that can push a URL update per keystroke.
    // Debouncing here rather than at the input means every caller of this
    // parser gets it, including ones written later.
    limitUrlUpdates: debounce(300),
    clearOnDefault: true,
  }),
  status: parseAsStringLiteral(RHYTHM_STATUS).withDefault("all").withOptions({
    clearOnDefault: true,
  }),
}

/** Server Components: `const { q, status } = loadRhythmSearchParams(searchParams)`. */
export const loadRhythmSearchParams = createLoader(rhythmSearchParams)

/** Anywhere a link needs building: `serializeRhythmSearchParams({ status: "live" })`. */
export const serializeRhythmSearchParams = createSerializer(rhythmSearchParams)

import { createProvenance } from "@/lib/editor/provenance"
import { secondsToUs, type Us } from "@/lib/editor/time"
import type {
  AudioElement,
  CaptionElement,
  CaptionToken,
  Track,
  VideoElement,
} from "@/lib/editor/types"

/**
 * Fixtures for the editor prototype, built out of the real document model in
 * lib/editor. Typing them properly is the point: a timeline drawn from invented
 * shapes would look fine and prove nothing about whether the model can render.
 *
 * The content mirrors a real cut — a 144s talking head tightened to 82s across
 * 24 clips, word-by-word captions, one music bed. Fixed values throughout so
 * the server and client agree on every string.
 */

const s = (seconds: number) => secondsToUs(seconds)

export const PROJECT_NAME = "Product update — tightened talking head"
export const SOURCE_NAME = "IMG_8762.MOV"
export const SOURCE_DURATION = s(144.553)

/** The talk, as Deepgram returned it. Trimmed to what fits the cut. */
const SPOKEN =
  `okay so we're back right now I told you I was gonna post every day
this year or at least a few days not every day but a few days and I actually
posted exactly one time a video so I think I need to do something about that so
right now I'm doing a new product that I really want to show you for the first
time ever I'm actually gonna finish it before I ship it the only thing I can say
is that it's gonna make it better for everybody to write content I'm wondering
if I'm gonna do it open source or closed source`
    .trim()
    .split(/\s+/)

/**
 * Deterministic jitter. Word lengths need to vary or every caption chip is the
 * same width and the lane reads as a placeholder, but Math.random would
 * disagree between the server and client render.
 */
function jitter(seed: number): number {
  return (((Math.sin(seed * 12.9898) * 43758.5453) % 1) + 1) % 1
}

type BuiltWord = { text: string; startUs: Us; endUs: Us }

/**
 * Words laid out end to end with the gaps a real take has. Roughly one word
 * every 340ms, with a longer breath every dozen or so.
 */
const WORDS: BuiltWord[] = (() => {
  const words: BuiltWord[] = []
  let cursor = 0.6

  SPOKEN.forEach((text, index) => {
    const spoken = 0.18 + jitter(index + 1) * 0.26
    words.push({ text, startUs: s(cursor), endUs: s(cursor + spoken) })
    // A breath every so often; otherwise the small gap between words.
    const gap = index % 13 === 12 ? 0.52 : 0.06 + jitter(index + 90) * 0.1
    cursor += spoken + gap
  })

  return words
})()

export const CUT_DURATION = WORDS[WORDS.length - 1].endUs

/**
 * The spine: 24 windows onto one asset. Trims run ahead of timeline positions
 * because the removed silence lives between them — the gap between clip N's
 * trimEnd and clip N+1's trimStart is exactly what the agent cut.
 */
export const SPINE: VideoElement[] = (() => {
  const perClip = Math.ceil(WORDS.length / 24)
  const clips: VideoElement[] = []
  let sourceCursor = 2.32
  let timelineCursor = 0

  for (let i = 0; i < 24; i++) {
    const slice = WORDS.slice(i * perClip, (i + 1) * perClip)
    if (slice.length === 0) break

    const duration =
      (slice[slice.length - 1].endUs - slice[0].startUs) / 1_000_000 + 0.12
    const removed = 0.35 + jitter(i + 400) * 1.4

    clips.push({
      kind: "video",
      id: `clip-${i}`,
      // Stanley names clips after what is said in them, which is the single
      // most useful label a timeline can carry. Copied deliberately.
      name: slice
        .slice(0, 4)
        .map((word) => word.text)
        .join(" "),
      mediaId: "asset-1",
      startUs: s(timelineCursor),
      durationUs: s(duration),
      trimStartUs: s(sourceCursor),
      trimEndUs: s(sourceCursor + duration),
      sourceDurationUs: SOURCE_DURATION,
      transform: { position: { x: 0, y: 0 }, scaleX: 1, scaleY: 1, rotate: 0 },
      opacity: 1,
      blendMode: "normal",
      volume: 1,
      muted: false,
      effects: [],
      animations: { channels: {} },
      // The agent made this cut. Two clips were nudged by hand afterwards, so
      // the timeline has something to distinguish.
      provenance:
        i === 7 || i === 15
          ? {
              createdBy: "agent",
              lastEditedBy: "user",
              fields: { trimStartUs: "user" },
            }
          : createProvenance("agent"),
    })

    timelineCursor += duration
    sourceCursor += duration + removed
  }

  return clips
})()

/**
 * One word per caption, which is the look worth having.
 *
 * The source binding has to be genuinely in source time, not cut time. Words
 * are authored on the cut timeline; the asset instant a word was spoken at is
 * that position mapped through whichever clip contains it. Storing the cut
 * position in `sourceStartUs` looks fine until something asks the document
 * where a word came from, and then every answer is wrong by the length of every
 * silence before it.
 */
export const CAPTIONS: CaptionElement[] = (() => {
  const clipAt = (cutUs: Us) =>
    SPINE.find(
      (clip) => cutUs >= clip.startUs && cutUs < clip.startUs + clip.durationUs
    ) ?? SPINE[SPINE.length - 1]

  const toSourceUs = (cutUs: Us, clip: VideoElement) =>
    (clip.trimStartUs + (cutUs - clip.startUs)) as Us

  return WORDS.map((word, index) => {
    const clip = clipAt(word.startUs)
    const token: CaptionToken = {
      id: `tok-${index}`,
      text: word.text,
      startUs: s(0),
      endUs: (word.endUs - word.startUs) as Us,
      sourceMediaId: "asset-1",
      sourceElementId: clip.id,
      sourceStartUs: toSourceUs(word.startUs, clip),
      sourceEndUs: toSourceUs(word.endUs, clip),
    }

    return {
      kind: "caption",
      id: `cap-${index}`,
      name: word.text,
      startUs: word.startUs,
      durationUs: (word.endUs - word.startUs) as Us,
      tokens: [token],
      style: {
        fontFamily: "Inter",
        fontSize: 64,
        fontWeight: 700,
        color: "#ffffff",
        activeColor: "#ffffff",
        inactiveColor: "#ffffff99",
        wordsPerSegment: 1,
        textTransform: "none",
        textAlign: "center",
        lineHeight: 1.15,
        letterSpacing: 0,
        background: {
          enabled: false,
          color: "#000000",
          cornerRadius: 12,
          paddingX: 30,
          paddingY: 18,
        },
        shadow: { color: "rgba(0,0,0,0.6)", blur: 14, offsetX: 0, offsetY: 3 },
      },
      transform: {
        position: { x: 0, y: 680 },
        scaleX: 1,
        scaleY: 1,
        rotate: 0,
      },
      provenance: createProvenance("agent"),
    } satisfies CaptionElement
  })
})()

export const MUSIC: AudioElement = {
  kind: "audio",
  id: "music-1",
  name: "Above the Horizon",
  mediaId: "asset-music",
  startUs: s(0),
  durationUs: CUT_DURATION,
  trimStartUs: s(0),
  trimEndUs: CUT_DURATION,
  sourceDurationUs: s(180),
  volume: 0.28,
  muted: false,
  ducking: {
    enabled: true,
    amount: 0.22,
    attackUs: s(0.18),
    releaseUs: s(0.5),
  },
  animations: { channels: {} },
  provenance: createProvenance("agent"),
}

export const TRACKS: Track[] = [
  { id: "t-caption", kind: "caption", name: "Captions", elements: CAPTIONS },
  { id: "t-video", kind: "video", name: "Main", isMain: true, elements: SPINE },
  { id: "t-audio", kind: "audio", name: "Music", elements: [MUSIC] },
]

/**
 * Waveform peaks for the music lane. Derived from a sine so the shape reads as
 * music rather than noise, and deterministic for the same reason as the jitter.
 */
export const MUSIC_PEAKS: number[] = Array.from({ length: 220 }, (_, i) => {
  const swell = 0.45 + Math.sin(i / 14) * 0.2
  return Math.min(1, Math.max(0.08, swell + jitter(i) * 0.3))
})

/**
 * The spine *before* the agent ran: the same 24 windows, sitting where they
 * fall in the source. The gaps between them are the silences.
 *
 * Round 2 animates between this and SPINE, which is what silence removal
 * actually is — nothing disappears, the gaps close and everything downstream
 * slides left. Modelling it as a deletion would have taught the wrong thing.
 */
export const SPINE_BEFORE = SPINE.map((clip) => ({
  ...clip,
  startUs: (clip.trimStartUs - SPINE[0].trimStartUs) as Us,
}))

/** What the ruler spans during a run: the take, not the cut. */
export const BEFORE_DURATION = (SPINE_BEFORE[SPINE_BEFORE.length - 1].startUs +
  SPINE_BEFORE[SPINE_BEFORE.length - 1].durationUs) as Us

/**
 * Sentences, for the variant that groups clips into meaning rather than cuts.
 * Split on the long breaths the take already has.
 */
export const SENTENCES: { text: string; clipIds: string[] }[] = (() => {
  const groups: { text: string; clipIds: string[] }[] = []
  let bucket: typeof SPINE = []

  SPINE.forEach((clip, index) => {
    bucket.push(clip)
    if (bucket.length === 4 || index === SPINE.length - 1) {
      groups.push({
        text: bucket.map((item) => item.name).join(" "),
        clipIds: bucket.map((item) => item.id),
      })
      bucket = []
    }
  })

  return groups
})()

/** The words, for the transcript variant. */
export const TRANSCRIPT = WORDS

/**
 * What the agent did, as the chat would show it.
 *
 * Derived from the fixtures rather than written as prose, because a run report
 * that disagrees with the clock above it is worse than no report — it teaches
 * the user the numbers are decoration. Every figure here is the same number the
 * timeline is drawn from.
 */
const CUT_SECONDS = CUT_DURATION / 1_000_000
const SOURCE_SECONDS = SOURCE_DURATION / 1_000_000

/** One silence per join between clips. Exported so prose can quote it. */
export const SILENCE_COUNT = SPINE.length - 1
export const DROPPED_SECONDS = Math.round(SOURCE_SECONDS - CUT_SECONDS)

export const RUN_STEPS = [
  {
    label: "Read the transcript",
    detail: `${WORDS.length} words, 1 speaker`,
  },
  {
    label: `Removed ${SILENCE_COUNT} silences`,
    detail: `${SOURCE_SECONDS.toFixed(1)}s → ${CUT_SECONDS.toFixed(1)}s`,
  },
  {
    label: "Added word-by-word captions",
    detail: `${CAPTIONS.length} captions`,
  },
  { label: "Placed music under the voice", detail: "ducked to 22%" },
] as const

export const CHIPS = [
  "Remove silences",
  "Word-by-word captions",
  "Add background music",
  "Punch-in zooms",
  "Make it vertical",
  "Add b-roll",
] as const

export const ENHANCED_PROMPT =
  "Add background music, remove silences and tighten pacing, and add word-by-word captions."

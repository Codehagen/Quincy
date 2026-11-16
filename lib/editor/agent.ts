import { tool, type Tool } from "ai"
import { z } from "zod"

import { LANDSCAPE_CANVAS, SQUARE_CANVAS, VERTICAL_CANVAS } from "./document"
import { effectSpec } from "./effect-catalogue"
import {
  applyEffect,
  clearZoom,
  cropClip,
  cropSpine,
  deleteAndRipple,
  fade,
  mainTrackId,
  removeEffectsOfType,
  punchIn,
  reframe,
  splitAt,
} from "./edits"
import { applyOps, type EditOp } from "./ops"
import { findMainTrack, sceneDurationUs } from "./timeline"
import { secondsToUs, us } from "./time"
import { addCaptions, removeSilences } from "./tools"
import { DEFAULT_SILENCE, type Word } from "./transcript"
import type {
  ProjectSnapshot,
  Scene,
  TimelineElement,
  VideoElement,
} from "./types"

/**
 * The agent's hands.
 *
 * Every tool here compiles to the same ops a button does — `edits.ts` for the
 * hand edits, `tools.ts` for the two that read the transcript. That is the
 * whole point of those files existing separately from the components: there is
 * one implementation of a split, and a prompt and a keypress are two ways to
 * reach it. An agent with its own edit path is an agent that can produce a
 * timeline the user cannot undo.
 *
 * Tools mutate a **working snapshot**, not the database. A run is a sequence of
 * steps that each need to see the last one's result, and reading the row back
 * between steps would be a query per tool call and a race with nothing. The
 * document is written once, at the end, against the revision the run started
 * from — so a run either lands whole or does not land.
 *
 * Every tool returns prose. The model reads its own results, and "removed 14
 * pauses, the cut is now 3:42" is what lets it decide whether to keep going;
 * a bare `{ok: true}` gives it nothing to reason about and it starts guessing.
 */

export type AgentContext = {
  /** The working snapshot, as of now. */
  snapshot: () => ProjectSnapshot
  /**
   * Apply ops to the working snapshot and tell the browser.
   *
   * Returns what changed so a tool can describe it. Throws nothing: a batch
   * that turns out to be empty is a tool that found nothing to do, which is an
   * answer and not an error.
   */
  commit: (ops: EditOp[]) => void
  /** The transcript, fetched once per run and only if something asks. */
  words: () => Promise<Word[] | null>
}

const CANVASES = {
  wide: LANDSCAPE_CANVAS,
  vertical: VERTICAL_CANVAS,
  square: SQUARE_CANVAS,
}

export function editorTools(context: AgentContext): Record<string, Tool> {
  /** The scene under the cursor, which is what every tool operates on. */
  const currentScene = (): Scene | undefined => {
    const { document } = context.snapshot()
    return (
      document.scenes.find((scene) => scene.id === document.currentSceneId) ??
      document.scenes[0]
    )
  }

  /**
   * Run a tool body against the current scene and report the result.
   *
   * The `nothing` string is not politeness. A tool that returns "done" after
   * changing nothing teaches the model that it worked, and the next thing it
   * does is tell the user their silences are gone.
   */
  const run = (
    build: (scene: Scene) => EditOp[],
    describe: (scene: Scene, before: Scene) => string,
    nothing: string
  ): string => {
    const scene = currentScene()
    if (!scene) return "This project has no scene to edit."

    const ops = build(scene)
    if (ops.length === 0) return nothing

    context.commit(ops)

    const after = currentScene()
    return after ? describe(after, scene) : "Done."
  }

  const withWords = async (
    build: (scene: Scene, words: Word[], mediaId: string) => EditOp[],
    describe: (scene: Scene, before: Scene) => string,
    nothing: string
  ): Promise<string> => {
    const words = await context.words()
    if (!words) {
      return "This recording has not been transcribed, so there are no words to work from."
    }

    const scene = currentScene()
    const mediaId = spineMedia(scene)
    if (!scene || !mediaId) return "This project has no footage on its spine."

    return run((current) => build(current, words, mediaId), describe, nothing)
  }

  return {
    remove_silences: tool({
      description:
        "Cut the pauses out of the recording and close the gaps, keeping the captions in sync. Use for 'tighten this', 'remove the dead air', 'cut the silences'.",
      inputSchema: z.object({
        minSilenceMs: z
          .number()
          .optional()
          .describe(
            "Pauses shorter than this stay. Default 350. Below 250 the tightening becomes audible as clipping."
          ),
        paddingMs: z
          .number()
          .optional()
          .describe(
            "Silence left at each end of a cut. Default 120. Zero produces jump-cut voice."
          ),
      }),
      execute: async ({ minSilenceMs, paddingMs }) =>
        withWords(
          (scene, words, mediaId) => {
            const source = spineClip(scene, mediaId)
            if (!source) return []

            return removeSilences(scene, words, {
              mediaId,
              author: "agent",
              sourceDurationUs: source.sourceDurationUs,
              silence: {
                ...DEFAULT_SILENCE,
                minSilenceUs:
                  minSilenceMs === undefined
                    ? DEFAULT_SILENCE.minSilenceUs
                    : us(Math.round(minSilenceMs * 1000)),
                paddingUs:
                  paddingMs === undefined
                    ? DEFAULT_SILENCE.paddingUs
                    : us(Math.round(paddingMs * 1000)),
              },
            })
          },
          (scene, before) => {
            /**
             * How much of the take went, stated by the tool rather than left
             * to the model to notice.
             *
             * A recording with two words of speech in fifteen seconds tightens
             * to two seconds, and that is the tool working exactly as asked —
             * but "Tightened." on its own reads as a routine pass, and a
             * routine pass does not remove 85% of somebody's footage. The
             * proportion is arithmetic, so it belongs here, where it is said
             * every time and not only when the model happens to look.
             */
            const wasUs = sceneDurationUs(before)
            const nowUs = sceneDurationUs(scene)
            const cutUs = Math.max(0, wasUs - nowUs)
            const share = wasUs > 0 ? Math.round((cutUs / wasUs) * 100) : 0

            const warning =
              share >= 50
                ? ` That is most of the recording — the transcript found ${seconds(
                    nowUs
                  )} of speech in ${seconds(wasUs)}. Tell the user plainly, and offer a longer minSilenceMs if it looks wrong.`
                : ""

            return `Tightened: removed ${seconds(cutUs)} of ${seconds(
              wasUs
            )} (${share}%).${warning} ${describeScene(scene)}`
          },
          "There is no pause in this take long enough to cut. Nothing was changed."
        ),
    }),

    add_captions: tool({
      description:
        "Build the caption lane from the transcript. Use for 'add captions', 'subtitles', 'word by word'. Captions are not created automatically at import, so this is how they first appear.",
      inputSchema: z.object({
        wordsPerSegment: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe(
            "1 gives the word-at-a-time look and is the default. Higher reads as a phrase at a time."
          ),
      }),
      execute: async ({ wordsPerSegment }) =>
        withWords(
          (scene, words, mediaId) =>
            addCaptions(scene, words, {
              mediaId,
              author: "agent",
              wordsPerSegment,
            }),
          (scene) => `Captions on. ${describeScene(scene)}`,
          "There are no words in the transcript to caption."
        ),
    }),

    reframe: tool({
      description:
        "Change the shape of the frame the cut is composed for. Use for 'make it vertical', 'make it 16:9', 'square it up'. This does not crop — the picture is fitted inside the new frame.",
      inputSchema: z.object({
        shape: z
          .enum(["wide", "vertical", "square"])
          .describe(
            "wide is 16:9, vertical is 9:16 for TikTok and Reels, square is 1:1."
          ),
      }),
      execute: async ({ shape }) =>
        run(
          (scene) => reframe(scene, CANVASES[shape] ?? LANDSCAPE_CANVAS),
          () => `Reframed to ${shape}.`,
          `It is already ${shape}.`
        ),
    }),

    split_clip: tool({
      description:
        "Cut the spine in two at a moment on the timeline, in seconds from the start of the cut.",
      inputSchema: z.object({
        atSeconds: z
          .number()
          .min(0)
          .describe("Where to cut, in seconds from the start of the cut."),
      }),
      execute: async ({ atSeconds }) =>
        run(
          (scene) => {
            const trackId = mainTrackId(scene)
            if (!trackId) return []
            return splitAt(scene, trackId, secondsToUs(atSeconds), "agent")
          },
          (scene) => `Split. ${describeScene(scene)}`,
          "Nothing to split there — that moment is a clip boundary or past the end of the cut."
        ),
    }),

    delete_clip: tool({
      description:
        "Remove one clip from the spine and close the gap behind it. Clips are numbered from 1, in the order describe_timeline lists them.",
      inputSchema: z.object({
        clipNumber: z
          .number()
          .int()
          .min(1)
          .describe("1 for the first clip on the spine."),
      }),
      execute: async ({ clipNumber }) =>
        run(
          (scene) => {
            const trackId = mainTrackId(scene)
            const clip = findMainTrack(scene)?.elements[clipNumber - 1]
            if (!trackId || !clip) return []
            return deleteAndRipple(scene, trackId, clip.id)
          },
          (scene) => `Deleted clip ${clipNumber}. ${describeScene(scene)}`,
          `There is no clip ${clipNumber} on the spine.`
        ),
    }),

    crop: tool({
      description:
        "Choose what stays in frame when the footage does not match the shape of the cut. Use for 'keep them on the left', 'the subject is off centre', 'don't crop this one, show the whole screen'. Applies to the whole spine unless a clip is named, because framing one clip differently from the rest is a jump.",
      inputSchema: z.object({
        keep: z
          .enum(["center", "left", "right", "top", "bottom"])
          .optional()
          .describe(
            "Which part of the picture to keep. Default is centre, so only say this when the middle is wrong."
          ),
        show: z
          .enum(["fill", "whole"])
          .optional()
          .describe(
            "fill crops the footage to the frame and is the default. whole fits all of it in and accepts bars — for a screen recording or a slide, where the edges carry something."
          ),
        clipNumber: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe("Frame one clip rather than the whole spine."),
      }),
      execute: async ({ keep, show, clipNumber }) =>
        run(
          (scene) => {
            const options = {
              at: keep,
              fit:
                show === undefined
                  ? undefined
                  : show === "fill"
                    ? ("cover" as const)
                    : ("contain" as const),
            }

            if (clipNumber === undefined) return cropSpine(scene, options)

            const clip = findMainTrack(scene)?.elements[clipNumber - 1]
            return clip ? cropClip(scene, clip.id, options) : []
          },
          (scene) =>
            `Reframed the picture${
              keep ? ` to keep the ${keep}` : ""
            }${show === "whole" ? ", fitting all of it in" : ""}. ${describeScene(
              scene
            )}`,
          "Nothing to reframe — say which part to keep, or whether to fill the frame."
        ),
    }),

    punch_in: tool({
      description:
        "Push the picture in on one clip for emphasis, and let it back out. Use for 'zoom in on that', 'punch in when they say X', 'emphasise the second clip'. Clips are numbered from 1, in the order describe_timeline lists them. This is a framing move, not a cut: nothing changes length and nothing after it moves.",
      inputSchema: z.object({
        clipNumber: z
          .number()
          .int()
          .min(1)
          .describe("1 for the first clip on the spine."),
        scale: z
          .number()
          .min(1.05)
          .max(2)
          .optional()
          .describe(
            "How far in. 1.3 is a normal emphasis; past 1.6 the picture is visibly soft."
          ),
        fromSeconds: z
          .number()
          .min(0)
          .optional()
          .describe(
            "When the push starts, in seconds from the start of the cut. Defaults to the clip's own start."
          ),
        toSeconds: z
          .number()
          .min(0)
          .optional()
          .describe("When it is fully back out. Defaults to the clip's end."),
        hold: z
          .boolean()
          .optional()
          .describe(
            "Stay pushed in for the rest of the window instead of easing back out."
          ),
      }),
      execute: async ({ clipNumber, scale, fromSeconds, toSeconds, hold }) =>
        run(
          (scene) => {
            const clip = findMainTrack(scene)?.elements[clipNumber - 1]
            if (!clip) return []

            return punchIn(scene, clip.id, {
              scale,
              fromUs:
                fromSeconds === undefined
                  ? undefined
                  : secondsToUs(fromSeconds),
              toUs:
                toSeconds === undefined ? undefined : secondsToUs(toSeconds),
              hold,
            })
          },
          (scene) =>
            `Punched in on clip ${clipNumber}. ${describeScene(scene)}`,
          `There is no clip ${clipNumber} on the spine, or the window you gave falls outside it.`
        ),
    }),

    /**
     * One tool for every look, rather than nine.
     *
     * The model picks the effect the way a person does — by naming it — and a
     * tool per effect would be nine near-identical descriptions competing for
     * the same request, which is how a model ends up applying sepia when it was
     * asked to warm the picture up.
     *
     * The amounts in the description are the catalogue's, written out rather
     * than interpolated, because a tool description is a prompt: it has to read
     * as guidance about footage, not as a schema dump.
     */
    apply_look: tool({
      description:
        "Change how a clip looks: brightness, contrast, saturation, blur, colour shift, black and white, sepia, invert. Use for 'brighten this', 'make it punchier', 'it looks washed out', 'blur the background one', 'make it black and white'. Applies to the whole spine unless a clip is named, because grading one clip differently from the rest is a jump. This is a look, not a cut: nothing changes length and nothing moves.",
      inputSchema: z.object({
        look: z
          .enum([
            "brightness",
            "contrast",
            "saturation",
            "blur",
            "hue",
            "grayscale",
            "sepia",
            "invert",
          ])
          .describe("Which look to apply."),
        amount: z
          .number()
          .optional()
          .describe(
            "brightness, contrast and saturation are multipliers where 1 is untouched — 1.2 is a clear lift, 0.8 a clear drop, and past 1.6 it starts to clip. blur is pixels, 4 is soft and 20 is unreadable. hue is degrees, 0 to 360. grayscale, sepia and invert are 0 to 1. Leave it out for a sensible default."
          ),
        clipNumber: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe("Grade one clip rather than the whole spine."),
      }),
      execute: async ({ look, amount, clipNumber }) =>
        run(
          (scene) => {
            if (clipNumber === undefined) {
              const spine = findMainTrack(scene)
              if (!spine) return []

              return spine.elements.flatMap((element) =>
                applyEffect(scene, element.id, look, amount)
              )
            }

            const clip = findMainTrack(scene)?.elements[clipNumber - 1]
            return clip ? applyEffect(scene, clip.id, look, amount) : []
          },
          (scene) =>
            `Applied ${effectSpec(look).label.toLowerCase()}${
              clipNumber ? ` to clip ${clipNumber}` : " to the whole cut"
            }. ${describeScene(scene)}`,
          "Nothing to grade — there is no clip there, or the amount you gave is the value that means off."
        ),
    }),

    clear_look: tool({
      description:
        "Take a look back off. Use for 'undo the blur', 'put the colour back', 'that's too bright'. Removes it from the whole spine unless a clip is named.",
      inputSchema: z.object({
        look: z
          .enum([
            "brightness",
            "contrast",
            "saturation",
            "blur",
            "hue",
            "grayscale",
            "sepia",
            "invert",
          ])
          .describe("Which look to take off."),
        clipNumber: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe("Clear it from one clip rather than the whole spine."),
      }),
      execute: async ({ look, clipNumber }) =>
        run(
          (scene) => {
            if (clipNumber === undefined) {
              const spine = findMainTrack(scene)
              if (!spine) return []

              return spine.elements.flatMap((element) =>
                removeEffectsOfType(scene, element.id, look)
              )
            }

            const clip = findMainTrack(scene)?.elements[clipNumber - 1]
            return clip ? removeEffectsOfType(scene, clip.id, look) : []
          },
          (scene) => `Took the ${look} back off. ${describeScene(scene)}`,
          "That look is not on the cut, so there was nothing to take off."
        ),
    }),

    clear_punch_in: tool({
      description:
        "Take the zoom back off a clip. Use for 'undo the zoom', 'stop pushing in on that one'.",
      inputSchema: z.object({
        clipNumber: z
          .number()
          .int()
          .min(1)
          .describe("1 for the first clip on the spine."),
      }),
      execute: async ({ clipNumber }) =>
        run(
          (scene) => {
            const clip = findMainTrack(scene)?.elements[clipNumber - 1]
            return clip ? clearZoom(scene, clip.id) : []
          },
          () => `Clip ${clipNumber} sits at its normal size again.`,
          `Clip ${clipNumber} is not zoomed.`
        ),
    }),

    fade_clip: tool({
      description:
        "Fade a clip up from the background at its start, down into it at its end, or both. Use for 'fade in', 'fade out at the end', 'soften that cut'. There is no cross-dissolve: clips on the spine butt up against each other, so a softened cut is a dip through the background.",
      inputSchema: z.object({
        clipNumber: z
          .number()
          .int()
          .min(1)
          .describe("1 for the first clip on the spine."),
        inSeconds: z
          .number()
          .min(0)
          .max(10)
          .optional()
          .describe(
            "How long the fade up takes. Omit or 0 to leave the start alone."
          ),
        outSeconds: z
          .number()
          .min(0)
          .max(10)
          .optional()
          .describe(
            "How long the fade down takes. Omit or 0 to leave the end alone."
          ),
      }),
      execute: async ({ clipNumber, inSeconds, outSeconds }) =>
        run(
          (scene) => {
            const clip = findMainTrack(scene)?.elements[clipNumber - 1]
            if (!clip) return []

            return fade(scene, clip.id, {
              inUs: inSeconds ? secondsToUs(inSeconds) : 0,
              outUs: outSeconds ? secondsToUs(outSeconds) : 0,
            })
          },
          () => `Clip ${clipNumber} fades now.`,
          `There is no clip ${clipNumber} on the spine, or neither end was given a fade.`
        ),
    }),

    describe_timeline: tool({
      description:
        "Read the cut as it stands: length, frame, clips and captions. Use before an edit that depends on where things are, and after one you want to check.",
      inputSchema: z.object({}),
      execute: async () => {
        const scene = currentScene()
        return scene ? describeScene(scene) : "This project has no scene."
      },
    }),
  }
}

/**
 * The cut in a sentence or two.
 *
 * Goes into the system prompt so the first turn already knows what it is
 * looking at, and comes back from every tool so the model can see what its own
 * edit did. Written as prose rather than JSON because the model reads it and
 * then has to say something to a person about it.
 */
export function describeScene(scene: Scene): string {
  const spine = findMainTrack(scene)
  const clips = spine?.elements ?? []
  const captions =
    scene.tracks.find((track) => track.kind === "caption")?.elements.length ?? 0

  const canvas = scene.canvas
  const shape = canvas
    ? canvas.width > canvas.height
      ? "wide (16:9)"
      : canvas.width < canvas.height
        ? "vertical (9:16)"
        : "square (1:1)"
    : "the shape of its footage"

  const lines = [
    `The cut runs ${clock(sceneDurationUs(scene))} in ${clips.length} clip${
      clips.length === 1 ? "" : "s"
    }, framed ${shape}.`,
    captions > 0
      ? `${captions} captions on the caption lane.`
      : "No captions yet.",
  ]

  if (clips.length > 0 && clips.length <= 12) {
    lines.push(
      "Clips: " +
        clips
          .map(
            (clip, index) =>
              `${index + 1}) ${clock(clip.startUs)}–${clock(
                clip.startUs + clip.durationUs
              )}${describeLook(clip)}`
          )
          .join(", ")
    )
  }

  return lines.join(" ")
}

/**
 * What has already been done to a clip's picture, if anything.
 *
 * A punch-in leaves nothing in the timings, so a model reading a description
 * that only reports lengths cannot tell a clip it has already emphasised from
 * one it has not — and asked to "zoom in a bit more" it would reach for the
 * same tool with the same numbers and report success twice.
 */
function describeLook(clip: TimelineElement): string {
  const marks: string[] = []

  if (
    "effects" in clip &&
    clip.effects.some((effect) => effect.enabled && effect.type === "zoom")
  ) {
    marks.push("zoomed")
  }

  if (
    "animations" in clip &&
    (clip.animations.channels.opacity?.keys.length ?? 0) > 0
  ) {
    marks.push("fading")
  }

  return marks.length > 0 ? ` [${marks.join(", ")}]` : ""
}

/** Seconds to one decimal, for a sentence about how much was cut. */
function seconds(timeUs: number): string {
  return `${(Math.max(0, timeUs) / 1_000_000).toFixed(1)}s`
}

function clock(timeUs: number): string {
  const total = Math.max(0, Math.round(timeUs / 1_000_000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`
}

function spineMedia(scene: Scene | undefined): string | null {
  const clip = scene && findMainTrack(scene)?.elements.find(isVideo)
  return clip ? clip.mediaId : null
}

function spineClip(scene: Scene, mediaId: string): VideoElement | undefined {
  return findMainTrack(scene)?.elements.find(
    (element): element is VideoElement =>
      isVideo(element) && element.mediaId === mediaId
  )
}

function isVideo(element: { kind: string }): element is VideoElement {
  return element.kind === "video"
}

/**
 * The working snapshot for one run, and the only place it moves.
 *
 * Holds the runId so `applyOps` lets these writes through the lock it is
 * holding — the same check that refuses the user's edits for the seconds a run
 * takes. Every op that lands here is also handed to `onCommit`, which is how
 * the browser sees the cut change while the model is still talking.
 */
export function createRun(options: {
  initial: ProjectSnapshot
  runId: string
  onCommit: (ops: EditOp[]) => void
  /** Called at most once, and only if a tool asks for the transcript. */
  loadWords: () => Promise<Word[] | null>
}): AgentContext & { touched: () => boolean } {
  let snapshot = options.initial
  let changed = false

  // Memoised on the promise, not the result, so two tools in one step do not
  // both start the fetch. The transcript is the largest thing the run reads.
  let words: Promise<Word[] | null> | null = null

  return {
    snapshot: () => snapshot,
    touched: () => changed,
    commit: (ops) => {
      if (ops.length === 0) return
      snapshot = applyOps(snapshot, ops, {
        author: "agent",
        runId: options.runId,
      }).snapshot
      changed = true
      options.onCommit(ops)
    },
    words: () => (words ??= options.loadWords()),
  }
}

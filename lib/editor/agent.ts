import { tool, type Tool } from "ai"
import { z } from "zod"

import {
  currentScene,
  LANDSCAPE_CANVAS,
  SQUARE_CANVAS,
  VERTICAL_CANVAS,
} from "./document"
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
  setSpeed,
  setVoice,
  splitAt,
} from "./edits"
import { aimed, applyOps, applyToScene, type EditOp } from "./ops"
import { findMainTrack, sceneDurationUs, sourceToTimelineUs } from "./timeline"
import { secondsToUs, us } from "./time"
import { fillerReceipt, WORD_FILLERS } from "./fillers"
import { chapterLines, chaptersFor, placeChapters } from "./chapters"
import {
  captionStyleFor,
  cutStyleOf,
  describeCutStyle,
  type CutStyle,
} from "./cut-style"
import { cleanUpReceipt, type DisfluencyKind } from "./disfluency"
import { captionRules } from "./document"
import { findWords, replaceWords } from "./correct-words"
import { applyCaptionPreset } from "./presets"
import { MAX_SPEAKER_NAME, nameSpeaker } from "./speakers"
import { addText, MAX_TEXT_LENGTH } from "./titles"
import { setTransition } from "./transitions"
import {
  addCaptions,
  cleanUpSteps,
  removeFillerSteps,
  removeSilenceSteps,
} from "./tools"
import { DEFAULT_SILENCE, type AudioPeaks, type Word } from "./transcript"
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
  commit: (ops: EditOp[], meta?: CommitMeta) => void
  /** The transcript, fetched once per run and only if something asks. */
  words: () => Promise<Word[] | null>
  /**
   * The take's audio energy (the waveform's peaks), so cut edges can move to
   * the quietest instant near them. Optional: without it the edges stand.
   */
  peaks?: () => Promise<AudioPeaks | null>
  /** The person's saved cut style, read once when the run starts. */
  cutStyle?: CutStyle | null
  /** Keep a style as the person's own (the Brain's `cut_style` page). */
  saveCutStyle?: (style: CutStyle) => Promise<void>
}

/**
 * Which tool call a batch came from, so the margin can say what each press
 * did ("Cut a pause · 0.4 s") and Stop can tell a landed step from a skipped
 * one.
 */
export type CommitMeta = {
  toolCallId?: string
  toolName: string
  /** The cut a three-cuts sub-run works on, so the browser hands it to that cursor. */
  sceneId?: string
}

/**
 * One run's working snapshot, seen by a sub-run that cuts one scene (plans/036,
 * phase D). The snapshot is shared, so the three cuts of a three-cuts run land
 * in one document under one lock; only "the scene under the cursor" differs,
 * and every commit is tagged with it. Ops already name their scene, and one
 * commit applies whole before the next, so three sub-runs cannot interleave
 * inside an op.
 */
export function scopedTo(context: AgentContext, sceneId: string): AgentContext {
  return {
    snapshot: () => {
      const shared = context.snapshot()
      return {
        ...shared,
        document: { ...shared.document, currentSceneId: sceneId },
      }
    },
    commit: (ops, meta) =>
      context.commit(ops, {
        toolName: meta?.toolName ?? "edit",
        ...meta,
        sceneId,
      }),
    words: context.words,
    peaks: context.peaks,
    cutStyle: context.cutStyle,
    saveCutStyle: context.saveCutStyle,
  }
}

/** What a tool's `execute` is handed besides its input. */
type CallOptions = { toolCallId?: string } | undefined

const CANVASES = {
  wide: LANDSCAPE_CANVAS,
  vertical: VERTICAL_CANVAS,
  square: SQUARE_CANVAS,
}

export function editorTools(context: AgentContext): Record<string, Tool> {
  /** The scene under the cursor, which is what every tool operates on. */
  const onScreen = (): Scene | undefined =>
    currentScene(context.snapshot().document)

  /**
   * Run a tool body against the current scene and report the result.
   *
   * The `nothing` string is not politeness. A tool that returns "done" after
   * changing nothing teaches the model that it worked, and the next thing it
   * does is tell the user their silences are gone.
   */
  const run = (
    meta: CommitMeta,
    build: (scene: Scene) => EditOp[] | EditOp[][],
    describe: (scene: Scene, before: Scene) => string,
    nothing: string
  ): string => {
    const scene = onScreen()
    if (!scene) return "This project has no scene to edit."

    // A builder that plans in steps hands back one batch per press; each is
    // committed (and streamed) on its own, so the browser can land them one
    // at a time. The run still saves once, at the end.
    const steps = asSteps(build(scene))
    if (steps.length === 0) return nothing

    for (const ops of steps) context.commit(ops, meta)

    const after = onScreen()
    return after ? describe(after, scene) : "Done."
  }

  const withWords = async (
    meta: CommitMeta,
    build: (
      scene: Scene,
      words: Word[],
      mediaId: string,
      peaks: AudioPeaks | null
    ) => EditOp[] | EditOp[][],
    describe: (scene: Scene, before: Scene) => string,
    nothing: string
  ): Promise<string> => {
    const words = await context.words()
    if (!words) {
      return "This recording has not been transcribed, so there are no words to work from."
    }
    const peaks = (await context.peaks?.().catch(() => null)) ?? null

    const scene = onScreen()
    const mediaId = spineMedia(scene)
    if (!scene || !mediaId) return "This project has no footage on its spine."

    return run(
      meta,
      (current) => build(current, words, mediaId, peaks),
      describe,
      nothing
    )
  }

  return {
    remove_silences: tool({
      description:
        "Cut the pauses out of the recording and close the gaps, keeping the captions in sync. Use for 'tighten this', 'remove the dead air', 'cut the silences'.",
      inputSchema: z.object({
        minSilenceMs: z
          .number()
          .min(250)
          .optional()
          .describe(
            "Pauses shorter than this stay. Default 350. Below 250 the tightening becomes audible as clipping."
          ),
        paddingMs: z
          .number()
          .min(0)
          .optional()
          .describe(
            "Silence left at each end of a cut. Default 120. Zero produces jump-cut voice."
          ),
      }),
      execute: async ({ minSilenceMs, paddingMs }, options?: CallOptions) =>
        withWords(
          { toolCallId: options?.toolCallId, toolName: "remove_silences" },
          (scene, words, mediaId, peaks) => {
            const source = spineClip(scene, mediaId)
            if (!source) return []

            // Unasked, the person's own style decides how hard to tighten.
            const style = context.cutStyle?.pauses
            const minMs = minSilenceMs ?? style?.minSilenceMs
            const padMs = paddingMs ?? style?.paddingMs

            // In steps, one pause per press, so the cursor can cut each one.
            return removeSilenceSteps(scene, words, {
              mediaId,
              author: "agent",
              sourceDurationUs: source.sourceDurationUs,
              peaks,
              silence: {
                ...DEFAULT_SILENCE,
                minSilenceUs:
                  minMs === undefined
                    ? DEFAULT_SILENCE.minSilenceUs
                    : us(Math.round(minMs * 1000)),
                paddingUs:
                  padMs === undefined
                    ? DEFAULT_SILENCE.paddingUs
                    : us(Math.round(padMs * 1000)),
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

    remove_fillers: tool({
      description:
        "Cut the filler sounds out of the recording (um, uh, erm, hmm, øh, æh) and close the gaps, keeping the captions in sync. Use for 'remove the ums', 'cut the fillers', 'fjern øh-ene'. Only standalone sounds go; a pause beside one goes with it. 'liksom' and 'altså' are real words much of the time, so they stay unless the person names them: then pass them in alsoCut. This is not 'tighten', which means the pauses (remove_silences).",
      inputSchema: z.object({
        alsoCut: z
          .array(z.enum(WORD_FILLERS as [string, ...string[]]))
          .optional()
          .describe(
            "Filler words to cut as well as the sounds, only when the person asked for them by name."
          ),
      }),
      execute: async ({ alsoCut }, options?: CallOptions) => {
        // Set by the builder, read by the sentence: which words went.
        let removed: string[] = []
        return withWords(
          { toolCallId: options?.toolCallId, toolName: "remove_fillers" },
          (scene, words, mediaId, peaks) => {
            const source = spineClip(scene, mediaId)
            if (!source) return []

            const plan = removeFillerSteps(scene, words, {
              mediaId,
              author: "agent",
              sourceDurationUs: source.sourceDurationUs,
              include: alsoCut,
              peaks,
            })
            removed = plan.removed.map((word) => word.text)
            return plan.steps
          },
          (scene, before) => {
            // The first line is the receipt the margin shows (fillers.ts
            // `fillerReceiptOf`); the rest is for the model.
            const savedUs = Math.max(
              0,
              sceneDurationUs(before) - sceneDurationUs(scene)
            )
            return `${fillerReceipt(removed, savedUs)}\n${describeScene(scene)}`
          },
          alsoCut && alsoCut.length > 0
            ? "There are no fillers in this take to cut, the named words included. Nothing was changed."
            : "There are no filler sounds in this take to cut. Nothing was changed."
        )
      },
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
            "1 gives the word-at-a-time look and is the default. Higher reads as a phrase at a time: about that many words, broken where it reads well."
          ),
        showFillers: z
          .boolean()
          .optional()
          .describe(
            "Filler sounds (um, øh) are left off the captions. true shows them, only when the person asks for every sound."
          ),
      }),
      execute: async (
        { wordsPerSegment, showFillers },
        options?: CallOptions
      ) =>
        withWords(
          { toolCallId: options?.toolCallId, toolName: "add_captions" },
          (scene, words, mediaId) =>
            addCaptions(scene, words, {
              mediaId,
              author: "agent",
              // The person's caption look when they have saved one.
              style: captionStyleFor(context.cutStyle),
              wordsPerSegment,
              rules: captionRules(context.snapshot().document),
              showFillers:
                showFillers ?? context.cutStyle?.captions?.showFillers,
            }),
          (scene) => `Captions on. ${describeScene(scene)}`,
          "There are no words in the transcript to caption."
        ),
    }),

    reframe: tool({
      description:
        "Change the shape of the frame the cut is composed for. Use for 'make it vertical', 'make it 16:9', 'square it up'. By default the picture fills the new frame, cropped around the centre; use the crop tool after it to keep another part.",
      inputSchema: z.object({
        shape: z
          .enum(["wide", "vertical", "square"])
          .describe(
            "wide is 16:9, vertical is 9:16 for TikTok and Reels, square is 1:1."
          ),
        show: z
          .enum(["fill", "whole"])
          .optional()
          .describe(
            "fill (the default) crops the footage to the new frame. whole fits all of it in with bars — for a screen recording or a slide."
          ),
      }),
      execute: async ({ shape, show }, options?: CallOptions) =>
        run(
          { toolCallId: options?.toolCallId, toolName: "reframe" },
          (scene) => {
            // The canvas alone leaves a clip at its default `contain`: a 16:9
            // talking head becomes a strip between two bars inside 9:16, which
            // reads as "still 16:9". Asked for a shape, a person means the
            // picture in that shape, so fill unless told to show it whole.
            const ops = reframe(scene, CANVASES[shape] ?? LANDSCAPE_CANVAS)
            if (ops.length === 0 || show === "whole") return ops
            return [...ops, ...cropSpine(scene, { fit: "cover" })]
          },
          () =>
            `Reframed to ${shape}${show === "whole" ? ", the whole picture fitted in" : ", the picture filling the frame"}.`,
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
      execute: async ({ atSeconds }, options?: CallOptions) =>
        run(
          { toolCallId: options?.toolCallId, toolName: "split_clip" },
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
        "Remove clips from the spine and close the gaps behind them. Clips are numbered from 1, in the order describe_timeline lists them. To remove several, name them all in one call: the numbers are read against the cut as it stands before any of them goes. Removing more than 30% of the take, or whole spoken sentences, asks the person first.",
      inputSchema: deleteClipInput,
      execute: async (input, options?: CallOptions) => {
        const numbers = clipNumbersOf(input)
        return run(
          { toolCallId: options?.toolCallId, toolName: "delete_clip" },
          (scene) => deleteClipSteps(scene, numbers),
          (scene) =>
            `Deleted ${numbers.length === 1 ? "clip" : "clips"} ${numbers.join(", ")}. ${describeScene(scene)}`,
          `There is no clip ${numbers.join(" or ")} on the spine.`
        )
      },
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
      execute: async ({ keep, show, clipNumber }, options?: CallOptions) =>
        run(
          { toolCallId: options?.toolCallId, toolName: "crop" },
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
      execute: async (
        { clipNumber, scale, fromSeconds, toSeconds, hold },
        options?: CallOptions
      ) =>
        run(
          { toolCallId: options?.toolCallId, toolName: "punch_in" },
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
      execute: async ({ look, amount, clipNumber }, options?: CallOptions) =>
        run(
          { toolCallId: options?.toolCallId, toolName: "apply_look" },
          (scene) => {
            if (clipNumber === undefined) {
              const spine = findMainTrack(scene)
              if (!spine) return []

              // One gesture on the lane, though it is built clip by clip.
              return aimed(
                spine.elements.flatMap((element) =>
                  applyEffect(scene, element.id, look, amount)
                ),
                { action: "press", kind: "track", trackId: spine.id },
                { force: true }
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
      execute: async ({ look, clipNumber }, options?: CallOptions) =>
        run(
          { toolCallId: options?.toolCallId, toolName: "clear_look" },
          (scene) => {
            if (clipNumber === undefined) {
              const spine = findMainTrack(scene)
              if (!spine) return []

              return aimed(
                spine.elements.flatMap((element) =>
                  removeEffectsOfType(scene, element.id, look)
                ),
                { action: "press", kind: "track", trackId: spine.id },
                { force: true }
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
      execute: async ({ clipNumber }, options?: CallOptions) =>
        run(
          { toolCallId: options?.toolCallId, toolName: "clear_punch_in" },
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
        "Fade a clip up from the background at its start, down into it at its end, or both. Use for 'fade in' and 'fade out at the end'. To soften a join between two clips, use add_transition instead.",
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
      execute: async (
        { clipNumber, inSeconds, outSeconds },
        options?: CallOptions
      ) =>
        run(
          { toolCallId: options?.toolCallId, toolName: "fade_clip" },
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

    clean_up_speech: tool({
      description:
        "Cut where the speech trips over itself and close the gaps, captions with it: repeated words ('we we', 'I think I think'), false starts ('we should, um, we need to'), and the hesitations among them. Use for 'clean up my speech', 'remove the stumbles', 'fjern gjentakelsene'. Filler phrases set off by commas or pauses ('it was, like, huge', 'liksom', 'altså', 'you know') are real words much of the time, so they go only when the person names them: pass phrases: true. Doubles people mean ('very very', 'nei nei') stay.",
      inputSchema: z.object({
        only: z
          .array(z.enum(["repetition", "false_start", "hesitation"]))
          .optional()
          .describe(
            "Narrow the clean-up to these kinds, when the person asked for one of them."
          ),
        phrases: z
          .boolean()
          .optional()
          .describe(
            "Also cut set-off filler phrases (like, liksom, altså, you know), only when named."
          ),
      }),
      execute: async ({ only, phrases }, options?: CallOptions) => {
        let removed: Parameters<typeof cleanUpReceipt>[0] = []
        const kinds: DisfluencyKind[] = [
          ...(only ?? ["hesitation", "repetition", "false_start"]),
          ...(phrases ? (["discourse"] as const) : []),
        ]
        return withWords(
          { toolCallId: options?.toolCallId, toolName: "clean_up_speech" },
          (scene, words, mediaId, peaks) => {
            const source = spineClip(scene, mediaId)
            if (!source) return []
            const plan = cleanUpSteps(scene, words, {
              mediaId,
              author: "agent",
              sourceDurationUs: source.sourceDurationUs,
              kinds,
              peaks,
            })
            removed = plan.removed
            return plan.steps
          },
          (scene, before) => {
            const savedUs = Math.max(
              0,
              sceneDurationUs(before) - sceneDurationUs(scene)
            )
            const listed = removed
              .slice(0, 12)
              .map((item) => `${item.kind.replace("_", " ")}: "${item.phrase}"`)
              .join("; ")
            return `${cleanUpReceipt(removed, savedUs)}\nWhat went: ${listed}.\n${describeScene(scene)}`
          },
          "Nothing in this take trips over itself the way you asked about. Nothing was changed."
        )
      },
    }),

    read_transcript: tool({
      description:
        "Read what is said in the cut as it stands, as timed lines (m:ss from the start of the cut). Use before setting chapters, or when the person asks about something they said.",
      inputSchema: z.object({}),
      execute: async () => {
        const words = await context.words()
        const scene = onScreen()
        if (!words || !scene) return "This recording has not been transcribed."
        const spine = findMainTrack(scene)
        const mediaId = spineMedia(scene)
        if (!spine || !mediaId)
          return "This project has no footage on its spine."
        const lines = timedLines(words, (sourceUs) =>
          sourceToTimelineUs(spine, mediaId, sourceUs)
        )
        const text = lines.join("\n")
        return text.length > TRANSCRIPT_CHARS
          ? `${text.slice(0, TRANSCRIPT_CHARS)}\n[the rest is cut off here]`
          : text || "Nothing is said in the cut as it stands."
      },
    }),

    set_chapters: tool({
      description:
        "Give a longer cut chapters: a short title per part and the moment it starts, in seconds from the start of the cut. Read the transcript first. The first chapter starts at 0. Use for 'add chapters', 'split it into parts', 'kapitler'. An empty list clears them.",
      inputSchema: z.object({
        chapters: z
          .array(
            z.object({
              title: z
                .string()
                .describe("A few words, in the language of the take."),
              atSeconds: z.number().min(0),
            })
          )
          .describe("In order. At least 5 seconds apart."),
      }),
      execute: async ({ chapters }, options?: CallOptions) => {
        const scene = onScreen()
        if (!scene) return "This project has no scene."
        const verdict = chaptersFor(
          scene,
          chapters.map((chapter) => ({
            title: chapter.title,
            atUs: Math.round(chapter.atSeconds * 1_000_000),
          }))
        )
        if (!verdict.ok) return `${verdict.error} Nothing was changed.`
        context.commit([{ op: "set_chapters", chapters: verdict.chapters }], {
          toolCallId: options?.toolCallId,
          toolName: "set_chapters",
        })
        return verdict.chapters.length === 0
          ? "Chapters cleared."
          : `Chapters set:\n${chapterLines(placeChapters(scene, verdict.chapters))}`
      },
    }),

    clean_sound: tool({
      description:
        "Switch the cut between the cleaned-up sound (background noise down, low rumble off, loudness evened out) and the recording as it was. Use for 'clean up the sound', 'remove the noise', 'make the audio better', 'bedre lyd'.",
      inputSchema: z.object({
        clean: z
          .boolean()
          .describe("true for the cleaned-up sound, false for the original."),
      }),
      execute: async ({ clean }, options?: CallOptions) =>
        run(
          { toolCallId: options?.toolCallId, toolName: "clean_sound" },
          (scene) => setVoice(scene, clean ? "clean" : "original"),
          () =>
            clean
              ? "The cut now plays the cleaned-up sound. If this take was uploaded before cleaned sound existed, it plays the original until the cleaned track is made (the Sound button in the editor makes it)."
              : "The cut now plays the sound as it was recorded.",
          clean
            ? "The cut already plays the cleaned-up sound."
            : "The cut already plays the original sound."
        ),
    }),

    save_cut_style: tool({
      description:
        "Keep how this cut looks as the person's own style: the caption look, the looks on the picture, which sound plays, and (when given) how hard pauses are tightened. Quincy uses it on every cut after. Only when the person asks: 'make this my style', 'remember this look', 'bruk dette som standard'.",
      inputSchema: z.object({
        minSilenceMs: z.number().min(250).max(3000).optional(),
        paddingMs: z.number().min(0).max(500).optional(),
      }),
      execute: async ({ minSilenceMs, paddingMs }) => {
        const scene = onScreen()
        if (!scene) return "This project has no scene."
        if (!context.saveCutStyle) return "Styles cannot be saved from here."
        const pauses =
          minSilenceMs !== undefined || paddingMs !== undefined
            ? {
                pauses: {
                  minSilenceMs:
                    minSilenceMs ?? DEFAULT_SILENCE.minSilenceUs / 1000,
                  paddingMs: paddingMs ?? DEFAULT_SILENCE.paddingUs / 1000,
                },
              }
            : context.cutStyle?.pauses
              ? { pauses: context.cutStyle.pauses }
              : {}
        const style = cutStyleOf(scene, pauses)
        const lines = describeCutStyle(style)
        if (lines.length === 0) {
          return "This cut has no captions, looks or sound choice yet, so there is nothing to keep as a style."
        }
        await context.saveCutStyle(style)
        return `Saved as your cut style:\n${lines.join("\n")}`
      },
    }),

    add_text: tool({
      description:
        "Put text over the picture: a title card at the start, a name and role (lower third) at a moment, or an end card at the end. Use for 'add a title', 'put my name on screen', 'end with a call to action'. Keep it short: a title is a few words.",
      inputSchema: z.object({
        role: z.enum(["title", "lower_third", "end_card"]),
        text: z.string().min(1).max(MAX_TEXT_LENGTH).describe("What it says. For a lower third, the name."),
        subtitle: z
          .string()
          .max(MAX_TEXT_LENGTH)
          .optional()
          .describe("A lower third's second line: the role or company."),
        atSeconds: z
          .number()
          .min(0)
          .optional()
          .describe("Where it appears. Omit for the start (title), the end (end card), or 3s in (lower third)."),
        seconds: z.number().min(0.5).max(15).optional().describe("How long it stays up."),
      }),
      execute: async ({ role, text, subtitle, atSeconds, seconds }, options?: CallOptions) =>
        run(
          { toolCallId: options?.toolCallId, toolName: "add_text" },
          (scene) =>
            addText(scene, {
              role,
              content: text,
              subtitle,
              atUs:
                atSeconds !== undefined
                  ? secondsToUs(atSeconds)
                  : role === "lower_third"
                    ? secondsToUs(3)
                    : undefined,
              durationUs: seconds !== undefined ? secondsToUs(seconds) : undefined,
              author: "agent",
            }),
          () => `Added the ${role === "lower_third" ? "name" : role === "end_card" ? "end card" : "title"} "${text}".`,
          "There was no text to add."
        ),
    }),

    add_transition: tool({
      description:
        "Soften the join before a clip on the spine: a dissolve, a dip to black or a dip to white; or take one off with kind 'cut'. Clips are numbered from 1; the join is the one where this clip starts, so clip 1 has none. Use sparingly: most joins read best as a straight cut. A dissolve needs footage after the end of the clip before it; when there is none, use a dip.",
      inputSchema: z.object({
        clipNumber: z.number().int().min(2).describe("The clip after the join. 2 is the first join."),
        kind: z.enum(["dissolve", "dip_black", "dip_white", "cut"]),
        seconds: z.number().min(0.1).max(2).optional().describe("Length. Default 0.5."),
      }),
      execute: async ({ clipNumber, kind, seconds }, options?: CallOptions) => {
        const scene = onScreen()
        const spine = scene ? findMainTrack(scene) : undefined
        const clip = spine?.elements[clipNumber - 1]
        if (!scene || !spine || !clip) return `There is no clip ${clipNumber} on the spine.`
        const result = setTransition(
          scene,
          spine.id,
          clip.id,
          kind === "cut" ? null : kind,
          seconds !== undefined ? secondsToUs(seconds) : undefined
        )
        if (result.ops.length === 0) return result.reason ?? "Nothing changed at that join."
        context.commit(result.ops, { toolCallId: options?.toolCallId, toolName: "add_transition" })
        return kind === "cut"
          ? `The join before clip ${clipNumber} is a straight cut again.`
          : `Added a ${kind.replace("_", " to ")} before clip ${clipNumber}.`
      },
    }),

    set_speed: tool({
      description:
        "Play a clip on the spine faster or slower, from 0.5× to 2×. Everything after it moves with the captions. Use for 'speed up the boring part', 'slow that down'. The voice changes pitch with the speed, so above 1.5× speech sounds hurried; split first to change only part of a clip.",
      inputSchema: z.object({
        clipNumber: z.number().int().min(1),
        speed: z.number().min(0.5).max(2).describe("1 is normal speed."),
      }),
      execute: async ({ clipNumber, speed }, options?: CallOptions) =>
        run(
          { toolCallId: options?.toolCallId, toolName: "set_speed" },
          (scene) => {
            const spine = findMainTrack(scene)
            const clip = spine?.elements[clipNumber - 1]
            return spine && clip ? setSpeed(scene, spine.id, clip.id, speed) : []
          },
          (scene) => `Clip ${clipNumber} plays at ${speed}×. ${describeScene(scene)}`,
          `Clip ${clipNumber} is not on the spine, or already plays at ${speed}×.`
        ),
    }),

    correct_words: tool({
      description:
        "Fix words the transcriber got wrong, everywhere they are said, without cutting anything: names, product names, jargon. Use for 'it is Quincy, not Quinsy', 'fix the spelling of my name'. Whole words only; punctuation around them is kept.",
      inputSchema: z.object({
        replacements: z
          .array(
            z.object({
              find: z.string().min(1).max(60).describe("One word, as it appears in the transcript."),
              replace: z.string().min(1).max(60),
            })
          )
          .min(1)
          .max(20),
      }),
      execute: async ({ replacements }, options?: CallOptions) => {
        let total = 0
        for (const { find, replace } of replacements) {
          const scene = onScreen()
          if (!scene) return "This project has no scene."
          const count = findWords(scene, find).length
          const ops = replaceWords(scene, find, replace)
          if (ops.length === 0) continue
          context.commit(ops, { toolCallId: options?.toolCallId, toolName: "correct_words" })
          total += count
        }
        return total === 0
          ? "None of those words are in the captions. Read the transcript to see how they were written."
          : `Corrected ${total} ${total === 1 ? "word" : "words"}.`
      },
    }),

    style_captions: tool({
      description:
        "Restyle every caption with one look: clean (white, a few words at a time), bold (big capitals, one word, the word in yellow), boxed (on a dark box), quiet (small, a line at a time). Captions must exist; add_captions first.",
      inputSchema: z.object({ look: z.enum(["clean", "bold", "boxed", "quiet"]) }),
      execute: async ({ look }, options?: CallOptions) =>
        run(
          { toolCallId: options?.toolCallId, toolName: "style_captions" },
          (scene) => applyCaptionPreset(scene, look),
          () => `The captions are ${look} now.`,
          "There are no captions to style. Add them first."
        ),
    }),

    name_speaker: tool({
      description:
        "Give a speaker the transcriber numbered a name, for the transcript and the subtitle files. Speaker 1 is the first voice heard.",
      inputSchema: z.object({
        speakerNumber: z.number().int().min(1),
        name: z.string().max(MAX_SPEAKER_NAME),
      }),
      execute: async ({ speakerNumber, name }, options?: CallOptions) => {
        const document = context.snapshot().document
        const ops = nameSpeaker(document.metadata, speakerNumber - 1, name)
        if (ops.length === 0) return "That speaker already has that name."
        context.commit(ops, { toolCallId: options?.toolCallId, toolName: "name_speaker" })
        return `Speaker ${speakerNumber} is ${name.trim() || "unnamed"} now.`
      },
    }),

    describe_timeline: tool({
      description:
        "Read the cut as it stands: length, frame, clips and captions. Use before an edit that depends on where things are, and after one you want to check.",
      inputSchema: z.object({}),
      execute: async () => {
        const scene = onScreen()
        return scene ? describeScene(scene) : "This project has no scene."
      },
    }),
  }
}

const deleteClipInput = z.object({
  clipNumber: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("1 for the first clip on the spine."),
  clipNumbers: z
    .array(z.number().int().min(1))
    .optional()
    .describe(
      "Several clips at once, numbered as the cut stands now. Use this rather than several calls."
    ),
})

/** The clips a delete_clip call names, once each, as given. */
export function clipNumbersOf(input: {
  clipNumber?: number
  clipNumbers?: number[]
}): number[] {
  const all = [
    ...(input.clipNumbers ?? []),
    ...(input.clipNumber !== undefined ? [input.clipNumber] : []),
  ]
  return [...new Set(all)]
}

/**
 * Delete clips by their numbers in the cut as it stands, one step each.
 *
 * Last first, so a number still means the clip it meant when the call was
 * made: deleting clip 2 before clip 5 would make the old clip 5 the new 4.
 * Each step is built against the scene the previous one left, so every press
 * lands a whole, rippled cut.
 */
export function deleteClipSteps(scene: Scene, numbers: number[]): EditOp[][] {
  const trackId = mainTrackId(scene)
  const spine = findMainTrack(scene)
  if (!trackId || !spine) return []

  const ids = [...numbers]
    .sort((a, b) => b - a)
    .flatMap((number) => {
      const clip = spine.elements[number - 1]
      return clip ? [clip.id] : []
    })

  const steps: EditOp[][] = []
  let current = scene
  for (const id of ids) {
    const ops = deleteAndRipple(current, trackId, id)
    if (ops.length === 0) continue
    steps.push(ops)
    current = applyToScene(current, ops, "agent")
  }
  return steps
}

/**
 * What a gated tool would do to `scene`, without doing it.
 *
 * The gate's dry run (gate.ts): the same builder the tool's `execute` calls,
 * with the same input, against the same working scene. Null for a tool the
 * gate does not measure.
 */
export function dryRun(
  toolName: string,
  input: unknown,
  scene: Scene
): EditOp[][] | null {
  if (toolName === "delete_clip") {
    const parsed = deleteClipInput.safeParse(input)
    if (!parsed.success) return []
    return deleteClipSteps(scene, clipNumbersOf(parsed.data))
  }
  return null
}

/** How much of the transcript one read returns, in characters. */
const TRANSCRIPT_CHARS = 12_000

/**
 * The words that still play, as lines of about a sentence, each led by where
 * it starts in the cut ("0:42 so the fix was…"). A line breaks at a sentence
 * end, a pause, or 16 words.
 */
export function timedLines(
  words: Word[],
  place: (sourceUs: Word["startUs"]) => number | null
): string[] {
  const lines: string[] = []
  let current: string[] = []
  let startUs = 0
  let lastEnd = -Infinity
  for (const word of words) {
    const at = place(word.startUs)
    if (at === null) continue
    if (
      current.length > 0 &&
      (current.length >= 16 || at - lastEnd > 700_000)
    ) {
      lines.push(`${clock(startUs)} ${current.join(" ")}`)
      current = []
    }
    if (current.length === 0) startUs = at
    current.push(word.text)
    lastEnd = at + (word.endUs - word.startUs)
    if (/[.!?]$/.test(word.text.trim())) {
      lines.push(`${clock(startUs)} ${current.join(" ")}`)
      current = []
    }
  }
  if (current.length > 0) lines.push(`${clock(startUs)} ${current.join(" ")}`)
  return lines
}

/** A builder's result as steps: one batch is one step. */
function asSteps(built: EditOp[] | EditOp[][]): EditOp[][] {
  if (built.length === 0) return []
  const steps = Array.isArray(built[0])
    ? (built as EditOp[][])
    : [built as EditOp[]]
  return steps.filter((step) => step.length > 0)
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
  onCommit: (ops: EditOp[], meta?: CommitMeta) => void
  /** Called at most once, and only if a tool asks for the transcript. */
  loadWords: () => Promise<Word[] | null>
  /** Called at most once, and only if a cut asks for the waveform. */
  loadPeaks?: () => Promise<AudioPeaks | null>
  cutStyle?: CutStyle | null
  saveCutStyle?: (style: CutStyle) => Promise<void>
}): AgentContext & { touched: () => boolean } {
  let snapshot = options.initial
  let changed = false

  // Memoised on the promise, not the result, so two tools in one step do not
  // both start the fetch. The transcript is the largest thing the run reads.
  let words: Promise<Word[] | null> | null = null
  let peaks: Promise<AudioPeaks | null> | null = null

  return {
    snapshot: () => snapshot,
    touched: () => changed,
    commit: (ops, meta) => {
      if (ops.length === 0) return
      snapshot = applyOps(snapshot, ops, {
        author: "agent",
        runId: options.runId,
      }).snapshot
      changed = true
      options.onCommit(ops, meta)
    },
    words: () => (words ??= options.loadWords()),
    peaks: () =>
      (peaks ??= options.loadPeaks
        ? options.loadPeaks().catch(() => null)
        : Promise.resolve(null)),
    cutStyle: options.cutStyle ?? null,
    saveCutStyle: options.saveCutStyle,
  }
}

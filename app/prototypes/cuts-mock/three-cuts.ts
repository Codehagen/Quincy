import { paceOf, type Pace } from "@/lib/editor/pace"
import { readTake } from "@/lib/editor/reading"
import { needsCheck } from "@/lib/editor/self-check"
import { findMainTrack, sceneDurationUs } from "@/lib/editor/timeline"
import { briefsFor, copyScene, cutName, recommend, type CutBrief } from "@/lib/editor/three-cuts"
import type { Word } from "@/lib/editor/transcript"
import type { VideoDocument } from "@/lib/editor/types"

import { recorder, type Call, type Commit, type Recorded } from "./record"
import { mockOffer } from "./server"
import { opsPart, PART_GAP_MS, type Writer } from "./script"

/*
 * Three cuts, recorded the way lib/editor/three-cuts-run.ts runs them: the
 * three scenes added first (A put on screen), then each cut's tools on its
 * own scope of one shared snapshot. The calls per cut are the ones the
 * replay model picks for each brief's words (lib/editor/replay-model.ts).
 * The sub-runs run in parallel on the server, so their parts interleave on
 * the stream; here they are dealt round-robin, which is the same thing for
 * the cursors, since each cut's ops name only its own scene.
 */

const SAY = "Done. The pauses and anything you asked to go are out, and the rest plays as it did."

/*
 * Each cut does its own work in its own place on its spine, so the three
 * cursors are never on one column: A pushes in mid-take then captions, B
 * reframes square then captions three words at a time, C fades the start in
 * then cuts to a teaser at the end. (remove_silences is left out: after a
 * tighten it finds nothing, and a cursor with nothing to press reads as idle.)
 */
function callsFor(brief: CutBrief): Omit<Call, "toolCallId">[] {
  switch (brief.letter) {
    case "A":
      return [
        { toolName: "punch_in", input: { clipNumber: 2 } },
        { toolName: "add_captions", input: {} },
      ]
    case "B":
      return [
        { toolName: "reframe", input: { shape: "square" } },
        { toolName: "add_captions", input: { wordsPerSegment: 3 } },
      ]
    case "C":
      return [
        { toolName: "fade_clip", input: { clipNumber: 1, inSeconds: 0.3 } },
        { toolName: "delete_clip", input: { clipNumber: 2 } },
      ]
  }
}

/**
 * When each cut's steps land, in ms after the think: A first, B ~250ms
 * later, C ~450ms later, then uneven gaps so no two presses share a frame.
 * A cut with more steps than times keeps its last gap.
 */
const DEAL_MS: Record<CutBrief["letter"], number[]> = {
  A: [0, 1350],
  B: [250, 2150],
  C: [450, 950],
}
const STEP_IN_CALL_MS = 120

export type ThreeCutsRecording = { write: (writer: Writer, pace?: Pace) => void }

export async function recordThreeCuts(
  document: VideoDocument,
  words: Word[],
  strongLine: string | null
): Promise<ThreeCutsRecording> {
  const base = document.scenes.find((s) => s.id === document.currentSceneId) ?? document.scenes[0]
  const r = recorder(document, words, "mock-three")
  const briefs = briefsFor({
    durationUs: sceneDurationUs(base),
    firstLine: readTake(words, sceneDurationUs(base)).firstLine,
    strongLine,
  })
  const cuts = briefs.map((brief) => ({ brief, sceneId: `vs-mock-${brief.letter}` }))

  const scenes: Commit[] = cuts.map(({ brief, sceneId }, index) =>
    r.commit(
      [
        { op: "add_scene", scene: copyScene(base, sceneId, cutName(brief)) },
        ...(index === 0 ? [{ op: "select_scene" as const, sceneId }] : []),
      ],
      { toolName: "add_scene", toolCallId: `cut-${brief.letter}`, sceneId }
    )
  )

  const recorded: Recorded[][] = []
  for (const { brief, sceneId } of cuts) {
    const calls = callsFor(brief).map((c, i) => ({ ...c, toolCallId: `mock-${brief.letter}-${i}` }))
    recorded.push(await r.call(calls, r.scoped(sceneId)))
  }

  const final = r.document()
  const outcomes = cuts.map((cut, i) => ({
    brief: cut.brief,
    sceneId: cut.sceneId,
    scene: final.scenes.find((s) => s.id === cut.sceneId),
    landed: recorded[i].some((c) => c.commits.length > 0),
    checked: needsCheck(recorded[i].filter((c) => c.commits.length > 0).map((c) => c.toolName)),
  }))
  const pick = recommend(outcomes, words)

  return {
    write(writer, pace = paceOf("none")) {
      writer.data({
        type: "data-cuts",
        data: {
          leadId: cuts[0].sceneId,
          cuts: cuts.map(({ brief, sceneId }) => ({
            sceneId,
            letter: brief.letter,
            name: cutName(brief),
            where: brief.where,
            hook: brief.hook,
            lengthS: brief.lengthS,
          })),
        },
      })
      for (const commit of scenes) writer.data(opsPart(commit))

      // The three models think in parallel, so one think stands for all
      // three; then each cut's steps land on its own times (DEAL_MS), merged
      // onto the one stream. A cut is done after its last step.
      type Event = { at: number; cut: number; commit: Commit | null }
      const events: Event[] = []
      recorded.forEach((calls, i) => {
        const times = DEAL_MS[cuts[i].brief.letter]
        let at = 0
        calls.forEach((call, c) => {
          at = c < times.length ? times[c] : at + (times.at(-1)! - (times.at(-2) ?? 0))
          call.commits.forEach((commit, k) => events.push({ at: at + k * STEP_IN_CALL_MS, cut: i, commit }))
        })
        if (!calls.some((c) => c.commits.length)) events.push({ at: 0, cut: i, commit: null })
      })
      events.sort((a, b) => a.at - b.at || a.cut - b.cut)
      const lastOf = cuts.map((_, i) => events.findLast((e) => e.cut === i))

      writer.sleep(pace.thinkMs)
      let now = 0
      for (const event of events) {
        writer.sleep(Math.max(PART_GAP_MS, event.at - now))
        now = Math.max(event.at, now + PART_GAP_MS)
        if (event.commit) writer.data(opsPart(event.commit, cuts[event.cut].sceneId))
        if (lastOf[event.cut] === event) {
          const { brief, sceneId } = cuts[event.cut]
          writer.data({
            type: "data-cut-done",
            id: sceneId,
            data: { sceneId, letter: brief.letter, say: SAY, landed: outcomes[event.cut].landed },
          })
        }
      }

      for (const outcome of outcomes) {
        writer.data({ type: "data-saved", data: { revision: 0, sceneId: outcome.sceneId }, transient: true })
        if (outcome.checked) {
          writer.data({
            type: "data-check",
            data: { offer: mockOffer(outcome.sceneId), sceneId: outcome.sceneId },
            transient: true,
          })
        }
      }
      if (pick) writer.data({ type: "data-recommend", data: pick })
    },
  }
}

/** Clip numbers from the end, never the first, until the cut fits (replay-model.ts's rule). */
export function clipsToFit(document: VideoDocument, seconds: number): number[] {
  const scene = document.scenes.find((s) => s.id === document.currentSceneId) ?? document.scenes[0]
  const clips = findMainTrack(scene)?.elements ?? []
  let remaining: number = sceneDurationUs(scene)
  const numbers: number[] = []
  for (let index = clips.length - 1; index > 0; index--) {
    if (remaining <= seconds * 1_000_000) break
    remaining -= clips[index].durationUs
    numbers.push(index + 1)
  }
  return numbers
}

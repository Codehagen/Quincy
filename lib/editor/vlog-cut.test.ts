import { describe, expect, it } from "vitest"

import { silenceFor } from "./agent"
import { createScene } from "./document"
import { editStyle, editStyleSteps, EDIT_STYLES } from "./edit-styles"
import { punchIn } from "./edits"
import {
  emphasisRefusal,
  frameSteps,
  lineWindow,
  MIN_GAP_US,
  pushOnLine,
  zoomWindows,
} from "./emphasis"
import { HOOK_TEMPLATES, hookSteps, hookTemplate } from "./hooks"
import { applyToScene, newElement } from "./ops"
import { PACE_SPECS, silenceForPace } from "./pacing"
import { findMainTrack, sceneDurationUs } from "./timeline"
import { secondsToUs, us, type Us } from "./time"
import { cutSourceRanges } from "./tools"
import { detectSilences, type Word } from "./transcript"
import { validCutStyle } from "./cut-style"
import type { Scene, TextElement, VideoElement } from "./types"

const s = (seconds: number) => secondsToUs(seconds) as Us

function word(text: string, start: number, end: number): Word {
  return { text, startUs: s(start), endUs: s(end), confidence: 1 }
}

function scene(seconds = 60): Scene {
  const base = createScene({})
  const main = findMainTrack(base)!
  main.elements = [
    newElement<VideoElement>(
      {
        kind: "video",
        name: "take.mp4",
        mediaId: "va-1",
        startUs: us(0),
        durationUs: s(seconds),
        trimStartUs: us(0),
        trimEndUs: s(seconds),
        sourceDurationUs: s(seconds),
        transform: {
          position: { x: 0, y: 0 },
          scaleX: 1,
          scaleY: 1,
          rotate: 0,
        },
        opacity: 1,
        blendMode: "normal",
        volume: 1,
        muted: false,
        effects: [],
        animations: { channels: {} },
      },
      "user"
    ),
  ]
  return base
}

/** A take that opens on two seconds of nothing, with a sentence break and a mid-sentence pause. */
const TAKE: Word[] = [
  word("Why", 2, 2.3),
  word("do", 2.3, 2.5),
  word("vlogs", 2.5, 3),
  word("fail?", 3, 3.5),
  // 1.5 s after a full stop
  word("Most", 5, 5.3),
  word("of", 5.3, 5.4),
  // 1 s inside a sentence
  word("them", 6.4, 6.8),
  word("start", 6.8, 7.2),
  word("slow.", 7.2, 7.8),
  word("Here", 20, 20.3),
  word("is", 20.3, 20.5),
  word("why.", 20.5, 21),
]

describe("tightening at a pace", () => {
  it("shortens a pause to a beat instead of closing it, more after a sentence", () => {
    const natural = PACE_SPECS.natural
    const ranges = detectSilences(TAKE, s(30), {
      ...silenceForPace("natural"),
      trimHead: false,
      trimTail: false,
    })

    const afterStop = ranges.find((r) => r.startUs > s(3.5) && r.endUs < s(5))!
    const inside = ranges.find((r) => r.startUs > s(5.4) && r.endUs < s(6.4))!
    const keptAfterStop = s(1.5) - (afterStop.endUs - afterStop.startUs)
    const keptInside = s(1) - (inside.endUs - inside.startUs)

    expect(keptAfterStop).toBe(natural.sentenceKeepMs * 1000)
    expect(keptInside).toBe(natural.keepMs * 1000)
    // More breath after the word than before the next.
    expect(afterStop.startUs - s(3.5)).toBeGreaterThan(s(5) - afterStop.endUs)
  })

  it("leaves a natural pause under the threshold alone", () => {
    const words = [word("one", 0, 0.5), word("two", 1, 1.5)]
    expect(
      detectSilences(words, s(1.5), {
        ...silenceForPace("natural"),
        trimHead: false,
        trimTail: false,
      })
    ).toEqual([])
    expect(
      detectSilences(words, s(1.5), {
        ...silenceForPace("snappy"),
        trimHead: false,
        trimTail: false,
      })
    ).toHaveLength(1)
  })

  it("lets the last word land before the tail goes", () => {
    const ranges = detectSilences(TAKE, s(30), silenceForPace("natural"))
    const tail = ranges[ranges.length - 1]
    expect(tail.endUs).toBe(s(30))
    expect(tail.startUs - s(21)).toBe(PACE_SPECS.natural.endHoldMs * 1000)
  })

  it("removes less at every slower pace", () => {
    const removed = (pace: "relaxed" | "natural" | "snappy") =>
      detectSilences(TAKE, s(30), silenceForPace(pace)).reduce(
        (sum, r) => sum + (r.endUs - r.startUs),
        0
      )
    expect(removed("relaxed")).toBeLessThan(removed("natural"))
    expect(removed("natural")).toBeLessThan(removed("snappy"))
  })

  it("takes named numbers first, then a named pace, then the saved style", () => {
    expect(silenceFor({ minSilenceMs: 500 }).keepUs).toBeUndefined()
    expect(silenceFor({ pace: "snappy" }).keepUs).toBe(
      PACE_SPECS.snappy.keepMs * 1000
    )
    expect(
      silenceFor({}, { pauses: { minSilenceMs: 800, paddingMs: 100 } })
        .minSilenceUs
    ).toBe(800_000)
    expect(silenceFor({}, { pace: "relaxed" }).keepUs).toBe(
      PACE_SPECS.relaxed.keepMs * 1000
    )
    expect(silenceFor({}).keepUs).toBe(PACE_SPECS.natural.keepMs * 1000)
  })

  it("keeps a saved pace and refuses a made-up one", () => {
    expect(validCutStyle({ pace: "snappy" })).toEqual({ pace: "snappy" })
    expect(validCutStyle({ pace: "turbo" })).toBeNull()
  })
})

describe("restrained zoom", () => {
  it("sits a push on the spoken line, not the clip", () => {
    const base = scene()
    const window = lineWindow(base, TAKE, "va-1", "most of them")!
    expect(window.fromUs).toBe(s(4.8))
    expect(window.toUs).toBe(s(7.2))
    expect(lineWindow(base, TAKE, "va-1", "never said this")).toBeNull()
  })

  it("refuses a second push closer than the gap", () => {
    const base = splitInto(scene(), [10, 20, 30])
    const [first, second, , fourth] = findMainTrack(base)!.elements
    const pushed = applyToScene(
      base,
      punchIn(base, first.id, { fromUs: s(2), toUs: s(4) }),
      "agent"
    )

    expect(
      emphasisRefusal(pushed, second.id, { startUs: s(10), endUs: s(12) })
    ).toMatch(/already a push-in at 0:02/)
    expect(
      emphasisRefusal(pushed, fourth.id, {
        startUs: s(4) + MIN_GAP_US + s(20),
        endUs: s(4) + MIN_GAP_US + s(22),
      })
    ).toBeNull()
    // The same clip's own push is replaced, not counted.
    expect(
      emphasisRefusal(pushed, first.id, { startUs: s(3), endUs: s(5) })
    ).toBeNull()
    // One elsewhere on the same clip stays, so it counts.
    expect(
      emphasisRefusal(pushed, first.id, { startUs: s(6), endUs: s(8) })
    ).toMatch(/already a push-in at 0:02/)
  })

  it("refuses a push that leaves too much of the cut pushed in", () => {
    const base = scene(10)
    const clip = findMainTrack(base)!.elements[0]
    expect(
      emphasisRefusal(base, clip.id, { startUs: s(0), endUs: s(5) })
    ).toMatch(/pushed in/)
  })

  it("steps the framing on every other clip of a jump, and nowhere else", () => {
    const base = splitInto(scene(), [10, 20, 30])
    const stepped = applyToScene(base, frameSteps(base), "agent")
    const windows = zoomWindows(stepped)
    const ids = findMainTrack(stepped)!.elements.map((e) => e.id)

    expect(windows.every((w) => w.step)).toBe(true)
    expect(windows.map((w) => w.elementId)).toEqual([ids[1], ids[3]])
    // Steps never count against emphasis.
    expect(
      emphasisRefusal(stepped, ids[0], { startUs: s(1), endUs: s(3) })
    ).toBeNull()
  })
})

describe("hooks", () => {
  it("has many templates, each with an example short enough to read at a glance", () => {
    expect(HOOK_TEMPLATES.length).toBeGreaterThanOrEqual(12)
    expect(new Set(HOOK_TEMPLATES.map((h) => h.key)).size).toBe(
      HOOK_TEMPLATES.length
    )
    for (const hook of HOOK_TEMPLATES) {
      expect(hook.example.length).toBeLessThanOrEqual(70)
    }
  })

  it("opens on speech, puts the hook up top, and pushes once on a claim", () => {
    const base = scene(30)
    const { steps, notes } = hookSteps(base, TAKE, {
      template: hookTemplate("bold_claim")!,
      text: "Most vlogs start slow",
      line: "most of them start slow",
      mediaId: "va-1",
      author: "agent",
    })
    const after = steps.reduce(
      (sc, ops) => applyToScene(sc, ops, "agent"),
      base
    )

    // The two seconds of silence before "Why" are gone, bar a breath.
    expect(sceneDurationUs(base) - sceneDurationUs(after)).toBe(s(1.92))

    const hook = after.tracks
      .flatMap((t) => t.elements)
      .find((e): e is TextElement => e.kind === "text")!
    expect(hook.role).toBe("hook")
    expect(hook.startUs).toBe(0)
    expect(hook.content).toBe("Most vlogs start slow")

    expect(zoomWindows(after)).toHaveLength(1)
    expect(notes.join(" ")).toMatch(/push-in/)
  })

  it("never pushes on a template that a push does not help", () => {
    const base = scene(30)
    const { steps } = hookSteps(base, TAKE, {
      template: hookTemplate("list")!,
      text: "3 reasons vlogs fail",
      line: "most of them start slow",
      mediaId: "va-1",
      author: "agent",
    })
    const after = steps.reduce(
      (sc, ops) => applyToScene(sc, ops, "agent"),
      base
    )
    expect(zoomWindows(after)).toHaveLength(0)
  })
})

describe("edit styles", () => {
  it("cuts a fast vlog snappy, in bold captions, with jump cuts stepped", () => {
    const base = scene(30)
    const steps = editStyleSteps(base, TAKE, {
      style: editStyle("fast_vlog")!,
      mediaId: "va-1",
      sourceDurationUs: s(30),
      author: "agent",
    })
    const after = steps.reduce(
      (sc, ops) => applyToScene(sc, ops, "agent"),
      base
    )
    const captions = after.tracks
      .filter((t) => t.kind === "caption")
      .flatMap((t) => t.elements)
    expect(captions.length).toBeGreaterThan(0)
    expect(
      captions[0].kind === "caption" && captions[0].style.wordsPerSegment
    ).toBe(1)
    expect(zoomWindows(after).length).toBeGreaterThan(0)
    expect(zoomWindows(after).every((w) => w.step)).toBe(true)
  })

  it("leaves the picture alone for a story, and keeps more of the pauses", () => {
    const run = (key: "story" | "fast_vlog") => {
      const base = scene(30)
      const steps = editStyleSteps(base, TAKE, {
        style: editStyle(key)!,
        mediaId: "va-1",
        sourceDurationUs: s(30),
        author: "agent",
      })
      return steps.reduce((sc, ops) => applyToScene(sc, ops, "agent"), base)
    }
    const story = run("story")
    expect(zoomWindows(story)).toHaveLength(0)
    expect(sceneDurationUs(story)).toBeGreaterThan(
      sceneDurationUs(run("fast_vlog"))
    )
  })

  it("names every style once", () => {
    expect(new Set(EDIT_STYLES.map((style) => style.key)).size).toBe(
      EDIT_STYLES.length
    )
  })
})

/** The take cut into clips at these seconds, as a tightening leaves it (with a sliver gone at each). */
function splitInto(base: Scene, at: number[]): Scene {
  const ranges = at.map((t) => ({ startUs: s(t), endUs: s(t + 0.2) }))
  return applyToScene(
    base,
    cutSourceRanges(base, ranges, { mediaId: "va-1", author: "agent" }),
    "agent"
  )
}

describe("review fixes", () => {
  it("pushes across the whole line when a cut runs through it", () => {
    // "Most of | them start slow": a pause inside the line was shortened.
    const base = splitInto(scene(30), [6])
    const window = lineWindow(base, TAKE, "va-1", "most of them start slow")!
    expect(window.segments).toHaveLength(2)

    const { ops, refusal } = pushOnLine(base, window)
    expect(refusal).toBeNull()
    const after = applyToScene(base, ops, "agent")
    const zooms = zoomWindows(after)
    expect(zooms.map((z) => z.elementId)).toEqual(
      window.segments.map((s) => s.elementId)
    )
    // Pushed in where the first clip ends, still in where the second starts.
    const [, second] = findMainTrack(after)!.elements
    const keys = Object.values((second as VideoElement).animations.channels)[0]
      .keys
    expect(keys[0].value).toBeGreaterThan(1)
    expect(keys[keys.length - 1].value).toBe(1)
  })

  it("finds a line whose last word ends exactly at a cut", () => {
    // The clip ends at 7.8 s, the end of "slow.".
    const base = splitInto(scene(30), [7.8])
    expect(lineWindow(base, TAKE, "va-1", "start slow")).not.toBeNull()
  })

  it("does not cut speech when the clip starts inside the first word", () => {
    const words = [word("Hello", 0, 0.8), word("there", 1, 1.4)]
    const base = scene(10)
    const main = findMainTrack(base)!
    const clip = main.elements[0] as VideoElement
    // Trimmed into "Hello" at 0.2 s.
    main.elements = [
      { ...clip, trimStartUs: s(0.2), durationUs: s(9.8) } as VideoElement,
    ]
    const { steps } = hookSteps(base, words, {
      template: hookTemplate("question")!,
      text: "Why hello?",
      mediaId: "va-1",
      author: "agent",
    })
    const after = steps.reduce(
      (sc, ops) => applyToScene(sc, ops, "agent"),
      base
    )
    expect(findMainTrack(after)!.elements[0].durationUs).toBe(s(9.8))
  })

  it("never holds the hook past the footage", () => {
    const base = scene(2)
    const { steps } = hookSteps(base, [word("Hi", 0, 0.5)], {
      template: hookTemplate("question")!,
      text: "Why?",
      mediaId: "va-1",
      author: "agent",
    })
    const after = steps.reduce(
      (sc, ops) => applyToScene(sc, ops, "agent"),
      base
    )
    expect(sceneDurationUs(after)).toBe(s(2))
  })

  it("keeps one hook when a second template is picked", () => {
    const base = scene(30)
    const apply = (sc: Scene, key: "list" | "question", text: string) =>
      hookSteps(sc, TAKE, {
        template: hookTemplate(key)!,
        text,
        mediaId: "va-1",
        author: "agent",
      }).steps.reduce((acc, ops) => applyToScene(acc, ops, "agent"), sc)
    const after = apply(apply(base, "list", "3 reasons"), "question", "Why?")
    const hooks = after.tracks
      .flatMap((t) => t.elements)
      .filter((e) => e.kind === "text" && e.role === "hook")
    expect(hooks).toHaveLength(1)
    expect((hooks[0] as TextElement).content).toBe("Why?")
  })
})

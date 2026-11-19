import { describe, expect, it } from "vitest"

import { cornerBox, moveBox, resizeBox } from "./box"
import { correctWords, findWords, keepCorrections, replaceWords } from "./correct-words"
import { createScene, DEFAULT_CAPTION_STYLE } from "./document"
import { duckGain, voiceRegions } from "./ducking"
import { setSpeed } from "./edits"
import { toEdl, toFcpxml } from "./interchange"
import { layoutBox, setBox } from "./layout"
import { applyToScene, newElement, type EditOp } from "./ops"
import { moveElement, placeMedia } from "./placement"
import { applyCaptionPreset, applyLookPreset } from "./presets"
import { snap, snapPoints } from "./snapping"
import { nameSpeaker, speakerNumbers } from "./speakers"
import { cuesToWords, parseSubtitles, subtitleCues, toSrt, toVtt } from "./subtitles"
import { findMainTrack, sceneDurationUs } from "./timeline"
import { secondsToUs, us } from "./time"
import { addText, editText, textOpacity } from "./titles"
import { setTransition, transitionWindows } from "./transitions"
import type {
  AudioElement,
  CaptionElement,
  DocumentMetadata,
  ImageElement,
  Scene,
  VideoElement,
} from "./types"
import { exportSize } from "../../components/editor/use-export"

const TRANSFORM = { position: { x: 0, y: 0 }, scaleX: 1, scaleY: 1, rotate: 0 }

function clip(index: number, overrides: Partial<VideoElement> = {}): VideoElement {
  return newElement<VideoElement>(
    {
      kind: "video",
      name: `clip ${index}`,
      mediaId: "va-1",
      startUs: secondsToUs(index * 10),
      durationUs: secondsToUs(10),
      trimStartUs: secondsToUs(index * 10),
      trimEndUs: secondsToUs(index * 10 + 10),
      sourceDurationUs: secondsToUs(60),
      transform: TRANSFORM,
      opacity: 1,
      blendMode: "normal",
      volume: 1,
      muted: false,
      effects: [],
      animations: { channels: {} },
      ...overrides,
    },
    "user"
  )
}

/** Three ten-second clips of one recording, and a word every second. */
function scene({ captions = true }: { captions?: boolean } = {}): Scene {
  const base = createScene({})
  const main = findMainTrack(base)!
  main.elements = [0, 1, 2].map((index) => clip(index))
  if (captions) {
    const tokens = Array.from({ length: 30 }, (_, i) => ({
      id: `t${i}`,
      text: i === 4 ? "quinsy," : `word${i}`,
      startUs: secondsToUs(i),
      endUs: secondsToUs(i + 0.5),
      sourceMediaId: "va-1",
      sourceElementId: main.elements[Math.floor(i / 10)].id,
      sourceStartUs: secondsToUs(i),
      sourceEndUs: secondsToUs(i + 0.5),
      speaker: i < 15 ? 0 : 1,
    }))
    base.tracks.push({
      id: "captions",
      kind: "caption",
      name: "Captions",
      elements: [
        newElement<CaptionElement>(
          {
            kind: "caption",
            name: "all",
            startUs: us(0),
            durationUs: secondsToUs(30),
            tokens,
            style: DEFAULT_CAPTION_STYLE,
            transform: TRANSFORM,
          },
          "user"
        ),
      ],
    })
  }
  return base
}

const apply = (base: Scene, ops: EditOp[]) => applyToScene(base, ops, "user")

describe("placeMedia", () => {
  it("puts b-roll on a new track over the spine and under the captions, muted", () => {
    const base = scene()
    const after = apply(
      base,
      placeMedia(base, { id: "br", filename: "b.mp4", kind: "video", durationUs: secondsToUs(5) }, {
        as: "overlay",
        atUs: secondsToUs(3),
        author: "user",
      })
    )
    const kinds = after.tracks.map((track) => track.kind)
    expect(kinds.indexOf("caption")).toBeGreaterThan(1)
    const broll = after.tracks[1].elements[0] as VideoElement
    expect(broll.mediaId).toBe("br")
    expect(broll.startUs).toBe(secondsToUs(3))
    expect(broll.muted).toBe(true)
  })

  it("lays music under the whole cut with ducking on", () => {
    const base = scene()
    const after = apply(
      base,
      placeMedia(base, { id: "m", filename: "m.mp3", kind: "audio", durationUs: secondsToUs(120) }, {
        as: "music",
        atUs: 0,
        author: "user",
      })
    )
    const bed = after.tracks
      .find((track) => track.kind === "audio")!
      .elements[0] as AudioElement
    expect(bed.durationUs).toBe(sceneDurationUs(base))
    expect(bed.ducking?.enabled).toBe(true)
  })

  it("puts a still on the cut for four seconds", () => {
    const base = scene()
    const after = apply(
      base,
      placeMedia(base, { id: "i", filename: "i.png", kind: "image", durationUs: null }, {
        as: "overlay",
        atUs: secondsToUs(1),
        author: "user",
      })
    )
    const still = after.tracks.flatMap((track) => track.elements).find((e) => e.kind === "image") as ImageElement
    expect(still.durationUs).toBe(secondsToUs(4))
  })

  it("moves an overlay and never the spine", () => {
    const base = scene()
    const placed = apply(
      base,
      placeMedia(base, { id: "i", filename: "i.png", kind: "image", durationUs: null }, {
        as: "overlay",
        atUs: 0,
        author: "user",
      })
    )
    const track = placed.tracks.find((t) => t.elements.some((e) => e.kind === "image"))!
    const moved = apply(placed, moveElement(placed, track.id, track.elements[0].id, { startUs: secondsToUs(7) }))
    expect(moved.tracks.flatMap((t) => t.elements).find((e) => e.kind === "image")!.startUs).toBe(secondsToUs(7))
    const spine = findMainTrack(placed)!
    expect(moveElement(placed, spine.id, spine.elements[0].id, { startUs: 5 })).toEqual([])
  })
})

describe("snapping", () => {
  it("snaps to the nearest point within the threshold, and not when disabled", () => {
    const points = snapPoints(scene(), { playheadUs: secondsToUs(12) })
    expect(snap(secondsToUs(10.05), points, secondsToUs(0.2), false).atUs).toBe(secondsToUs(10))
    expect(snap(secondsToUs(10.05), points, secondsToUs(0.2), true).atUs).toBe(secondsToUs(10.05))
  })
})

describe("box", () => {
  it("snaps a moved box to the frame's centre and edges", () => {
    const { box, guides } = moveBox({ x: 0.2, y: 0.2, width: 0.3, height: 0.3 }, { x: 0.146, y: 0 })
    expect(box.x + box.width / 2).toBeCloseTo(0.5)
    expect(guides.some((guide) => guide.axis === "x" && guide.at === 0.5)).toBe(true)
  })

  it("keeps the aspect from a corner and never goes below the minimum", () => {
    const start = { x: 0.1, y: 0.1, width: 0.4, height: 0.4 }
    const grown = resizeBox(start, "se", { x: 0.2, y: 0 }, { canvasAspect: 1 })
    expect(grown.width / grown.height).toBeCloseTo(1)
    const shrunk = resizeBox(start, "e", { x: -1, y: 0 })
    expect(shrunk.width).toBeGreaterThanOrEqual(0.05)
  })

  it("puts picture in picture in a corner, and the whole frame clears the box", () => {
    const box = cornerBox("bottom_right", { canvasAspect: 16 / 9, sourceAspect: 16 / 9 })
    expect(box.x + box.width).toBeLessThan(1)
    const base = scene()
    const main = findMainTrack(base)!
    const placed = apply(base, setBox(base, main.id, main.elements[0].id, layoutBox("top_left", { canvasAspect: 16 / 9, sourceAspect: 16 / 9 })))
    expect((findMainTrack(placed)!.elements[0] as VideoElement).box).toBeDefined()
    const cleared = apply(placed, setBox(placed, main.id, main.elements[0].id, layoutBox("full", { canvasAspect: 1, sourceAspect: 1 })))
    expect((findMainTrack(cleared)!.elements[0] as VideoElement).box).toBeUndefined()
  })
})

describe("ducking", () => {
  it("is low under speech and ramps back up after it", () => {
    const regions = voiceRegions(scene())
    const ducking = { enabled: true, amount: 0.3, attackUs: us(150_000), releaseUs: us(400_000) }
    expect(duckGain(secondsToUs(0.2), regions, ducking)).toBeCloseTo(0.3)
    expect(duckGain(secondsToUs(40), regions, ducking)).toBe(1)
    expect(duckGain(secondsToUs(40), regions, { ...ducking, enabled: false })).toBe(1)
  })
})

describe("transitions", () => {
  it("puts a dip on a join and takes it off again", () => {
    const base = scene()
    const main = findMainTrack(base)!
    const { ops, reason } = setTransition(base, main.id, main.elements[1].id, "dip_black")
    expect(reason).toBeNull()
    const after = apply(base, ops)
    expect(transitionWindows(findMainTrack(after)!)).toHaveLength(1)
    const off = setTransition(after, main.id, main.elements[1].id, null)
    const cleared = apply(after, off.ops)
    expect((findMainTrack(cleared)!.elements[1] as VideoElement).transition).toBeUndefined()
  })

  it("explains why a dissolve cannot go where there is no footage after the cut", () => {
    const base = createScene({})
    const main = findMainTrack(base)!
    main.elements = [
      clip(0, { trimStartUs: secondsToUs(50), trimEndUs: secondsToUs(60) }),
      clip(1, { trimStartUs: us(0), trimEndUs: secondsToUs(10) }),
    ]
    const { ops, reason } = setTransition(base, main.id, main.elements[1].id, "dissolve")
    expect(ops).toEqual([])
    expect(reason).toMatch(/dip/)
  })

  it("has nothing to join before the first clip", () => {
    const base = scene()
    const main = findMainTrack(base)!
    expect(setTransition(base, main.id, main.elements[0].id, "dip_black").reason).toBeTruthy()
  })
})

describe("speed", () => {
  it("halves a clip at 2× and closes up the spine behind it, words with it", () => {
    const base = scene()
    const main = findMainTrack(base)!
    const after = apply(base, setSpeed(base, main.id, main.elements[0].id, 2))
    const spine = findMainTrack(after)!
    expect(spine.elements[0].durationUs).toBe(secondsToUs(5))
    expect(spine.elements[1].startUs).toBe(secondsToUs(5))
    expect(sceneDurationUs(after)).toBe(secondsToUs(25))
    const word = (after.tracks.find((t) => t.id === "captions")!.elements as CaptionElement[])
      .flatMap((c) => c.tokens.map((t) => ({ at: c.startUs + t.startUs, id: t.id })))
      .find((t) => t.id === "t12")!
    // Twelve seconds into the recording is two seconds into clip 1, now at 5s.
    expect(word.at).toBe(secondsToUs(7))
  })

  it("clears the field at 1×", () => {
    const base = scene()
    const main = findMainTrack(base)!
    const fast = apply(base, setSpeed(base, main.id, main.elements[0].id, 1.5))
    const back = apply(fast, setSpeed(fast, main.id, main.elements[0].id, 1))
    expect((findMainTrack(back)!.elements[0] as VideoElement).speed).toBeUndefined()
    expect(findMainTrack(back)!.elements[0].durationUs).toBe(secondsToUs(10))
  })
})

describe("text", () => {
  it("adds a title at the start and an end card at the end, and edits one", () => {
    const base = scene()
    const titled = apply(base, addText(base, { role: "title", content: "Hello", author: "user" }))
    const ended = apply(titled, addText(titled, { role: "end_card", content: "Bye", author: "user" }))
    const texts = ended.tracks.flatMap((t) => t.elements).filter((e) => e.kind === "text")
    expect(texts.map((t) => t.startUs)).toEqual([us(0), us(sceneDurationUs(base) - 3_000_000)])
    const edited = apply(ended, editText(ended, texts[0].id, { content: "Hi" }))
    expect(edited.tracks.flatMap((t) => t.elements).find((e) => e.id === texts[0].id)).toMatchObject({ content: "Hi" })
  })

  it("fades in and out", () => {
    expect(textOpacity(0, 3_000_000)).toBe(0)
    expect(textOpacity(1_500_000, 3_000_000)).toBe(1)
    expect(textOpacity(3_000_000, 3_000_000)).toBe(0)
  })
})

describe("correcting words", () => {
  it("fixes one word and remembers what was heard", () => {
    const base = scene()
    const after = apply(base, correctWords(base, [{ tokenId: "t1", text: "Quincy" }]))
    const token = (after.tracks.find((t) => t.id === "captions")!.elements[0] as CaptionElement).tokens[1]
    expect(token).toMatchObject({ text: "Quincy", heard: "word1", sourceStartUs: secondsToUs(1) })
  })

  it("replaces whole words everywhere, keeping the punctuation", () => {
    const base = scene()
    expect(findWords(base, "Quinsy")).toHaveLength(1)
    expect(findWords(base, "word")).toHaveLength(0)
    const after = apply(base, replaceWords(base, "quinsy", "Quincy"))
    const token = (after.tracks.find((t) => t.id === "captions")!.elements[0] as CaptionElement).tokens[4]
    expect(token.text).toBe("Quincy,")
  })

  it("carries corrections into a rebuilt lane", () => {
    const base = scene()
    const corrected = apply(base, correctWords(base, [{ tokenId: "t2", text: "fixed" }]))
    const rebuilt = keepCorrections(corrected, [
      {
        op: "replace_elements",
        sceneId: base.id,
        trackId: "captions",
        elements: base.tracks.find((t) => t.id === "captions")!.elements,
      },
    ])
    const op = rebuilt[0]
    expect(op.op === "replace_elements" && (op.elements[0] as CaptionElement).tokens[2].text).toBe("fixed")
  })
})

describe("subtitles", () => {
  it("writes readable cues, broken by speaker", () => {
    const cues = subtitleCues(scene())
    expect(cues.length).toBeGreaterThan(1)
    expect(cues.every((cue) => cue.text.length <= 84)).toBe(true)
    const srt = toSrt(cues, { "1": "Kari" })
    expect(srt).toMatch(/^1\n00:00:00,000 --> /)
    expect(srt).toContain("Kari:")
    expect(toVtt(cues)).toMatch(/^WEBVTT\n\n00:00:00.000 --> /)
  })

  it("reads SRT and VTT back as cues, and cues as words in the recording's time", () => {
    const srt = "1\n00:00:01,000 --> 00:00:02,500\n<i>Hello</i> there\n\n2\n00:00:03,000 --> 00:00:04,000\nAgain"
    const cues = parseSubtitles(srt)
    expect(cues).toEqual([
      { startUs: secondsToUs(1), endUs: secondsToUs(2.5), text: "Hello there" },
      { startUs: secondsToUs(3), endUs: secondsToUs(4), text: "Again" },
    ])
    expect(parseSubtitles("WEBVTT\n\n00:01.000 --> 00:02.000 align:start\nHi")).toHaveLength(1)
    const words = cuesToWords(cues)
    expect(words.map((w) => w.text)).toEqual(["Hello", "there", "Again"])
    expect(words[0].startUs).toBe(secondsToUs(1))
    expect(words[1].endUs).toBe(secondsToUs(2.5))
  })
})

describe("interchange", () => {
  it("lists the spine as EDL events with source and record times", () => {
    const edl = toEdl(scene({ captions: false }), {
      title: "Talk",
      fps: 25,
      media: { "va-1": { filename: "talk.mp4" } },
    })
    expect(edl).toContain("TITLE: Talk")
    expect(edl).toContain("001  TALK     AA/V  C        00:00:00:00 00:00:10:00 00:00:00:00 00:00:10:00")
    expect(edl).toContain("* FROM CLIP NAME: talk.mp4")
  })

  it("writes an FCPXML with one asset and the spine", () => {
    const xml = toFcpxml(scene({ captions: false }), {
      title: "Talk & more",
      fps: 30,
      width: 1920,
      height: 1080,
      media: { "va-1": { filename: "talk.mp4", durationUs: secondsToUs(60) } },
    })
    expect(xml).toContain('<fcpxml version="1.10">')
    expect(xml).toContain("Talk &amp; more")
    expect(xml.match(/<asset id=/g)).toHaveLength(1)
    expect(xml.match(/<asset-clip /g)).toHaveLength(3)
  })
})

describe("presets", () => {
  it("restyles every caption", () => {
    const base = scene()
    const after = apply(base, applyCaptionPreset(base, "bold"))
    const caption = after.tracks.find((t) => t.id === "captions")!.elements[0] as CaptionElement
    expect(caption.style.textTransform).toBe("uppercase")
  })

  it("grades the spine and a second look replaces the first", () => {
    const base = scene()
    const warm = apply(base, applyLookPreset(base, "warm"))
    const mono = apply(warm, applyLookPreset(warm, "mono"))
    const effects = (findMainTrack(mono)!.elements[0] as VideoElement).effects.map((e) => e.type).sort()
    expect(effects).toEqual(["contrast", "grayscale"])
    const plain = apply(mono, applyLookPreset(mono, "natural"))
    expect((findMainTrack(plain)!.elements[0] as VideoElement).effects).toEqual([])
  })
})

describe("speakers", () => {
  it("lists speakers in the order they talk and names them", () => {
    expect(speakerNumbers(scene())).toEqual([0, 1])
    const metadata = { id: "p", name: "p", durationUs: us(0), createdAt: "", updatedAt: "" } as DocumentMetadata
    expect(nameSpeaker(metadata, 0, " Kari ")).toEqual([
      { op: "update_metadata", patch: { speakers: { "0": "Kari" } } },
    ])
    expect(nameSpeaker({ ...metadata, speakers: { "0": "Kari" } }, 0, "")).toEqual([
      { op: "update_metadata", patch: { speakers: {} } },
    ])
  })
})

describe("export size", () => {
  it("scales the short side and keeps sizes even", () => {
    expect(exportSize({ width: 1080, height: 1920 }, 720)).toEqual({ width: 720, height: 1280 })
    expect(exportSize({ width: 1920, height: 1080 }, 2160)).toEqual({ width: 3840, height: 2160 })
    expect(exportSize({ width: 1920, height: 1080 }, "source")).toEqual({ width: 1920, height: 1080 })
  })
})

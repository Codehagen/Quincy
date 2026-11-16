import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  GRID,
  MARK,
  SASH_ROWS,
  STATES,
  STATE_NAMES,
  duration,
  iconSvg,
  locate,
  paths,
  sample,
  toIndices,
  toSvg,
} from "./engine"
import { encodeGif, lzw } from "./gif"

/** The chosen mark, as drawn in the lab (round 2, piece 31). */
const LAB_31 = [
  "................",
  "...##########...",
  "..############..",
  "..############..",
  "..###..##..###..",
  "..###..##..###..",
  "..###..##..###..",
  "..############..",
  "..############..",
  "yyyyyyyyyyyyyyyy",
  "yyyyyyyyyyyyyyyy",
  "yyyyyyyyyyyyyyyy",
  "..############..",
  "..############..",
  "...##########...",
  "................",
]

const all = STATE_NAMES.flatMap((s) =>
  STATES[s].frames.map((fr, i) => ({ state: s, i, fr })),
)

const extent = (row: string) => {
  const first = row.search(/[^.]/)
  return first < 0 ? null : [first, row.length - 1 - [...row].reverse().join("").search(/[^.]/)]
}

describe("frames", () => {
  it("idle's first frame is the mark the owner chose", () => {
    expect(MARK).toEqual(LAB_31)
  })

  it.each(all)("$state[$i] is 16×16 of . # y k, held a readable time", ({ fr }) => {
    expect(fr.bitmap).toHaveLength(GRID)
    for (const row of fr.bitmap) expect(row).toMatch(/^[.#yk]{16}$/)
    expect(Number.isInteger(fr.hold)).toBe(true)
    expect(fr.hold).toBeGreaterThanOrEqual(50)
  })

  it.each(all)("$state[$i] never moves the body (no bobbing)", ({ fr }) => {
    for (let y = 0; y < GRID; y++) {
      if ((SASH_ROWS as readonly number[]).includes(y)) continue
      expect(extent(fr.bitmap[y]), `row ${y}`).toEqual(extent(MARK[y]))
    }
  })

  it.each(all)("$state[$i] keeps its eyes inside the body, one ink pixel from the edge", ({ fr }) => {
    fr.bitmap.forEach((row, y) => {
      const e = extent(MARK[y])
      if (!e || (SASH_ROWS as readonly number[]).includes(y)) return
      for (let x = e[0]; x <= e[1]; x++) {
        if (row[x] !== ".") continue
        expect(y, `hole at ${x},${y}`).toBeGreaterThanOrEqual(2)
        expect(y, `hole at ${x},${y}`).toBeLessThanOrEqual(7)
        expect(x).toBeGreaterThanOrEqual(3)
        expect(x).toBeLessThanOrEqual(12)
      }
    })
  })

  it("draws every frame by hand: no two consecutive frames in a state are the same", () => {
    for (const s of STATE_NAMES) {
      const fr = STATES[s].frames
      for (let i = 1; i < fr.length; i++) expect(fr[i].bitmap, `${s}[${i}]`).not.toEqual(fr[i - 1].bitmap)
    }
  })

  it("only the found flash and the pen use keep-ink, and only on the sash", () => {
    for (const { state, fr } of all) {
      fr.bitmap.forEach((row, y) => {
        if (!row.includes("k")) return
        expect(["found", "writing"]).toContain(state)
        expect(SASH_ROWS as readonly number[]).toContain(y)
      })
    }
  })
})

describe("sample", () => {
  it("is a pure function of time", () => {
    for (const s of STATE_NAMES) {
      for (const t of [0, 17, 999, 4321, 60_000]) expect(sample(s, t)).toBe(sample(s, t))
    }
  })

  it("starts every state on its first frame, and clamps negative or non-finite time", () => {
    for (const s of STATE_NAMES) {
      expect(locate(s, 0)).toEqual({ state: s, index: 0 })
      expect(locate(s, -50)).toEqual({ state: s, index: 0 })
      expect(locate(s, Number.NaN)).toEqual({ state: s, index: 0 })
    }
  })

  it("cuts on frame boundaries", () => {
    const first = STATES.idle.frames[0].hold
    expect(locate("idle", first - 1).index).toBe(0)
    expect(locate("idle", first).index).toBe(1)
  })

  it("loops the looping states", () => {
    for (const s of STATE_NAMES.filter((n) => STATES[n].play === "loop")) {
      const d = duration(s)
      for (const t of [0, 123, d - 1]) expect(sample(s, t + 3 * d)).toBe(sample(s, t))
    }
  })

  it("hands the one-shots over to idle, with the time carried on", () => {
    for (const s of ["found", "sent"] as const) {
      expect(STATES[s].play).toBe("once")
      expect(STATES[s].then).toBe("idle")
      const d = duration(s)
      expect(locate(s, d - 1).state).toBe(s)
      expect(locate(s, d)).toEqual({ state: "idle", index: 0 })
      expect(sample(s, d + 3000)).toBe(sample("idle", 3000))
    }
  })

  it("holds stuck still for good", () => {
    expect(STATES.stuck.frames).toHaveLength(1)
    for (const t of [0, 1000, 1e9]) expect(sample("stuck", t)).toBe(STATES.stuck.frames[0].bitmap)
  })

  it("blinks in idle within a few seconds, and moves the gaze", () => {
    const shut = STATES.idle.frames.findIndex((fr) => !fr.bitmap[4].slice(3, 13).includes("."))
    expect(shut).toBeGreaterThan(0)
    const before = STATES.idle.frames.slice(0, shut).reduce((n, fr) => n + fr.hold, 0)
    expect(before).toBeLessThanOrEqual(4000)
    const gazes = new Set(STATES.idle.frames.map((fr) => fr.bitmap[5].slice(3, 13)))
    expect(gazes.size).toBeGreaterThanOrEqual(3)
  })

  it("reads left to right, row by row", () => {
    const firstHole = (b: readonly string[]) => {
      for (let y = 2; y <= 8; y++) {
        const x = b[y].slice(3, 13).indexOf(".")
        if (x >= 0) return { x: x + 3, y }
      }
      return null
    }
    const pos = STATES.reading.frames.slice(0, 9).map((fr) => firstHole(fr.bitmap)!)
    for (let line = 0; line < 3; line++) {
      const [a, b, c] = pos.slice(line * 3, line * 3 + 3)
      expect(a.y).toBe(b.y)
      expect(b.y).toBe(c.y)
      expect(a.x).toBeLessThan(b.x)
      expect(b.x).toBeLessThan(c.x)
      if (line > 0) expect(a.y).toBeGreaterThan(pos[(line - 1) * 3].y)
    }
  })

  it("moves the pen along the sash from left to right", () => {
    const pens = STATES.writing.frames
      .map((fr) => fr.bitmap[9].indexOf("k"))
      .filter((x) => x >= 0)
    expect(pens.length).toBeGreaterThan(10)
    for (let i = 1; i < pens.length; i++) expect(pens[i]).toBe(pens[i - 1] + 1)
  })
})

describe("drawing", () => {
  it("draws whole-pixel runs, one path per colour", () => {
    const d = paths(MARK)
    expect(d.k).toBe("")
    expect(d.y).toBe("M0 9h16v1h-16ZM0 10h16v1h-16ZM0 11h16v1h-16Z")
    expect(d["#"]).toMatch(/^(M\d+ \d+h\d+v1h-\d+Z)+$/)
  })

  it("exports a crisp SVG", () => {
    const svg = toSvg(MARK)
    expect(svg).toContain('viewBox="0 0 16 16"')
    expect(svg).toContain('shape-rendering="crispEdges"')
    expect(svg).toContain("#FDE24B")
  })

  it("app/icon.svg is the engine's mark (run scripts/mascot-icons.ts)", () => {
    const file = readFileSync(join(import.meta.dirname, "../../app/icon.svg"), "utf8")
    expect(file).toBe(iconSvg())
  })

  it("scales a frame into palette indices", () => {
    const px = toIndices(MARK, 2)
    expect(px).toHaveLength(32 * 32)
    expect(px[0]).toBe(0)
    expect(px[(9 * 2) * 32 + 0]).toBe(2) // sash at its left tail
    expect(px[(1 * 2) * 32 + 3 * 2]).toBe(1) // ink at the notched corner
  })
})

/** A minimal GIF LZW decoder, to prove the encoder round-trips. */
function unlzw(data: Uint8Array, minCodeSize: number): number[] {
  const clear = 1 << minCodeSize
  const eoi = clear + 1
  let size = minCodeSize + 1
  let dict: number[][] = []
  const reset = () => {
    dict = Array.from({ length: clear }, (_, i) => [i])
    dict.push([], [])
    size = minCodeSize + 1
  }
  reset()
  const out: number[] = []
  let bit = 0
  let prev: number[] | null = null
  const read = () => {
    let code = 0
    for (let i = 0; i < size; i++, bit++) code |= ((data[bit >> 3] >> (bit & 7)) & 1) << i
    return code
  }
  for (;;) {
    const code = read()
    if (code === clear) {
      reset()
      prev = null
      continue
    }
    if (code === eoi) break
    let entry: number[]
    if (code < dict.length) entry = dict[code]
    else if (prev) entry = [...prev, prev[0]]
    else throw new Error("bad code")
    out.push(...entry)
    if (prev) dict.push([...prev, entry[0]])
    if (dict.length === 1 << size && size < 12) size++
    prev = entry
  }
  return out
}

describe("gif", () => {
  it("round-trips LZW on every frame of every state", () => {
    for (const { fr } of all) {
      const px = toIndices(fr.bitmap, 3)
      expect(unlzw(lzw(px), 2)).toEqual([...px])
    }
  })

  it("round-trips LZW past the 4096-code table reset", () => {
    const px = Uint8Array.from({ length: 40_000 }, (_, i) => (i * 7 + (i >> 5)) % 4)
    expect(unlzw(lzw(px), 2)).toEqual([...px])
  })

  it("writes a looping GIF89a with one image per frame", () => {
    const frames = STATES.reading.frames.map((fr) => ({ indices: toIndices(fr.bitmap, 4), delay: fr.hold }))
    const gif = encodeGif(frames, {
      width: 64,
      height: 64,
      palette: ["#FFFFFF", "#111110", "#FDE24B", "#111110"],
      loop: true,
    })
    expect(String.fromCharCode(...gif.subarray(0, 6))).toBe("GIF89a")
    expect(gif[gif.length - 1]).toBe(0x3b)
    expect(new TextDecoder().decode(gif)).toContain("NETSCAPE2.0")
    // Walk the blocks after the header (13) and the 4-colour table (12).
    let p = 25
    let images = 0
    const skipSubBlocks = () => {
      while (gif[p] !== 0) p += gif[p] + 1
      p++
    }
    while (gif[p] !== 0x3b) {
      if (gif[p] === 0x21) {
        p += 2
        skipSubBlocks()
      } else if (gif[p] === 0x2c) {
        images++
        p += 10 + 1 // descriptor, then the LZW minimum code size
        skipSubBlocks()
      } else throw new Error(`unexpected block 0x${gif[p].toString(16)} at ${p}`)
    }
    expect(p).toBe(gif.length - 1)
    expect(images).toBe(frames.length)
  })
})

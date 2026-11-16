import { describe, expect, it } from "vitest"

import { STATES, STATE_NAMES, duration, locate } from "./engine"
import {
  BODY,
  EYE_BOX,
  SMOOTH,
  type SmoothPose,
  blendPose,
  eyePoints,
  locateSmooth,
  sampleSmooth,
  smoothDuration,
  stillPose,
} from "./smooth"

/** Two passes of every state, plus the hand-over, every 5ms. */
const times = (s: (typeof STATE_NAMES)[number]) => {
  const end = duration(s) * 2 + (SMOOTH[s].then ? duration(SMOOTH[s].then!) : 0)
  const out: number[] = []
  for (let t = 0; t <= end; t += 5) out.push(t)
  return out
}

const flat = (p: SmoothPose) => [
  ...p.eyes.flatMap((e) => [e.x, e.y, e.w, e.h, e.open, e.arch]),
  p.sash.lift,
  p.sash.angle,
  p.sash.h,
  p.sash.inset,
]

describe("sampleSmooth", () => {
  it("is a pure function of time", () => {
    for (const s of STATE_NAMES) {
      for (const t of [0, 17, 999, 4321, 60_000]) expect(sampleSmooth(s, t)).toEqual(sampleSmooth(s, t))
    }
  })

  it("clamps negative and non-finite time to the start", () => {
    for (const s of STATE_NAMES) {
      expect(sampleSmooth(s, -50)).toEqual(sampleSmooth(s, 0))
      expect(sampleSmooth(s, Number.NaN)).toEqual(sampleSmooth(s, 0))
    }
  })

  it("lasts exactly as long as the pixel state, and hands over at the same moment", () => {
    for (const s of STATE_NAMES) {
      expect(smoothDuration(s)).toBe(duration(s))
      expect(SMOOTH[s].play).toBe(STATES[s].play)
      expect(SMOOTH[s].then).toBe(STATES[s].then)
      for (const t of times(s)) expect(locateSmooth(s, t).state, `${s} @${t}`).toBe(locate(s, t).state)
    }
  })

  it("loops the looping states", () => {
    for (const s of STATE_NAMES.filter((n) => SMOOTH[n].play === "loop")) {
      const d = duration(s)
      for (const t of [0, 123, d - 1]) {
        const a = flat(sampleSmooth(s, t))
        const b = flat(sampleSmooth(s, t + 3 * d))
        a.forEach((v, i) => expect(b[i]).toBeCloseTo(v, 6))
      }
    }
  })

  it("hands the one-shots over to idle and settles there", () => {
    for (const s of ["found", "sent"] as const) {
      const d = duration(s)
      expect(locateSmooth(s, d - 1).state).toBe(s)
      expect(locateSmooth(s, d).state).toBe("idle")
      const a = flat(sampleSmooth(s, d + 4000))
      const b = flat(sampleSmooth("idle", 4000))
      a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 4))
    }
  })

  it("never jumps: the eyes and sash move continuously, through loops and hand-overs", () => {
    for (const s of STATE_NAMES) {
      let prev: number[] | null = null
      let worst = { jump: 0, at: "" }
      for (const t of times(s)) {
        const cur = flat(sampleSmooth(s, t))
        if (prev) {
          for (let i = 0; i < cur.length; i++) {
            const jump = Math.abs(cur[i] - prev[i])
            if (jump > worst.jump) worst = { jump, at: `${s} @${t} ch ${i}` }
          }
        }
        prev = cur
      }
      expect(worst.jump, worst.at).toBeLessThan(0.35)
    }
  })

  it("never moves the body (no bobbing)", () => {
    for (const s of STATE_NAMES) for (const t of times(s)) expect(sampleSmooth(s, t).body).toEqual(BODY)
  })

  it("keeps the eyes inside the body, one unit from its edge and above the sash", () => {
    for (const s of STATE_NAMES) {
      let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity]
      for (const t of times(s)) {
        for (const e of sampleSmooth(s, t).eyes) {
          for (const [x, y] of eyePoints(e)) {
            x0 = Math.min(x0, x)
            x1 = Math.max(x1, x)
            y0 = Math.min(y0, y)
            y1 = Math.max(y1, y)
          }
        }
      }
      expect(x0, s).toBeGreaterThanOrEqual(EYE_BOX.x0 - 1e-9)
      expect(x1, s).toBeLessThanOrEqual(EYE_BOX.x1 + 1e-9)
      expect(y0, s).toBeGreaterThanOrEqual(EYE_BOX.y0 - 1e-9)
      expect(y1, s).toBeLessThanOrEqual(EYE_BOX.y1 + 1e-9)
    }
  })

  it("moves the sash only where a state means it: found lifts it, resting draws the tails", () => {
    for (const s of STATE_NAMES) {
      for (const t of times(s)) {
        const { sash } = sampleSmooth(s, t)
        const here = locateSmooth(s, t).state
        if (here !== "found") {
          // The tail of found's settle may still be in idle's first moments.
          if (s !== "found") expect(Math.abs(sash.lift), `${s} @${t}`).toBeLessThan(1e-6)
        }
        if (s !== "resting") expect(sash.inset).toBeLessThan(1e-6)
        expect(sash.lift).toBeGreaterThanOrEqual(-0.5 - 1e-9)
      }
    }
    expect(sampleSmooth("found", 300).sash.lift).toBeLessThan(-0.3)
    expect(sampleSmooth("resting", 4700).sash.inset).toBeGreaterThan(0.8)
    expect(sampleSmooth("resting", 2500).sash.inset).toBeLessThan(0.1)
  })
})

describe("the beats match the pixel engine", () => {
  const openness = (s: Parameters<typeof sampleSmooth>[0], t: number) => sampleSmooth(s, t).eyes[0].open

  it("idle blinks at 2.8s and 8.2s, and looks left then right", () => {
    expect(openness("idle", 2700)).toBeGreaterThan(0.99)
    expect(openness("idle", 2900)).toBeLessThan(0.1)
    expect(openness("idle", 3100)).toBeGreaterThan(0.9)
    expect(openness("idle", 8300)).toBeLessThan(0.1)
    expect(sampleSmooth("idle", 6000).eyes[0].x).toBeCloseTo(5, 2)
    expect(sampleSmooth("idle", 11500).eyes[0].x).toBeCloseTo(7, 2)
  })

  it("listens with the eyes up", () => {
    expect(sampleSmooth("listening", 1000).eyes[0].y).toBeCloseTo(4.5, 3)
  })

  it("reads left to right, line by line", () => {
    for (let line = 0; line < 3; line++) {
      const at = (i: number) => sampleSmooth("reading", line * 800 + [230, 470, 790][i]).eyes[0]
      expect(at(0).x).toBeLessThan(at(1).x)
      expect(at(1).x).toBeLessThan(at(2).x)
      if (line > 0) expect(at(0).y).toBeGreaterThan(sampleSmooth("reading", (line - 1) * 800 + 230).eyes[0].y)
    }
    expect(openness("reading", 2490)).toBeLessThan(0.1)
  })

  it("widens and flashes twice in found", () => {
    expect(sampleSmooth("found", 400).eyes[0].h).toBeCloseTo(4, 2)
    const flash = (t: number) => sampleSmooth("found", t).sash.flash
    expect(flash(150)).toBeGreaterThan(0.9)
    expect(flash(230)).toBeLessThan(0.1)
    expect(flash(310)).toBeGreaterThan(0.9)
    expect(flash(450)).toBeLessThan(0.01)
  })

  it("moves the pen along the sash from left to right, leaving words", () => {
    let prev = -1
    for (let t = 0; t < 1470; t += 10) {
      const { sash } = sampleSmooth("writing", t)
      expect(sash.pen).toBeGreaterThanOrEqual(prev)
      expect(sash.written).toBeCloseTo(sash.pen, 6)
      prev = sash.pen
    }
    expect(sampleSmooth("writing", 1469).sash.pen).toBeGreaterThan(14.5)
    expect(sampleSmooth("writing", 2200).sash.penOn).toBeLessThan(0.01)
  })

  it("glances toward Approve while waiting", () => {
    const e = sampleSmooth("waiting", 2200).eyes[1]
    expect(e.x).toBeCloseTo(12, 2)
    expect(e.y).toBeCloseTo(6.5, 2)
    expect(sampleSmooth("waiting", 3200).eyes[1].x).toBeCloseTo(10, 2)
  })

  it("squeezes happy in sent, then closes", () => {
    expect(sampleSmooth("sent", 500).eyes[0].arch).toBeGreaterThan(0.99)
    expect(openness("sent", 1055)).toBeLessThan(0.2)
  })

  it("rests with the eyes shut", () => {
    for (const t of [0, 1000, 3000]) expect(openness("resting", t)).toBeLessThan(1e-6)
  })

  it("holds stuck still for good", () => {
    const a = sampleSmooth("stuck", 0)
    for (const t of [10, 1000, 1e9]) expect(sampleSmooth("stuck", t)).toEqual(a)
  })
})

describe("reduced motion and blending", () => {
  it("each still pose is a moment of its own state", () => {
    for (const s of STATE_NAMES) {
      expect(SMOOTH[s].still).toBeLessThan(duration(s))
      expect(stillPose(s)).toEqual(sampleSmooth(s, SMOOTH[s].still))
    }
  })

  it("blends from the pose on screen, ending at the target", () => {
    const a = sampleSmooth("waiting", 2200)
    const b = sampleSmooth("idle", 0)
    expect(blendPose(a, b, 0).eyes).toEqual(a.eyes)
    expect(blendPose(a, b, 1).eyes).toEqual(b.eyes)
    expect(blendPose(a, b, 0.5).eyes[0].x).toBeCloseTo((a.eyes[0].x + b.eyes[0].x) / 2, 6)
  })
})

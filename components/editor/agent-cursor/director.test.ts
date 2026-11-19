import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// The kit's barrel pulls in every component; the engine needs only this hook.
vi.mock("@/components/kit", () => ({ useReducedMotion: () => false }))

import type { OpTarget } from "@/lib/editor/ops"

import { CursorEngine, type Beat, type BeatState } from "./director"

/**
 * The engine in node, under fake timers. The desk is a few stand-in nodes
 * with the handful of DOM methods the director calls, all at fixed places,
 * so a gesture takes real (fake) time and Stop can land mid-gesture.
 */
class FakeNode {
  attrs = new Set<string>()
  style: Record<string, string> = {}
  offsetWidth = 0
  constructor(private rect = { left: 0, top: 0, width: 800, height: 600 }) {}
  setAttribute(name: string) {
    this.attrs.add(name)
  }
  removeAttribute(name: string) {
    this.attrs.delete(name)
  }
  hasAttribute(name: string) {
    return this.attrs.has(name)
  }
  getBoundingClientRect() {
    const { left, top, width, height } = this.rect
    return { left, top, width, height, right: left + width, bottom: top + height }
  }
  closest() {
    return null
  }
  scrollIntoView() {}
  querySelector(_selector: string): FakeNode | null {
    return null
  }
}

/** A press on an element at x = 40 + 300 × index, so each glide has a distance. */
function pressBeat(index: number): Beat {
  const target: OpTarget = { action: "press", kind: "element", trackId: "t", elementId: `e${index}` }
  return { id: `b${index}`, ops: [], target }
}

function setup({ desk = true } = {}) {
  const root = new FakeNode()
  const targets = new Map<string, FakeNode>()
  for (let i = 0; i < 4; i++) targets.set(`element:e${i}`, new FakeNode({ left: 40 + 300 * i, top: 100, width: 20, height: 20 }))
  root.querySelector = (selector: string) => {
    const key = /data-target="(.+)"/.exec(selector)?.[1]
    return (key && targets.get(key)) || null
  }

  const landed: string[] = []
  let beats: BeatState[] = []
  let busy = false
  const engine = new CursorEngine()
  engine.configure({
    root: () => (desk ? (root as unknown as HTMLElement) : null),
    spanUs: () => 1_000_000,
    onLand: (beat) => landed.push(beat.id),
    reduced: false,
    setBeats: (next) => {
      beats = typeof next === "function" ? next(beats) : next
    },
    setBusy: (value) => {
      busy = value
    },
  })
  const cursor = new FakeNode()
  engine.attachCursor(cursor as unknown as HTMLDivElement)
  return { engine, landed, targets, cursor, beats: () => beats, busy: () => busy }
}

beforeEach(() => {
  vi.useFakeTimers()
  // The engine's timers go through `window`; under fake timers these are the fakes.
  vi.stubGlobal("window", globalThis)
  vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: () => "" }))
  vi.stubGlobal("CSS", { escape: (value: string) => value })
})

afterEach(() => {
  vi.useRealTimers()
})

describe("the director's engine", () => {
  it("lands every beat on its own when the run plays out, then parks", async () => {
    const { engine, landed, cursor, beats, busy } = setup()
    engine.begin()
    for (let i = 0; i < 3; i++) engine.push(pressBeat(i))
    engine.finish()
    await vi.runAllTimersAsync()
    expect(landed).toEqual(["b0", "b1", "b2"])
    expect(beats().every((beat) => beat.landed)).toBe(true)
    expect(cursor.hasAttribute("data-parked")).toBe(true)
    expect(busy()).toBe(false)
  })

  it("Stop lands the beat mid-gesture and the queue, in order, once each", async () => {
    const { engine, landed, targets, beats, busy } = setup()
    engine.begin()
    for (let i = 0; i < 4; i++) engine.push(pressBeat(i))
    // b0 presses at once (the first glide is zero); 30 ms on, b1 is gliding.
    await vi.advanceTimersByTimeAsync(0)
    expect(landed).toEqual(["b0"])
    await vi.advanceTimersByTimeAsync(30 + 182)
    expect(landed).toEqual(["b0"])

    engine.stop()
    expect(landed).toEqual(["b0", "b1", "b2", "b3"])
    expect(beats().map((beat) => beat.landed)).toEqual([true, true, true, true])
    expect(busy()).toBe(false)

    // Nothing left to fire, and nothing lands twice.
    await vi.runAllTimersAsync()
    expect(landed).toEqual(["b0", "b1", "b2", "b3"])
    for (const node of targets.values()) expect(node.hasAttribute("data-agent-pressed")).toBe(false)
  })

  it("Stop in the gap after a press does not land that beat again", async () => {
    const { engine, landed } = setup()
    engine.begin()
    engine.push(pressBeat(0))
    engine.push(pressBeat(1))
    await vi.advanceTimersByTimeAsync(0)
    expect(landed).toEqual(["b0"])
    engine.stop()
    expect(landed).toEqual(["b0", "b1"])
  })

  it("Stop clears a control's pressed state its own timer would have cleared", async () => {
    const { engine, targets } = setup()
    engine.begin()
    engine.push(pressBeat(0))
    await vi.advanceTimersByTimeAsync(0)
    expect(targets.get("element:e0")!.hasAttribute("data-agent-pressed")).toBe(true)
    engine.stop()
    expect(targets.get("element:e0")!.hasAttribute("data-agent-pressed")).toBe(false)
  })

  it("lands without the desk, and finish parks", async () => {
    const { engine, landed, busy } = setup({ desk: false })
    engine.begin()
    engine.push(pressBeat(0))
    engine.push(pressBeat(1))
    expect(busy()).toBe(true)
    engine.finish()
    await vi.runAllTimersAsync()
    expect(landed).toEqual(["b0", "b1"])
    expect(busy()).toBe(false)
  })
})

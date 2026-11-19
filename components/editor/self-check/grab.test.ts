import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { allDark, frameAt, type SeekableVideo } from "./grab"

/** `n` RGBA pixels of one colour. */
function pixels(n: number, [r, g, b]: [number, number, number]): number[] {
  return Array.from({ length: n }, () => [r, g, b, 255]).flat()
}

describe("the black-frame probe", () => {
  it("calls an all-black frame dark", () => {
    expect(allDark(pixels(144, [0, 0, 0]))).toBe(true)
  })

  it("holds the line at luma 14", () => {
    expect(allDark(pixels(144, [14, 14, 14]))).toBe(true)
    expect(allDark(pixels(144, [15, 15, 15]))).toBe(false)
  })

  it("weights green over blue, as luma does", () => {
    // Blue alone at 190 is luma 13.7; green alone at 20 is 14.3.
    expect(allDark(pixels(144, [0, 0, 190]))).toBe(true)
    expect(allDark(pixels(144, [0, 20, 0]))).toBe(false)
  })

  it("lets one lit pixel through", () => {
    const data = pixels(144, [0, 0, 0])
    data.splice(143 * 4, 4, 200, 200, 200, 255)
    expect(allDark(data)).toBe(false)
  })

  it("ignores alpha", () => {
    expect(allDark([0, 0, 0, 0, 0, 0, 0, 255])).toBe(true)
  })
})

/**
 * A `<video>` that records what it was asked and fires its events when the
 * test says, so the order of the waits is what is under test.
 */
class FakeVideo implements SeekableVideo {
  readyState = 0
  duration = Number.NaN
  seeking = false
  videoWidth = 0
  videoHeight = 0
  log: string[] = []
  private listeners = new Map<string, Set<() => void>>()
  private time = 0

  get currentTime() {
    return this.time
  }
  set currentTime(value: number) {
    this.log.push(`seek ${value}`)
    this.time = value
  }
  addEventListener(event: string, fn: () => void) {
    this.log.push(`wait ${event}`)
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(fn)
  }
  removeEventListener(event: string, fn: () => void) {
    this.listeners.get(event)?.delete(fn)
  }
  fire(event: string) {
    for (const fn of [...(this.listeners.get(event) ?? [])]) fn()
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal("window", globalThis)
})

afterEach(() => {
  vi.useRealTimers()
})

describe("a frame at an instant", () => {
  it("waits for metadata, then the seek, then a presented frame", async () => {
    const video = new FakeVideo()
    const result = frameAt(video, 2)

    await vi.advanceTimersByTimeAsync(0)
    expect(video.log).toEqual(["wait loadedmetadata", "wait error"])
    video.readyState = 1
    video.duration = 10
    video.fire("loadedmetadata")

    await vi.advanceTimersByTimeAsync(0)
    // The listener goes on before the seek, so a fast `seeked` is not missed.
    expect(video.log.slice(2)).toEqual(["wait seeked", "wait error", "seek 2"])
    video.readyState = 2
    video.videoWidth = 1280
    video.videoHeight = 720
    video.fire("seeked")

    // No frame callback here: the short fallback wait stands in for it.
    await vi.advanceTimersByTimeAsync(250)
    await expect(result).resolves.toBe(true)
  })

  it("uses the browser's frame callback where there is one", async () => {
    const video = Object.assign(new FakeVideo(), {
      readyState: 2,
      duration: 10,
      videoWidth: 640,
      videoHeight: 360,
      requestVideoFrameCallback: vi.fn((fn: () => void) => {
        fn()
        return 1
      }),
    })
    // Already at the instant: no seek, only the presented frame.
    await expect(frameAt(video, 0)).resolves.toBe(true)
    expect(video.requestVideoFrameCallback).toHaveBeenCalledOnce()
    expect(video.log).toEqual([])
  })

  it("waits for data after the seek when none is there yet", async () => {
    const video = Object.assign(new FakeVideo(), { readyState: 1, duration: 10 })
    const result = frameAt(video, 0)
    await vi.advanceTimersByTimeAsync(250)
    expect(video.log).toEqual(["wait loadeddata", "wait error"])
    Object.assign(video, { readyState: 2, videoWidth: 640, videoHeight: 360 })
    video.fire("loadeddata")
    await expect(result).resolves.toBe(true)
  })

  it("keeps a seek inside the clip's length", async () => {
    const video = Object.assign(new FakeVideo(), { readyState: 2, duration: 5, videoWidth: 1, videoHeight: 1 })
    const result = frameAt(video, 9)
    expect(video.log.at(-1)).toBe("seek 4.999")
    video.fire("seeked")
    await vi.advanceTimersByTimeAsync(250)
    await expect(result).resolves.toBe(true)
  })

  it("gives up when the seek never lands", async () => {
    const video = Object.assign(new FakeVideo(), { readyState: 2, duration: 10 })
    const result = frameAt(video, 3)
    await vi.advanceTimersByTimeAsync(4000)
    await expect(result).resolves.toBe(false)
  })

  it("gives up on an error while waiting", async () => {
    const video = new FakeVideo()
    const result = frameAt(video, 1)
    video.fire("error")
    await expect(result).resolves.toBe(false)
  })

  it("reports no frame when the video has no picture", async () => {
    const video = Object.assign(new FakeVideo(), { readyState: 2, duration: 10 })
    const result = frameAt(video, 0)
    await vi.advanceTimersByTimeAsync(250)
    await expect(result).resolves.toBe(false)
  })
})

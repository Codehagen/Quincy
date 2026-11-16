import { describe, expect, it } from "vitest"

import { collectToolOutput, YieldQueue } from "./yield-queue"

describe("YieldQueue", () => {
  it("yields values pushed after iteration starts", async () => {
    const queue = new YieldQueue<number>()
    const seen: number[] = []
    const consume = (async () => {
      for await (const item of queue) seen.push(item)
    })()

    queue.push(1)
    queue.push(2)
    queue.close()
    await consume

    expect(seen).toEqual([1, 2])
  })
})

describe("collectToolOutput", () => {
  it("returns a plain value", async () => {
    expect(await collectToolOutput({ ok: true })).toEqual({ ok: true })
  })

  it("keeps the last yield from an async generator", async () => {
    async function* run() {
      yield { n: 1 }
      yield { n: 2 }
    }
    expect(await collectToolOutput(run())).toEqual({ n: 2 })
  })
})

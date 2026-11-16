/**
 * Turns a callback that fires many times into an async iterable of those
 * values, so a tool `execute` generator can `yield` each one.
 */
export class YieldQueue<T> {
  private items: T[] = []
  private waiters: ((result: IteratorResult<T>) => void)[] = []
  private closed = false

  push(item: T) {
    if (this.closed) return
    const waiter = this.waiters.shift()
    if (waiter) {
      waiter({ value: item, done: false })
      return
    }
    this.items.push(item)
  }

  close() {
    this.closed = true
    while (this.waiters.length > 0) {
      this.waiters.shift()?.({ value: undefined as T, done: true })
    }
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<T> {
    while (true) {
      if (this.items.length > 0) {
        yield this.items.shift() as T
        continue
      }
      if (this.closed) return
      const next = await new Promise<IteratorResult<T>>((resolve) => {
        this.waiters.push(resolve)
      })
      if (next.done) return
      yield next.value
    }
  }
}

export async function collectToolOutput(value: unknown): Promise<unknown> {
  if (
    value &&
    typeof value === "object" &&
    Symbol.asyncIterator in value
  ) {
    let last: unknown
    for await (const item of value as AsyncIterable<unknown>) last = item
    return last
  }
  return value
}

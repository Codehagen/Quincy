/**
 * The undo history as stacks of named entries (use-document.ts).
 *
 * Each change that can be undone gets an id, and the id moves with it: undo
 * takes it from the undo stack to the redo stack, redo takes it back. A run's
 * checkpoint in the margin keeps the id of the entry its run committed, and
 * asks where that entry is now. Comparing stack depths could not tell two
 * runs apart: a run undone and a new run made in its place leave the depth
 * where the first run left it.
 */

export type Entry<T> = { id: number; value: T }

export type History<T> = {
  present: T
  /** Oldest first; the last is the next undo. Each holds the value before its change. */
  past: Entry<T>[]
  /** Newest undo first; the first is the next redo. Each holds the value after its change. */
  future: Entry<T>[]
  nextId: number
}

export function createHistory<T>(present: T): History<T> {
  return { present, past: [], future: [], nextId: 1 }
}

/** A new change: one undo entry. Any redo is gone, as the timeline forked. */
export function commit<T>(history: History<T>, next: T): History<T> {
  return {
    present: next,
    past: [...history.past, { id: history.nextId, value: history.present }],
    future: [],
    nextId: history.nextId + 1,
  }
}

/** A change that joins the entry on top (a run's later batches). The redo stack still goes. */
export function amend<T>(history: History<T>, next: T): History<T> {
  return { ...history, present: next, future: [] }
}

export function undo<T>(history: History<T>): History<T> {
  const top = history.past.at(-1)
  if (!top) return history
  return {
    ...history,
    present: top.value,
    past: history.past.slice(0, -1),
    future: [{ id: top.id, value: history.present }, ...history.future],
  }
}

export function redo<T>(history: History<T>): History<T> {
  const [top, ...rest] = history.future
  if (!top) return history
  return {
    ...history,
    present: top.value,
    past: [...history.past, { id: top.id, value: history.present }],
    future: rest,
  }
}

/** The ids on each stack, in the stacks' own order. */
export type HistoryIds = { undo: number[]; redo: number[] }

export function idsOf(history: History<unknown>): HistoryIds {
  return { undo: history.past.map((e) => e.id), redo: history.future.map((e) => e.id) }
}

/**
 * Where one entry is now, for its checkpoint.
 *
 * - `undo`: on top of the undo stack; Undo takes exactly it back.
 * - `applied`: still in the document, with later changes on top of it.
 * - `redo`: undone, and next to redo.
 * - `undone`: undone, with other undos in front of it.
 * - `gone`: on neither stack. It was undone and then a new change forked the
 *   history, so nothing can bring it back.
 */
export type EntryState = "undo" | "applied" | "redo" | "undone" | "gone"

export function entryState(ids: HistoryIds, id: number | null): EntryState {
  if (id === null) return "gone"
  if (ids.undo.at(-1) === id) return "undo"
  if (ids.undo.includes(id)) return "applied"
  if (ids.redo[0] === id) return "redo"
  if (ids.redo.includes(id)) return "undone"
  return "gone"
}

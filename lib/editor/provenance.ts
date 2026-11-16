import type { Author, Provenance, TimelineElement } from "./types"

/**
 * Field-level authorship.
 *
 * See the note in ./types.ts for why this is per field rather than per element.
 * The short version: the agent trims a clip you placed, and per-element
 * tracking would hand it your placement too, so undoing its run would move your
 * clip. Here `trimStartUs` belongs to the agent and `startUs` stays yours.
 */

export function createProvenance(author: Author): Provenance {
  return { createdBy: author, lastEditedBy: author, fields: {} }
}

/**
 * Record that `author` wrote these fields.
 *
 * Paths are the same strings the ops use — `trimStartUs`, `transform.position.x`
 * — so a patch and its provenance never describe different things.
 *
 * Writing zero fields is a no-op rather than a `lastEditedBy` bump. An op that
 * changed nothing did not edit the element, and marking it would make undo
 * offer to revert a change that was never made.
 */
export function stampFields(
  provenance: Provenance,
  author: Author,
  paths: string[]
): Provenance {
  if (paths.length === 0) return provenance

  const fields = { ...provenance.fields }
  for (const path of paths) fields[path] = author

  return { ...provenance, lastEditedBy: author, fields }
}

/** Who last wrote this field, falling back to whoever created the element. */
export function fieldAuthor(provenance: Provenance, path: string): Author {
  return provenance.fields[path] ?? provenance.createdBy
}

/**
 * Whether the timeline should mark this element as the agent's work.
 *
 * True when the agent made it, or when it made the last edit. An element you
 * created and then asked the agent to tighten *is* partly its work, and hiding
 * that would make the colour a lie. Per-field detail is there for anyone who
 * wants to render it more finely.
 */
export function isAgentAuthored(provenance: Provenance): boolean {
  return provenance.createdBy === "agent" || provenance.lastEditedBy === "agent"
}

/**
 * Fields on this element that the given author last wrote.
 *
 * What undo reads. Reverting an agent run means restoring exactly these paths
 * from the pre-run snapshot and leaving everything else where the user put it.
 */
export function fieldsBy(provenance: Provenance, author: Author): string[] {
  return Object.entries(provenance.fields)
    .filter(([, who]) => who === author)
    .map(([path]) => path)
}

/**
 * Compare two versions of an element and report which fields actually moved.
 *
 * Ops call this instead of trusting the keys in a patch, because a patch that
 * sets `volume: 1` on an element already at 1 has not edited anything. Without
 * the check, re-running the agent on an unchanged project would repaint the
 * whole timeline as agent-authored.
 *
 * Compares one level into plain objects, which covers `transform` and `style`.
 * Arrays and deeper structures compare whole — a keyframe list is meaningful as
 * a unit, and a per-index diff of it would produce paths nothing else uses.
 */
export function changedPaths(
  before: TimelineElement,
  after: TimelineElement
): string[] {
  const paths: string[] = []
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])

  for (const key of keys) {
    if (key === "provenance") continue

    const a = (before as Record<string, unknown>)[key]
    const b = (after as Record<string, unknown>)[key]
    if (Object.is(a, b)) continue

    if (isPlainObject(a) && isPlainObject(b)) {
      const nested = new Set([...Object.keys(a), ...Object.keys(b)])
      for (const inner of nested) {
        if (!deepEqual(a[inner], b[inner])) paths.push(`${key}.${inner}`)
      }
      continue
    }

    if (!deepEqual(a, b)) paths.push(key)
  }

  return paths
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  )
}

/**
 * Structural equality by serialisation.
 *
 * Everything in the document is JSON by construction — it round-trips through
 * Postgres and the wire on every save — so key order is stable and there are no
 * classes, Dates or undefined values to trip on.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  return JSON.stringify(a) === JSON.stringify(b)
}

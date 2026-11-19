import type { EditOp } from "./ops"
import type { Word } from "./transcript"
import type { CaptionElement, CaptionToken, Scene } from "./types"

/**
 * Fixing what the transcriber got wrong, without touching the cut.
 *
 * A correction changes the word's text and nothing else: it keeps its source
 * binding, its timing and its id, so a later cut still finds it. The first
 * correction remembers what was heard (`heard`), so a replace-all never
 * corrects its own correction twice and a word can be put back by hand.
 *
 * Every caption element a correction touches is one `update_element` with its
 * whole token list, so a replace-all across a talk is one revision and one
 * undo, as a single fix is.
 */

export const MAX_WORD_LENGTH = 60

export type Correction = { tokenId: string; text: string }

/** Correct individual words by token id. */
export function correctWords(scene: Scene, corrections: Correction[]): EditOp[] {
  const wanted = new Map<string, string>()
  for (const { tokenId, text } of corrections) {
    const clean = text.replace(/\s+/g, " ").trim().slice(0, MAX_WORD_LENGTH)
    if (clean) wanted.set(tokenId, clean)
  }
  if (wanted.size === 0) return []
  return rewrite(scene, (token) => wanted.get(token.id) ?? null)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * The words a find matches, for the transcript to show before anything
 * changes. Whole words only and case-insensitive: "Ai" finds "AI," but not
 * "said".
 */
export function findWords(scene: Scene, find: string): CaptionToken[] {
  const pattern = wordPattern(find)
  if (!pattern) return []
  return captionsOf(scene).flatMap((caption) =>
    caption.tokens.filter((token) => pattern.test(token.text))
  )
}

function wordPattern(find: string): RegExp | null {
  const needle = find.trim()
  if (!needle || /\s/.test(needle)) return null
  return new RegExp(`^([^\\p{L}\\p{N}]*)${escapeRegExp(needle)}([^\\p{L}\\p{N}]*)$`, "iu")
}

/**
 * Replace every whole-word match of `find` with `replace`, keeping the
 * punctuation around it: "quincy," becomes "Quincy,".
 */
export function replaceWords(scene: Scene, find: string, replace: string): EditOp[] {
  const pattern = wordPattern(find)
  const to = replace.replace(/\s+/g, " ").trim().slice(0, MAX_WORD_LENGTH)
  if (!pattern || !to) return []
  return rewrite(scene, (token) => {
    const match = pattern.exec(token.text)
    if (!match) return null
    return `${match[1]}${to}${match[2]}`
  })
}

function captionsOf(scene: Scene): CaptionElement[] {
  return scene.tracks
    .filter((track) => track.kind === "caption")
    .flatMap((track) => track.elements)
    .filter((element): element is CaptionElement => element.kind === "caption")
}

function rewrite(
  scene: Scene,
  next: (token: CaptionToken) => string | null
): EditOp[] {
  const ops: EditOp[] = []
  for (const track of scene.tracks) {
    if (track.kind !== "caption") continue
    for (const element of track.elements) {
      if (element.kind !== "caption") continue
      let changed = false
      const tokens = element.tokens.map((token) => {
        const text = next(token)
        if (text === null || text === token.text) return token
        changed = true
        return { ...token, text, heard: token.heard ?? token.text }
      })
      if (!changed) continue
      ops.push({
        op: "update_element",
        sceneId: scene.id,
        trackId: track.id,
        elementId: element.id,
        patch: { tokens, name: tokens.map((token) => token.text).join(" ") },
        target: {
          action: "press",
          kind: "element",
          trackId: track.id,
          elementId: element.id,
        },
      })
    }
  }
  return ops
}

/**
 * Carry the person's corrections into a rebuilt caption lane (a new grouping,
 * a restyle from the transcript), matched by the recording instant each word
 * was spoken at, so a rebuild never brings back a word they fixed.
 */
export function keepCorrections(scene: Scene, ops: EditOp[]): EditOp[] {
  const fixed = new Map<string, { text: string; heard: string }>()
  for (const caption of captionsOf(scene)) {
    for (const token of caption.tokens) {
      if (token.heard === undefined) continue
      fixed.set(`${token.sourceMediaId}:${token.sourceStartUs}`, {
        text: token.text,
        heard: token.heard,
      })
    }
  }
  if (fixed.size === 0) return ops
  return ops.map((op) => {
    if (op.op !== "replace_elements") return op
    return {
      ...op,
      elements: op.elements.map((element) => {
        if (element.kind !== "caption") return element
        const tokens = element.tokens.map((token) => {
          const fix = fixed.get(`${token.sourceMediaId}:${token.sourceStartUs}`)
          return fix ? { ...token, text: fix.text, heard: fix.heard } : token
        })
        return { ...element, tokens, name: tokens.map((token) => token.text).join(" ") }
      }),
    }
  })
}

/**
 * The words the captions say now, in recording time, for regrouping them
 * without going back to the transcript: corrections and captions brought in
 * from a subtitle file stay as they are.
 */
export function captionWords(scene: Scene, mediaId: string): Word[] {
  return captionsOf(scene)
    .flatMap((caption) => caption.tokens)
    .filter((token) => token.sourceMediaId === mediaId)
    .sort((a, b) => a.sourceStartUs - b.sourceStartUs)
    .map((token) => ({
      text: token.text,
      startUs: token.sourceStartUs,
      endUs: token.sourceEndUs,
      confidence: 1,
      ...(token.speaker !== undefined ? { speaker: token.speaker } : {}),
    }))
}

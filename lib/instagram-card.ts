import { encode } from "jpeg-js"

import { GLYPH_HEIGHT, GLYPH_WIDTH, glyphRows } from "./instagram-font"

/**
 * The picture an Instagram post is.
 *
 * Instagram's publish API has no text-only post. v1 draws the approved
 * caption — the same three beats, the number still on its own line — onto
 * a 4:5 JPEG and hands Meta a URL. It does not invent a second piece of
 * writing, and it does not call a model. The caption underneath is the
 * approved text unchanged.
 *
 * 1088×1360 is 4:5 exactly, inside Meta's 4:5–1.91:1 window, and both
 * sides divide by 16 so the encoder's chroma blocks land on the edge.
 * Width sits between the 320 floor and the 1440 ceiling.
 */

export const CARD_WIDTH = 1088
export const CARD_HEIGHT = 1360

const MARGIN_X = 72
const MARGIN_Y = 96
const SCALE = 6
const ADVANCE = (GLYPH_WIDTH + 1) * SCALE
const LINE = (GLYPH_HEIGHT + 3) * SCALE

const PAPER = [247, 246, 243] as const
const INK = [26, 26, 26] as const

/** How many characters fit on one line of the card. */
export function cardColumns(): number {
  return Math.floor((CARD_WIDTH - MARGIN_X * 2) / ADVANCE)
}

function wrap(text: string, columns: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const lines: string[] = []
  let line = ""
  for (const word of words) {
    const parts =
      word.length <= columns
        ? [word]
        : (word.match(new RegExp(`.{1,${columns}}`, "g")) ?? [word])
    for (const part of parts) {
      const next = line ? `${line} ${part}` : part
      if (next.length <= columns) {
        line = next
      } else {
        if (line) lines.push(line)
        line = part
      }
    }
  }
  if (line) lines.push(line)
  return lines
}

function isHashtagBlock(block: string): boolean {
  const tokens = block.split(/\s+/).filter(Boolean)
  return (
    tokens.length > 0 &&
    tokens.every((token) => /^#[\p{L}\p{N}_]+$/u.test(token))
  )
}

/**
 * The lines the card draws.
 *
 * Up to three blocks — the beats, when the draft was written as beats —
 * with a blank line between them. A block that is only hashtags stays in
 * the caption and off the picture. If that would leave the card empty, the
 * caption itself is drawn, so a hashtag-only draft still has an image.
 */
export function cardLines(caption: string, columns = cardColumns()): string[] {
  const blocks = caption
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
  const story = blocks.filter((block) => !isHashtagBlock(block))
  const chosen = (story.length > 0 ? story : blocks).slice(0, 3)
  const lines: string[] = []
  chosen.forEach((block, index) => {
    if (index > 0) lines.push("")
    // A single newline is a line the draft meant — the number on its own
    // line. Only the blank line between beats was consumed by the split.
    for (const row of block.split("\n")) {
      const trimmed = row.trim()
      if (!trimmed) lines.push("")
      else lines.push(...wrap(trimmed, columns))
    }
  })
  return lines
}

function maxLines(): number {
  return Math.floor((CARD_HEIGHT - MARGIN_Y * 2) / LINE)
}

function paint(
  data: Uint8Array,
  x: number,
  y: number,
  rgb: readonly [number, number, number]
) {
  if (x < 0 || y < 0 || x >= CARD_WIDTH || y >= CARD_HEIGHT) return
  const i = (y * CARD_WIDTH + x) * 4
  data[i] = rgb[0]
  data[i + 1] = rgb[1]
  data[i + 2] = rgb[2]
  data[i + 3] = 255
}

function drawGlyph(
  data: Uint8Array,
  ch: string,
  originX: number,
  originY: number
) {
  const rows = glyphRows(ch)
  for (let row = 0; row < rows.length; row++) {
    const bits = rows[row] ?? 0
    for (let col = 0; col < GLYPH_WIDTH; col++) {
      if (((bits >> (GLYPH_WIDTH - 1 - col)) & 1) === 0) continue
      const x0 = originX + col * SCALE
      const y0 = originY + row * SCALE
      for (let dy = 0; dy < SCALE; dy++) {
        for (let dx = 0; dx < SCALE; dx++) {
          paint(data, x0 + dx, y0 + dy, INK)
        }
      }
    }
  }
}

/**
 * A baseline JPEG of the caption card.
 *
 * `jpeg-js` writes a baseline DCT JPEG, which is the only still format
 * Meta's content publishing accepts. Flat paper compresses to well under
 * the 8 MB ceiling.
 */
export function renderCaptionCard(caption: string): Uint8Array {
  const data = new Uint8Array(CARD_WIDTH * CARD_HEIGHT * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = PAPER[0]
    data[i + 1] = PAPER[1]
    data[i + 2] = PAPER[2]
    data[i + 3] = 255
  }

  const columns = cardColumns()
  let lines = cardLines(caption, columns)
  const room = maxLines()
  if (lines.length > room) {
    lines = lines.slice(0, room)
    const last = lines[room - 1] ?? ""
    lines[room - 1] =
      last.length > 3 ? `${last.slice(0, last.length - 3)}...` : "..."
  }

  lines.forEach((line, index) => {
    const y = MARGIN_Y + index * LINE
    let x = MARGIN_X
    for (const ch of line) {
      drawGlyph(data, ch, x, y)
      x += ADVANCE
    }
  })

  const jpeg = encode({ data, width: CARD_WIDTH, height: CARD_HEIGHT }, 80)
  return new Uint8Array(jpeg.data)
}
